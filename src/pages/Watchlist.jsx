import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi'

const DATA_SOURCES = [
  { value: 'twelvedata', label: 'Twelve Data' },
  { value: 'yahoo', label: 'Yahoo' },
]
const INTERVALS = [
  { value: '1h', label: '1 hour' },
  { value: '4h', label: '4 hour' },
  { value: '1day', label: 'Daily' },
  { value: '1week', label: 'Weekly' },
]

const SIGNAL_STYLE = {
  strong_buy: 'text-profit',
  weak_buy: 'text-profit',
  hold: 'text-text-muted',
  partial_sell: 'text-loss',
  strong_sell: 'text-loss',
}
const SIGNAL_LABEL = {
  strong_buy: 'Strong buy',
  weak_buy: 'Weak buy (re-entry)',
  hold: 'Hold',
  partial_sell: 'Partial sell',
  strong_sell: 'Strong sell',
}

const EMPTY_FORM = { symbol: '', dataSource: 'twelvedata', interval: '1day' }

export default function Watchlist() {
  const api = useApi()

  const [entries, setEntries] = useState([])
  const [latestByEntry, setLatestByEntry] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [runStatus, setRunStatus] = useState('')
  const [running, setRunning] = useState(false)

  const loadEntries = () => {
    setLoading(true)
    api
      .getWatchlist()
      .then(setEntries)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    entries.forEach((entry) => {
      api
        .getSnapshots(entry.symbol, entry.dataSource, entry.interval, 1)
        .then((data) => {
          const latest = data.results?.[data.results.length - 1]
          if (latest) setLatestByEntry((prev) => ({ ...prev, [entry.id]: latest }))
        })
        .catch(() => {})
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.symbol.trim()) return
    setError('')
    setSubmitting(true)
    try {
      await api.saveWatchlistEntry({
        symbol: form.symbol.trim(),
        dataSource: form.dataSource,
        interval: form.interval,
        createdAt: new Date().toISOString(),
      })
      setForm(EMPTY_FORM)
      loadEntries()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this symbol from the watchlist?')) return
    try {
      await api.deleteWatchlistEntry(id)
      loadEntries()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRunNow = async () => {
    setRunning(true)
    setRunStatus('')
    try {
      const summary = await api.runSnapshotsCheck()
      setRunStatus(
        `Checked ${summary.groups} symbol(s) — ${summary.updated} snapshot(s) updated, ${summary.trendsClosed} trend(s) closed, ${summary.failed} failed.`,
      )
      loadEntries()
    } catch (err) {
      setRunStatus(err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Watchlist</h1>
        <button
          type="button"
          onClick={handleRunNow}
          disabled={running}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-text-muted hover:text-text disabled:opacity-50"
        >
          {running ? 'Checking…' : 'Check now'}
        </button>
      </div>

      <p className="mb-4 text-sm text-text-muted">
        Symbols here get an hourly snapshot (price, CCI, EMA 20/50, and a signal — strong
        buy/weak buy/hold/partial sell/strong sell — derived from CCI crossing ±100 per the
        entry/re-entry/partial-sell strategy). Claude reads this history when you ask about
        a watched symbol; it doesn't recompute it live.
      </p>

      {runStatus && <p className="mb-4 text-sm text-text-muted">{runStatus}</p>}

      <div className="mb-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-text-muted">Add symbol</h2>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Symbol, e.g. XAU/USD"
            value={form.symbol}
            onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value }))}
            className="w-40 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <select
            value={form.dataSource}
            onChange={(e) => setForm((prev) => ({ ...prev, dataSource: e.target.value }))}
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
          >
            {DATA_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            value={form.interval}
            onChange={(e) => setForm((prev) => ({ ...prev, interval: e.target.value }))}
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
          >
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={submitting || !form.symbol.trim()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Adding…' : 'Add'}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-loss">{error}</p>}
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-text-muted">Watched symbols</h2>

        {loading && <p className="text-sm text-text-muted">Loading…</p>}
        {!loading && entries.length === 0 && (
          <p className="text-sm text-text-muted">Nothing watched yet — add a symbol above.</p>
        )}

        <div className="flex flex-col divide-y divide-border">
          {entries.map((entry) => {
            const latest = latestByEntry[entry.id]
            return (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm text-text">
                    {entry.symbol}{' '}
                    <span className="text-text-muted">
                      ({DATA_SOURCES.find((s) => s.value === entry.dataSource)?.label},{' '}
                      {INTERVALS.find((i) => i.value === entry.interval)?.label})
                    </span>
                  </p>
                  {latest ? (
                    <p className={`text-xs ${SIGNAL_STYLE[latest.signal] ?? 'text-text-muted'}`}>
                      {SIGNAL_LABEL[latest.signal] ?? latest.signal} · CCI{' '}
                      {latest.indicators?.cci?.toFixed(1)} · {latest.price} ·{' '}
                      {new Date(latest.timestamp).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-xs text-text-muted">No snapshot yet — runs on the next hourly check.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(entry.id)}
                  className="rounded border border-border px-2 py-1 text-xs text-loss hover:bg-bg"
                >
                  Remove
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

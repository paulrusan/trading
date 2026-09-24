import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
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
const INDICATORS = [
  { value: 'cci', label: 'CCI', hasLevel: true, defaultPeriod: 14, defaultLevel: 100 },
  { value: 'rsi', label: 'RSI', hasLevel: true, defaultPeriod: 14, defaultLevel: 70 },
  { value: 'stoch', label: 'Stochastic %K', hasLevel: true, defaultPeriod: 14, defaultLevel: 80 },
  { value: 'macd', label: 'MACD histogram crosses 0', hasLevel: false, defaultPeriod: null, defaultLevel: null },
  { value: 'ema', label: 'Price crosses EMA', hasLevel: false, defaultPeriod: 20, defaultLevel: null },
]

const EMPTY_FORM = {
  symbol: '',
  dataSource: 'twelvedata',
  interval: '1day',
  type: 'price',
  priceLevel: '',
  priceDirection: 'above',
  indicatorKey: 'cci',
  indicatorPeriod: 14,
  indicatorLevel: 100,
  indicatorDirection: 'above',
}

function describeAlert(alert) {
  if (alert.type === 'price') {
    return `Price crosses ${alert.priceDirection} ${alert.priceLevel}`
  }
  const def = INDICATORS.find((i) => i.value === alert.indicatorKey)
  const label = def?.label ?? alert.indicatorKey
  if (!def?.hasLevel) return `${label}, ${alert.indicatorDirection}`
  return `${label}(${alert.indicatorPeriod}) crosses ${alert.indicatorDirection} ${alert.indicatorLevel}`
}

export default function Alerts() {
  const { user } = useAuth()
  const api = useApi()

  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ ...EMPTY_FORM, email: user?.email ?? '' })
  const [submitting, setSubmitting] = useState(false)
  const [runStatus, setRunStatus] = useState('')
  const [running, setRunning] = useState(false)

  const loadAlerts = () => {
    setLoading(true)
    api
      .getAlerts()
      .then(setAlerts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadAlerts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  const handleIndicatorChange = (value) => {
    const def = INDICATORS.find((i) => i.value === value)
    setForm((prev) => ({
      ...prev,
      indicatorKey: value,
      indicatorPeriod: def?.defaultPeriod ?? prev.indicatorPeriod,
      indicatorLevel: def?.defaultLevel ?? prev.indicatorLevel,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.symbol.trim()) return
    setError('')
    setSubmitting(true)
    try {
      const payload = {
        symbol: form.symbol.trim(),
        dataSource: form.dataSource,
        interval: form.interval,
        type: form.type,
        email: form.email,
        active: true,
        createdAt: new Date().toISOString(),
        lastTriggeredAt: null,
        lastTriggeredCandleTime: null,
        ...(form.type === 'price'
          ? { priceLevel: Number(form.priceLevel), priceDirection: form.priceDirection }
          : {
              indicatorKey: form.indicatorKey,
              indicatorPeriod: Number(form.indicatorPeriod) || undefined,
              indicatorLevel: Number(form.indicatorLevel) || undefined,
              indicatorDirection: form.indicatorDirection,
            }),
      }
      await api.saveAlert(payload)
      setForm({ ...EMPTY_FORM, email: user?.email ?? '' })
      loadAlerts()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (alert) => {
    try {
      await api.saveAlert({ ...alert, active: !alert.active })
      loadAlerts()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this alert?')) return
    try {
      await api.deleteAlert(id)
      loadAlerts()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRunNow = async () => {
    setRunning(true)
    setRunStatus('')
    try {
      const summary = await api.runAlertsCheck()
      setRunStatus(
        `Checked ${summary.checked} alert(s) across ${summary.groups} symbol(s) — ${summary.triggered} triggered, ${summary.failed} failed.`,
      )
      loadAlerts()
    } catch (err) {
      setRunStatus(err.message)
    } finally {
      setRunning(false)
    }
  }

  const selectedIndicator = INDICATORS.find((i) => i.value === form.indicatorKey)

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Alerts</h1>
        <button
          type="button"
          onClick={handleRunNow}
          disabled={running}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-text-muted hover:text-text disabled:opacity-50"
        >
          {running ? 'Checking…' : 'Check now'}
        </button>
      </div>

      {runStatus && <p className="mb-4 text-sm text-text-muted">{runStatus}</p>}

      <div className="mb-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-text-muted">New alert</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Symbol, e.g. XAU/USD"
              value={form.symbol}
              onChange={(e) => updateField('symbol', e.target.value)}
              className="w-40 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
            <select
              value={form.dataSource}
              onChange={(e) => updateField('dataSource', e.target.value)}
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
              onChange={(e) => updateField('interval', e.target.value)}
              className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            >
              {INTERVALS.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex rounded-md border border-border p-0.5" style={{ width: 'fit-content' }}>
            <button
              type="button"
              onClick={() => updateField('type', 'price')}
              className={`rounded px-3 py-1 text-sm ${
                form.type === 'price' ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
              }`}
            >
              Price
            </button>
            <button
              type="button"
              onClick={() => updateField('type', 'indicator')}
              className={`rounded px-3 py-1 text-sm ${
                form.type === 'indicator' ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
              }`}
            >
              Indicator
            </button>
          </div>

          {form.type === 'price' ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-text-muted">Price crosses</span>
              <select
                value={form.priceDirection}
                onChange={(e) => updateField('priceDirection', e.target.value)}
                className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              >
                <option value="above">above</option>
                <option value="below">below</option>
              </select>
              <input
                type="number"
                step="any"
                placeholder="Level"
                value={form.priceLevel}
                onChange={(e) => updateField('priceLevel', e.target.value)}
                className="w-32 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={form.indicatorKey}
                onChange={(e) => handleIndicatorChange(e.target.value)}
                className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              >
                {INDICATORS.map((i) => (
                  <option key={i.value} value={i.value}>
                    {i.label}
                  </option>
                ))}
              </select>

              {form.indicatorKey !== 'macd' && (
                <label className="flex items-center gap-1.5 text-sm text-text-muted">
                  Period
                  <input
                    type="number"
                    value={form.indicatorPeriod}
                    onChange={(e) => updateField('indicatorPeriod', e.target.value)}
                    className="w-16 rounded-md border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-accent"
                  />
                </label>
              )}

              <select
                value={form.indicatorDirection}
                onChange={(e) => updateField('indicatorDirection', e.target.value)}
                className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              >
                <option value="above">crosses above</option>
                <option value="below">crosses below</option>
              </select>

              {selectedIndicator?.hasLevel && (
                <input
                  type="number"
                  step="any"
                  placeholder="Level"
                  value={form.indicatorLevel}
                  onChange={(e) => updateField('indicatorLevel', e.target.value)}
                  className="w-24 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              )}
            </div>
          )}

          <input
            type="email"
            placeholder="Notify email"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            className="w-full max-w-sm rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />

          {error && <p className="text-sm text-loss">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !form.symbol.trim() || !form.email}
            className="w-fit rounded-md bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Create alert'}
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-text-muted">Your alerts</h2>

        {loading && <p className="text-sm text-text-muted">Loading…</p>}
        {!loading && alerts.length === 0 && (
          <p className="text-sm text-text-muted">No alerts yet — create one above.</p>
        )}

        <div className="flex flex-col divide-y divide-border">
          {alerts.map((alert) => (
            <div key={alert.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="text-sm text-text">
                  {alert.symbol}{' '}
                  <span className="text-text-muted">
                    ({DATA_SOURCES.find((s) => s.value === alert.dataSource)?.label},{' '}
                    {INTERVALS.find((i) => i.value === alert.interval)?.label})
                  </span>
                </p>
                <p className="text-xs text-text-muted">{describeAlert(alert)}</p>
                {alert.lastTriggeredAt && (
                  <p className="text-xs text-text-muted">
                    Last triggered {new Date(alert.lastTriggeredAt).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleActive(alert)}
                  className={`rounded border border-border px-2 py-1 text-xs ${
                    alert.active ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
                  }`}
                >
                  {alert.active ? 'Active' : 'Paused'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(alert.id)}
                  className="rounded border border-border px-2 py-1 text-xs text-loss hover:bg-bg"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TwelveDataChart } from '../components/TwelveDataChart'
import { useApi } from '../hooks/useApi'
import { computeCCI, computeParabolicSAR, computeSMA } from '../lib/indicators'
import { describeCondition, POSITION_LABEL, SIGNAL_LABEL, SIGNAL_MARKER, SIGNAL_STYLE } from '../lib/signalLabels'

const OUTPUT_SIZE_BY_INTERVAL = { '1h': 2000, '4h': 2000, '1day': 5000, '1week': 5000 }
const INTERVALS = [
  { value: '1h', label: '1 hour' },
  { value: '4h', label: '4 hour' },
  { value: '1day', label: 'Daily' },
  { value: '1week', label: 'Weekly' },
]

function toUnixSeconds(iso) {
  return Math.floor(new Date(iso).getTime() / 1000)
}

function hoursBetween(fromIso, toIso) {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / (1000 * 60 * 60)
}

function formatHours(hours) {
  if (hours < 48) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

export default function SnapshotDetail() {
  const api = useApi()
  const [searchParams, setSearchParams] = useSearchParams()
  const symbol = searchParams.get('symbol')
  const dataSource = searchParams.get('dataSource') ?? 'twelvedata'
  const interval = searchParams.get('interval') ?? '1day'

  const handleIntervalChange = (value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('interval', value)
      return next
    })
  }

  const [candles, setCandles] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [trends, setTrends] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [runStatus, setRunStatus] = useState('')
  const [visible, setVisible] = useState({ sma: true, sar: true, cci: true, markers: true })
  const autoBackfillTriedRef = useRef(false)

  const toggleVisible = (key) => setVisible((prev) => ({ ...prev, [key]: !prev[key] }))

  const loadAll = () => {
    if (!symbol) return
    setLoading(true)
    setError('')
    Promise.all([
      api.getMarketData(symbol, interval, OUTPUT_SIZE_BY_INTERVAL[interval] ?? 2000, dataSource),
      api.getSnapshots(symbol, dataSource, interval, 500),
      api.getTrends(symbol, dataSource, interval, 10),
    ])
      .then(([marketData, snapshotData, trendData]) => {
        setCandles(marketData.candles)
        setSnapshots(snapshotData.results)
        setTrends(trendData.results)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    autoBackfillTriedRef.current = false
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, dataSource, interval])

  const handleBackfill = async (silent = false) => {
    setBackfilling(true)
    if (!silent) setRunStatus('')
    try {
      const summary = await api.runSnapshotBackfill(symbol, dataSource, interval)
      setRunStatus(
        `Backfilled from existing history: ${summary.candles} candle(s), ${summary.events} signal event(s), ${summary.trends} completed trend(s) found.`,
      )
      loadAll()
    } catch (err) {
      setRunStatus(err.message)
    } finally {
      setBackfilling(false)
    }
  }

  // Auto-backfill once per symbol/source/interval, only when there's essentially no
  // history yet — a freshly-watched symbol has only ever accumulated forward from
  // whenever it was added, so without this it would sit empty until enough hourly runs
  // pass, even though the candle history needed to reconstruct past trends already exists.
  useEffect(() => {
    if (loading || autoBackfillTriedRef.current) return
    if (candles.length > 0 && trends.length === 0 && snapshots.length <= 1) {
      autoBackfillTriedRef.current = true
      handleBackfill(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, candles, trends, snapshots])

  const handleRunNow = async () => {
    setRunning(true)
    setRunStatus('')
    try {
      const summary = await api.runSnapshotsCheck()
      setRunStatus(`Checked ${summary.groups} symbol(s) — ${summary.updated} updated, ${summary.failed} failed.`)
      loadAll()
    } catch (err) {
      setRunStatus(err.message)
    } finally {
      setRunning(false)
    }
  }

  const latest = snapshots[snapshots.length - 1]

  // Chart's own indicators — CCI(20)/SMA(200)/SAR, since those are exactly what drives
  // the signal shown below (entry/regime/exit) — not the general user-configurable
  // dropdown from ChartAnalysis.jsx. Each one can still be hidden via `visible`, since
  // all three plus markers on screen at once is a lot to look at together.
  const indicators = useMemo(() => {
    if (candles.length === 0) return {}
    return {
      ...(visible.cci && { cci: { period: 20, points: computeCCI(candles, 20) } }),
      ...(visible.sma && { sma: { period: 200, points: computeSMA(candles, 200) } }),
      ...(visible.sar && { sar: { points: computeParabolicSAR(candles) } }),
    }
  }, [candles, visible.cci, visible.sma, visible.sar])

  // Real candle index for each trade's entry/exit, so duration can be shown in bars
  // (candles) as well as hours — hours alone is misleading once weekend/holiday gaps
  // are involved, since "24 hours" isn't the same number of bars on every symbol.
  const candleIndexByTime = useMemo(() => new Map(candles.map((c, i) => [c.time, i])), [candles])
  function candleCount(fromIso, toIso) {
    const fromIdx = candleIndexByTime.get(toUnixSeconds(fromIso))
    const toIdx = candleIndexByTime.get(toUnixSeconds(toIso))
    return fromIdx !== undefined && toIdx !== undefined ? toIdx - fromIdx : null
  }

  // One marker per signal event (every entry/exit) — buy/short as arrows into the bar,
  // exit_long/exit_short as an "X" on the opposite side. Hidden entirely via `visible`.
  const markers = useMemo(() => {
    if (!visible.markers) return []
    return snapshots
      .filter((s) => s.signal !== 'hold' && SIGNAL_MARKER[s.signal])
      .map((s) => ({
        time: toUnixSeconds(s.timestamp),
        ...SIGNAL_MARKER[s.signal],
      }))
  }, [snapshots, visible.markers])

  const recentTrades = trends.slice(-10).reverse()
  const avgTradeHours =
    recentTrades.length > 0
      ? recentTrades.reduce((sum, t) => sum + hoursBetween(t.startTime, t.endTime), 0) / recentTrades.length
      : null

  const elapsedHours = latest?.positionStartTime ? hoursBetween(latest.positionStartTime, latest.timestamp) : null
  const movePct =
    latest?.positionStartPrice && latest.positionStartPrice !== 0
      ? latest.position === 'short'
        ? ((latest.positionStartPrice - latest.price) / latest.positionStartPrice) * 100
        : ((latest.price - latest.positionStartPrice) / latest.positionStartPrice) * 100
      : null

  if (!symbol) {
    return <div className="p-6 text-sm text-loss">Missing symbol query parameter.</div>
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-text">{symbol}</h1>
          <p className="text-xs text-text-muted">{dataSource === 'yahoo' ? 'Yahoo' : 'Twelve Data'}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={interval}
            onChange={(e) => handleIntervalChange(e.target.value)}
            className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text outline-none focus:border-accent"
          >
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => handleBackfill(false)}
            disabled={backfilling}
            title="Reconstruct signal/trend history from the candles already on hand"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text-muted hover:text-text disabled:opacity-50"
          >
            {backfilling ? 'Backfilling…' : 'Backfill history'}
          </button>
          <button
            type="button"
            onClick={handleRunNow}
            disabled={running}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text-muted hover:text-text disabled:opacity-50"
          >
            {running ? 'Checking…' : 'Check now'}
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-text-muted">
        Price above SMA(200) is an uptrend, below it a downtrend. CCI(20) crossing the
        zero line is the entry — up-cross in an uptrend enters a long (green arrow),
        down-cross in a downtrend enters a short (red arrow). Parabolic SAR is the exit —
        a long exits when price crosses below the SAR dots (green ✕), a short exits when
        price crosses above them (red ✕). CCI crossings while a position is already open
        are ignored; only the SAR flip closes it.
      </p>

      {runStatus && <p className="mb-3 text-xs text-text-muted">{runStatus}</p>}
      {error && <p className="mb-3 text-sm text-loss">{error}</p>}
      {loading && <p className="mb-3 text-sm text-text-muted">Loading…</p>}

      {candles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-3">
          {[
            { key: 'sma', label: 'SMA(200)' },
            { key: 'sar', label: 'SAR' },
            { key: 'cci', label: 'CCI(20)' },
            { key: 'markers', label: 'Markers' },
          ].map(({ key, label }) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted hover:text-text"
            >
              <input
                type="checkbox"
                checked={visible[key]}
                onChange={() => toggleVisible(key)}
                className="accent-accent"
              />
              {label}
            </label>
          ))}
        </div>
      )}

      {candles.length > 0 && (
        <div className="mb-6">
          <TwelveDataChart
            candles={candles}
            candleType="heikinAshi"
            indicators={indicators}
            interval={interval}
            height={480}
            markers={markers}
          />
        </div>
      )}

      <div className="mb-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-text-muted">Current condition</h2>
        {latest ? (
          <div className="flex flex-col gap-1">
            <p className={`text-base font-medium ${SIGNAL_STYLE[latest.signal] ?? 'text-text-muted'}`}>
              {SIGNAL_LABEL[latest.signal] ?? latest.signal}
            </p>
            <p className="text-sm text-text-muted">{describeCondition(latest)}</p>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <p className="text-text-muted">
                Price <span className="text-text">{latest.price}</span>
              </p>
              <p className="text-text-muted">
                CCI(20) <span className="text-text">{latest.indicators?.cci?.toFixed(1)}</span>
              </p>
              <p className="text-text-muted">
                SMA(200) <span className="text-text">{latest.indicators?.sma200?.toFixed(4) ?? '—'}</span>
              </p>
              <p className="text-text-muted">
                SAR <span className="text-text">{latest.indicators?.sar?.toFixed(4) ?? '—'}</span>
              </p>
              {elapsedHours !== null && (
                <p className="text-text-muted">
                  {POSITION_LABEL[latest.position] ?? latest.position} position running{' '}
                  <span className="text-text">{formatHours(elapsedHours)}</span>
                </p>
              )}
              {movePct !== null && (
                <p className="text-text-muted">
                  Open P/L{' '}
                  <span className={movePct >= 0 ? 'text-profit' : 'text-loss'}>
                    {movePct >= 0 ? '+' : ''}
                    {movePct.toFixed(2)}%
                  </span>
                </p>
              )}
              <p className="text-text-muted">
                Last checked <span className="text-text">{new Date(latest.timestamp).toLocaleString()}</span>
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            No snapshot yet for this symbol/source/interval — hit "Check now" above, or wait for the next hourly
            run.
          </p>
        )}
      </div>

      <div className="mb-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-1 text-sm font-medium text-text-muted">Estimated trade duration</h2>
        {avgTradeHours === null ? (
          <p className="text-sm text-text-muted">
            Not enough closed trades yet to estimate — needs at least one full entry/exit.
          </p>
        ) : (
          <p className="text-sm text-text">
            The last {recentTrades.length} closed trade{recentTrades.length === 1 ? '' : 's'} averaged{' '}
            <span className="font-medium">{formatHours(avgTradeHours)}</span>.
            {elapsedHours !== null && (
              <>
                {' '}
                The current {POSITION_LABEL[latest.position]?.toLowerCase()} has been running for{' '}
                <span className="font-medium">{formatHours(elapsedHours)}</span> —{' '}
                {elapsedHours < avgTradeHours ? (
                  <>
                    based on that average, roughly{' '}
                    <span className="font-medium">{formatHours(avgTradeHours - elapsedHours)}</span> until a typical
                    exit, if this trade behaves like recent ones.
                  </>
                ) : (
                  <>already past that average — it may be closer to an exit than its entry.</>
                )}
              </>
            )}{' '}
            This is a rough average of past behavior, not a prediction.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-text-muted">Previous {recentTrades.length || 10} trades</h2>
        {recentTrades.length === 0 ? (
          <p className="text-sm text-text-muted">No closed trades yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-text-muted">
                  <th className="pb-2 pr-4 font-normal">Direction</th>
                  <th className="pb-2 pr-4 font-normal">Entry price</th>
                  <th className="pb-2 pr-4 font-normal">Entry time</th>
                  <th className="pb-2 pr-4 font-normal">Exit price</th>
                  <th className="pb-2 pr-4 font-normal">Exit time</th>
                  <th className="pb-2 pr-4 font-normal">Duration</th>
                  <th className="pb-2 font-normal">P/L</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((t) => {
                  const bars = candleCount(t.startTime, t.endTime)
                  return (
                    <tr key={t.id} className="border-t border-border">
                      <td className={`py-2 pr-4 ${t.direction === 'long' ? 'text-profit' : 'text-loss'}`}>
                        {t.direction === 'long' ? 'Long' : 'Short'}
                      </td>
                      <td className="py-2 pr-4 text-text">{t.startPrice}</td>
                      <td className="py-2 pr-4 text-text-muted">{new Date(t.startTime).toLocaleString()}</td>
                      <td className="py-2 pr-4 text-text">{t.endPrice}</td>
                      <td className="py-2 pr-4 text-text-muted">{new Date(t.endTime).toLocaleString()}</td>
                      <td className="py-2 pr-4 text-text">
                        {formatHours(hoursBetween(t.startTime, t.endTime))}
                        {bars !== null && <span className="text-text-muted"> ({bars} candles)</span>}
                      </td>
                      <td className={`py-2 ${t.movePct >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {t.movePct >= 0 ? '+' : ''}
                        {t.movePct.toFixed(2)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-text-muted">
        Signals: {SIGNAL_LABEL.buy}/{SIGNAL_LABEL.short} — CCI(20) crosses the zero line, gated by the
        SMA(200) regime. {SIGNAL_LABEL.exit_long}/{SIGNAL_LABEL.exit_short} — price crosses the Parabolic SAR.
        See the Watchlist page for the full rule.
      </p>
    </div>
  )
}

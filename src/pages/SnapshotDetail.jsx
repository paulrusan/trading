import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TwelveDataChart } from '../components/TwelveDataChart'
import { useApi } from '../hooks/useApi'
import { computeCCI, computeEMA } from '../lib/indicators'
import { describeCondition, PHASE_LABEL, SIGNAL_LABEL, SIGNAL_STYLE } from '../lib/signalLabels'

const OUTPUT_SIZE_BY_INTERVAL = { '1h': 2000, '4h': 2000, '1day': 5000, '1week': 5000 }
const UP_COLOR = '#22c55e'
const DOWN_COLOR = '#ef4444'

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
  const [searchParams] = useSearchParams()
  const symbol = searchParams.get('symbol')
  const dataSource = searchParams.get('dataSource') ?? 'twelvedata'
  const interval = searchParams.get('interval') ?? '1day'

  const [candles, setCandles] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [trends, setTrends] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [runStatus, setRunStatus] = useState('')
  const autoBackfillTriedRef = useRef(false)

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

  // Chart's own indicators, always CCI(14) + EMA 20/50 here since those are exactly
  // what drives the signal shown below — not the general user-configurable dropdown
  // from ChartAnalysis.jsx.
  const indicators = useMemo(() => {
    if (candles.length === 0) return {}
    return {
      cci: { period: 14, points: computeCCI(candles, 14) },
      ema: { period: 20, points: computeEMA(candles, 20) },
      sma: { period: 50, points: computeEMA(candles, 50) }, // reuse the dashed "sma" slot to show EMA50 distinctly from EMA20
    }
  }, [candles])

  // Every closed trend's start, plus the current still-open trend's start (which has
  // no `trends` doc yet since that's only written when a trend closes).
  const markers = useMemo(() => {
    const result = trends.map((t) => ({
      time: toUnixSeconds(t.startTime),
      color: t.direction === 'up' ? UP_COLOR : DOWN_COLOR,
      shape: t.direction === 'up' ? 'arrowUp' : 'arrowDown',
      text: `${t.direction === 'up' ? 'Up' : 'Down'} trend start`,
    }))
    if (latest?.trendStartTime && latest.regime !== 'neutral') {
      result.push({
        time: toUnixSeconds(latest.trendStartTime),
        color: latest.regime === 'up' ? UP_COLOR : DOWN_COLOR,
        shape: latest.regime === 'up' ? 'arrowUp' : 'arrowDown',
        text: 'Current trend start',
        position: 'belowBar',
      })
    }
    return result
  }, [trends, latest])

  const recentTrends = trends.slice(-3).reverse()
  const avgTrendHours =
    recentTrends.length > 0
      ? recentTrends.reduce((sum, t) => sum + hoursBetween(t.startTime, t.endTime), 0) / recentTrends.length
      : null

  const elapsedHours = latest?.trendStartTime ? hoursBetween(latest.trendStartTime, latest.timestamp) : null
  const movePct =
    latest?.trendStartPrice && latest.trendStartPrice !== 0
      ? ((latest.price - latest.trendStartPrice) / latest.trendStartPrice) * 100
      : null

  if (!symbol) {
    return <div className="p-6 text-sm text-loss">Missing symbol query parameter.</div>
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-text">{symbol}</h1>
          <p className="text-xs text-text-muted">
            {dataSource === 'yahoo' ? 'Yahoo' : 'Twelve Data'} · {interval}
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {runStatus && <p className="mb-3 text-xs text-text-muted">{runStatus}</p>}
      {error && <p className="mb-3 text-sm text-loss">{error}</p>}
      {loading && <p className="mb-3 text-sm text-text-muted">Loading…</p>}

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
                CCI(14) <span className="text-text">{latest.indicators?.cci?.toFixed(1)}</span>
              </p>
              <p className="text-text-muted">
                EMA 20 / 50{' '}
                <span className="text-text">
                  {latest.indicators?.ema20?.toFixed(2) ?? '—'} / {latest.indicators?.ema50?.toFixed(2) ?? '—'}
                </span>
              </p>
              {elapsedHours !== null && (
                <p className="text-text-muted">
                  Current trend running <span className="text-text">{formatHours(elapsedHours)}</span>
                </p>
              )}
              {movePct !== null && (
                <p className="text-text-muted">
                  Move since trend start{' '}
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
        <h2 className="mb-1 text-sm font-medium text-text-muted">Estimated trend duration</h2>
        {avgTrendHours === null ? (
          <p className="text-sm text-text-muted">
            Not enough completed trends yet to estimate — needs at least one full reversal.
          </p>
        ) : (
          <p className="text-sm text-text">
            The last {recentTrends.length} completed trend{recentTrends.length === 1 ? '' : 's'} averaged{' '}
            <span className="font-medium">{formatHours(avgTrendHours)}</span>.
            {elapsedHours !== null && (
              <>
                {' '}
                The current trend has been running for{' '}
                <span className="font-medium">{formatHours(elapsedHours)}</span> —{' '}
                {elapsedHours < avgTrendHours ? (
                  <>
                    based on that average, roughly{' '}
                    <span className="font-medium">{formatHours(avgTrendHours - elapsedHours)}</span> of runway left,
                    if this trend behaves like recent ones.
                  </>
                ) : (
                  <>already past that average — it may be closer to its end than its beginning.</>
                )}
              </>
            )}{' '}
            This is a rough average of past behavior, not a prediction.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-text-muted">Previous 3 trends</h2>
        {recentTrends.length === 0 ? (
          <p className="text-sm text-text-muted">No completed trends yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-text-muted">
                  <th className="pb-2 pr-4 font-normal">Direction</th>
                  <th className="pb-2 pr-4 font-normal">Start</th>
                  <th className="pb-2 pr-4 font-normal">End</th>
                  <th className="pb-2 pr-4 font-normal">Duration</th>
                  <th className="pb-2 font-normal">Move</th>
                </tr>
              </thead>
              <tbody>
                {recentTrends.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className={`py-2 pr-4 ${t.direction === 'up' ? 'text-profit' : 'text-loss'}`}>
                      {t.direction === 'up' ? 'Up' : 'Down'}
                    </td>
                    <td className="py-2 pr-4 text-text-muted">{new Date(t.startTime).toLocaleString()}</td>
                    <td className="py-2 pr-4 text-text-muted">{new Date(t.endTime).toLocaleString()}</td>
                    <td className="py-2 pr-4 text-text">{formatHours(hoursBetween(t.startTime, t.endTime))}</td>
                    <td className={`py-2 ${t.movePct >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {t.movePct >= 0 ? '+' : ''}
                      {t.movePct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-text-muted">
        Phases: {PHASE_LABEL.beginning} (just crossed ±100), {PHASE_LABEL.middle} (holding), {PHASE_LABEL.end}{' '}
        (momentum fading, hasn't reversed). Signals are derived only from CCI(14) crossing ±100 — see the Watchlist
        page for the full rule set.
      </p>
    </div>
  )
}

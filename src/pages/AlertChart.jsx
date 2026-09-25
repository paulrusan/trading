import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ComparePanel } from '../components/ComparePanel'
import { IndicatorMenu } from '../components/IndicatorMenu'
import { TwelveDataChart } from '../components/TwelveDataChart'
import { useApi } from '../hooks/useApi'
import { describeAlert } from '../lib/alertDescribe'
import { getChartColors, usePrefersDark, withAlpha } from '../lib/chartColors'
import { DEFAULT_INDICATOR_STATE, INDICATOR_DEFS, computeEnabledIndicators } from '../lib/indicatorDefs'
import { formatDate, formatDateTime } from '../lib/formatDate'
import { computeCCI } from '../lib/indicators'
import { toTradingViewSymbol } from '../lib/tradingViewSymbols'

const OUTPUT_SIZE_BY_INTERVAL = { '1h': 2000, '4h': 2000, '1day': 5000, '1week': 5000 }
const MARKER_COLOR = '#f59e0b' // amber — distinct from the green/red buy/sell markers elsewhere
const INTERVALS = [
  { value: '1h', label: '1 hour' },
  { value: '4h', label: '4 hour' },
  { value: '1day', label: 'Daily' },
  { value: '1week', label: 'Weekly' },
]
const DATA_SOURCE_LABEL = { twelvedata: 'Twelve Data', yahoo: 'Yahoo' }
const SESSION_COUNT = 10
// The validated rule uses different CCI periods for different jobs — 9 on daily (catches a
// trend early), 20 on 1h (needs a few more hours of price action to tell a real bounce from
// a fake one; see CLAUDE.md's "Alerts" section). Switching timeframe here should switch the
// default period the same way, not leave whatever was set on the previous timeframe.
const CCI_PERIOD_BY_INTERVAL = { '1h': 20, '4h': 20, '1day': 9, '1week': 9 }

// EMA is on by default on ChartAnalysis.jsx (see DEFAULT_INDICATOR_STATE), but here CCI is
// the only thing that actually drives the alert/sessions below, so it's the only one on by
// default on this page — EMA/others are still available via the Indicators menu, just not
// pre-enabled clutter.
const INITIAL_INDICATOR_STATE = {
  ...DEFAULT_INDICATOR_STATE,
  ema: { ...DEFAULT_INDICATOR_STATE.ema, enabled: false },
}

function formatHours(hours) {
  if (hours < 48) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

// Viewer's local timezone (no `timeZone` override), not UTC — matches the "Entry (date)"
// column next to it, which is local via formatDate(). `timeZoneName: 'short'` labels which
// zone that actually is, since it's no longer a fixed, always-the-same "UTC" suffix.
function formatTimeOfDay(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  })
}

// The current (still-open) CCI-sign run, plus the last N *completed* ones, in the candles
// currently on screen — computed fresh from whatever candles are loaded for the selected
// interval, not from any persisted history, so it reflects exactly what's visible and
// updates with the interval/CCI-period switcher.
//
// This used to be Heikin Ashi candle-color streaks, which looked wrong next to the CCI
// pane: CCI can sit positive for days straight while individual HA candles still flip
// green/red constantly within that broader move (that noisiness is exactly why the alert
// rule doesn't use raw HA color alone — see CLAUDE.md's "Alerts" section). Sessions now use
// the same CCI sign the alert itself is built on, so what's highlighted here always matches
// what the CCI pane is actually showing.
function computeCciSessions(candles, cciPeriod, count) {
  if (candles.length < 2) return { current: null, completed: [] }
  const cci = computeCCI(candles, cciPeriod)
  if (cci.length < 2) return { current: null, completed: [] }
  const realTimeToIndex = new Map(candles.map((c, i) => [c.time, i]))
  const signOf = (v) => (v >= 0 ? 'up' : 'down')

  const runs = []
  let startPoint = cci[0]
  let dir = signOf(cci[0].value)
  for (let i = 1; i < cci.length; i++) {
    const s = signOf(cci[i].value)
    if (s !== dir) {
      runs.push({ direction: dir, startTime: startPoint.time, endTime: cci[i - 1].time })
      startPoint = cci[i]
      dir = s
    }
  }
  const currentRun = { direction: dir, startTime: startPoint.time, endTime: cci[cci.length - 1].time }

  const toSession = (r) => {
    const startIdx = realTimeToIndex.get(r.startTime)
    const endIdx = realTimeToIndex.get(r.endTime)
    return {
      direction: r.direction,
      startTime: r.startTime,
      endTime: r.endTime,
      candleCount: startIdx !== undefined && endIdx !== undefined ? endIdx - startIdx + 1 : null,
    }
  }

  return {
    current: toSession(currentRun),
    completed: runs.slice(-count).reverse().map(toSession),
  }
}

export default function AlertChart() {
  const api = useApi()
  const isDark = usePrefersDark()
  const colors = getChartColors(isDark)
  const [searchParams, setSearchParams] = useSearchParams()
  const alertId = searchParams.get('alertId')
  const symbol = searchParams.get('symbol')
  const dataSource = searchParams.get('dataSource') ?? 'twelvedata'
  const interval = searchParams.get('interval') ?? '1day'

  const [candles, setCandles] = useState([])
  const [alert, setAlert] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [candleType, setCandleType] = useState('heikinAshi')
  const [indicatorSettings, setIndicatorSettings] = useState(INITIAL_INDICATOR_STATE)
  const [indicatorOpenRequest, setIndicatorOpenRequest] = useState(null)
  const [showCompare, setShowCompare] = useState(false)

  const handleIntervalChange = (value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('interval', value)
      return next
    })
  }

  useEffect(() => {
    const period = CCI_PERIOD_BY_INTERVAL[interval]
    if (!period) return
    setIndicatorSettings((prev) => ({ ...prev, cci: { ...prev.cci, period } }))
  }, [interval])

  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    setError('')
    Promise.all([
      api.getMarketData(symbol, interval, OUTPUT_SIZE_BY_INTERVAL[interval] ?? 2000, dataSource),
      api.getAlerts(),
    ])
      .then(([marketData, alerts]) => {
        setCandles(marketData.candles)
        setAlert(alerts.find((a) => a.id === alertId) ?? null)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, dataSource, interval, alertId])

  const enabledIndicators = useMemo(
    () => computeEnabledIndicators(candles, indicatorSettings),
    [candles, indicatorSettings],
  )

  const toggleIndicator = (key) => {
    setIndicatorSettings((prev) => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } }))
  }
  const updateIndicatorParam = (key, param, value) => {
    if (Number.isNaN(value)) return
    setIndicatorSettings((prev) => ({ ...prev, [key]: { ...prev[key], [param]: value } }))
  }
  const clearIndicators = () => {
    setIndicatorSettings((prev) => {
      const next = {}
      for (const key of Object.keys(prev)) next[key] = { ...prev[key], enabled: false }
      return next
    })
  }
  const handleIndicatorDoubleClick = (key) => {
    setIndicatorOpenRequest({ key, token: Date.now() })
  }

  const tvSymbol = toTradingViewSymbol(symbol, dataSource)
  const studies = [
    ...new Set(INDICATOR_DEFS.filter((def) => indicatorSettings[def.key].enabled).map((def) => def.tvStudy)),
  ]
  const studiesOverrides = {}
  const seenOverrideNames = new Set()
  for (const def of INDICATOR_DEFS) {
    const st = indicatorSettings[def.key]
    if (!st.enabled || !def.tvOverrideName || seenOverrideNames.has(def.tvOverrideName)) continue
    seenOverrideNames.add(def.tvOverrideName)
    for (const p of def.params) {
      if (!p.tvOverrideKey) continue
      studiesOverrides[`${def.tvOverrideName}.${p.tvOverrideKey}`] = st[p.key]
    }
  }

  // Oldest -> newest for the chart markers (TwelveDataChart doesn't care about order,
  // but consistent with how the rest of the app lists history), newest-first for the table.
  const triggerHistory = alert?.triggerHistory ?? []
  const triggerHistoryNewestFirst = useMemo(() => [...triggerHistory].reverse(), [triggerHistory])

  const markers = useMemo(
    () => triggerHistory.map((t) => ({ time: t.candleTime, color: MARKER_COLOR, shape: 'circle', text: 'Alert' })),
    [triggerHistory],
  )

  const { current: currentSession, completed: completedSessions } = useMemo(
    () => computeCciSessions(candles, indicatorSettings.cci.period, SESSION_COUNT),
    [candles, indicatorSettings.cci.period],
  )

  // Light background highlight per session (current + completed) — see
  // lib/trendBandsPrimitive.js. Direction only; TwelveDataChart picks the actual tint.
  const trendBands = useMemo(() => {
    const all = currentSession ? [currentSession, ...completedSessions] : completedSessions
    return all.map((s) => ({ time: s.startTime, endTime: s.endTime, direction: s.direction }))
  }, [currentSession, completedSessions])

  if (!symbol) {
    return <div className="p-6 text-sm text-loss">Missing symbol query parameter.</div>
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-text">{symbol}</h1>
        <p className="text-xs text-text-muted">
          {DATA_SOURCE_LABEL[dataSource] ?? dataSource} · alert trigger history
        </p>
      </div>

      {alert && (
        <div className="mb-3 rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-xs font-medium text-text-muted">This alert's condition</p>
          <p className="text-sm text-text">{describeAlert(alert)}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {alert.matchMode === 'any' ? 'Any condition (OR)' : 'All conditions (AND)'} · triggers on{' '}
            {alert.interval} · notifies {alert.email}
          </p>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-loss">{error}</p>}

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5">
        <div className="flex rounded border border-border p-0.5">
          {INTERVALS.map((i) => (
            <button
              key={i.value}
              type="button"
              onClick={() => handleIntervalChange(i.value)}
              className={`rounded px-2 py-1 text-xs ${
                interval === i.value ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>

        <div className="flex rounded border border-border p-0.5">
          <button
            type="button"
            onClick={() => setCandleType('simple')}
            className={`rounded px-2 py-1 text-xs ${
              candleType === 'simple' ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
            }`}
          >
            Simple
          </button>
          <button
            type="button"
            onClick={() => setCandleType('heikinAshi')}
            className={`rounded px-2 py-1 text-xs ${
              candleType === 'heikinAshi' ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
            }`}
          >
            Heikin Ashi
          </button>
        </div>

        <IndicatorMenu
          settings={indicatorSettings}
          onToggle={toggleIndicator}
          onUpdateParam={updateIndicatorParam}
          onClear={clearIndicators}
          openRequest={indicatorOpenRequest}
        />

        <button
          type="button"
          onClick={() => setShowCompare((v) => !v)}
          disabled={candles.length === 0}
          className={`rounded border border-border px-2 py-1 text-xs disabled:opacity-50 ${
            showCompare ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
          }`}
        >
          Compare
        </button>

        {loading && <span className="text-xs text-text-muted">Loading…</span>}
      </div>

      {candles.length > 0 && (
        <div className="mb-6">
          <TwelveDataChart
            candles={candles}
            candleType={candleType}
            indicators={enabledIndicators}
            interval={interval}
            height={showCompare ? 400 : 480}
            markers={markers}
            trendBands={trendBands}
            onIndicatorDoubleClick={handleIndicatorDoubleClick}
          />
        </div>
      )}

      <ComparePanel
        show={showCompare && candles.length > 0}
        tvSymbol={tvSymbol}
        appInterval={interval}
        candleType={candleType}
        studies={studies}
        studiesOverrides={studiesOverrides}
        isDark={isDark}
        activeSymbol={symbol}
        dataSource={dataSource}
      />

      <div className="mb-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-medium text-text-muted">
          {INTERVALS.find((i) => i.value === interval)?.label ?? interval} sessions — CCI(
          {indicatorSettings.cci.period})
        </h2>

        {currentSession && (
          <p className="mb-4 text-base sm:text-lg">
            <span className="font-medium text-text-muted">Current: </span>
            <span className={`font-semibold ${currentSession.direction === 'up' ? 'text-profit' : 'text-loss'}`}>
              {currentSession.direction === 'up' ? 'Up' : 'Down'}
            </span>{' '}
            <span className="text-sm text-text-muted sm:text-base">
              since {formatDate(currentSession.startTime * 1000)}{' '}
              {formatTimeOfDay(currentSession.startTime)} — running{' '}
              {formatHours((currentSession.endTime - currentSession.startTime) / 3600)} so far (
              {currentSession.candleCount} candle{currentSession.candleCount === 1 ? '' : 's'}), still open.
            </span>
          </p>
        )}

        {completedSessions.length === 0 ? (
          <p className="text-sm text-text-muted">Not enough candle history loaded yet for past sessions.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-text-muted">
                  <th className="pb-2 pr-4 font-normal">Direction</th>
                  <th className="pb-2 pr-4 font-normal">Entry (date)</th>
                  <th className="pb-2 pr-4 font-normal">Entry (time of day)</th>
                  <th className="pb-2 pr-4 font-normal">Duration</th>
                  <th className="pb-2 font-normal">Candles</th>
                </tr>
              </thead>
              <tbody>
                {completedSessions.map((s, i) => (
                  <tr
                    key={i}
                    className="border-t border-border"
                    style={{ backgroundColor: withAlpha(s.direction === 'up' ? colors.profit : colors.loss, 0.08) }}
                  >
                    <td className={`py-2 pr-4 ${s.direction === 'up' ? 'text-profit' : 'text-loss'}`}>
                      {s.direction === 'up' ? 'Up' : 'Down'}
                    </td>
                    <td className="py-2 pr-4 text-text-muted">
                      {formatDate(s.startTime * 1000)}
                    </td>
                    <td className="py-2 pr-4 text-text-muted">{formatTimeOfDay(s.startTime)}</td>
                    <td className="py-2 pr-4 text-text">{formatHours((s.endTime - s.startTime) / 3600)}</td>
                    <td className="py-2 text-text-muted">{s.candleCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-text-muted">
          A "session" here is a run of CCI({indicatorSettings.cci.period}) staying on one
          side of zero on the currently selected timeframe — the same indicator/period the
          alert itself uses — computed fresh from the candles on screen right now, not from
          any saved history. Switch timeframe above (or the CCI period in Indicators ▾) to
          recompute. Highlighted on the chart above and in the row shading here: light green
          (up) / light red (down).
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-text-muted">
          Last {triggerHistoryNewestFirst.length} trigger{triggerHistoryNewestFirst.length === 1 ? '' : 's'}
        </h2>
        {!alert ? (
          <p className="text-sm text-text-muted">Alert not found — it may have been deleted.</p>
        ) : triggerHistoryNewestFirst.length === 0 ? (
          <p className="text-sm text-text-muted">This alert hasn't triggered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-text-muted">
                  <th className="pb-2 pr-4 font-normal">Candle time</th>
                  <th className="pb-2 font-normal">Alerted at</th>
                </tr>
              </thead>
              <tbody>
                {triggerHistoryNewestFirst.map((t, i) => (
                  <tr
                    key={i}
                    className="border-t border-border"
                    style={{
                      backgroundColor: withAlpha(i % 2 === 0 ? colors.profit : colors.loss, 0.06),
                    }}
                  >
                    <td className="py-2 pr-4 text-text">{formatDateTime(t.candleTime * 1000)}</td>
                    <td className="py-2 text-text-muted">{formatDateTime(t.triggeredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

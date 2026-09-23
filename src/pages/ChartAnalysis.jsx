import { CandlestickSeries, HistogramSeries, LineSeries, LineStyle, createChart } from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { getChartColors, usePrefersDark } from '../lib/chartColors'
import { useApi } from '../hooks/useApi'
import {
  computeATR,
  computeBollingerBands,
  computeCCI,
  computeEMA,
  computeMACD,
  computeRSI,
  computeSMA,
  computeStochastic,
  toHeikinAshi,
} from '../lib/indicators'

const SYMBOL_SUGGESTIONS = ['XAU/USD', 'XAG/USD', 'NDX', 'SPX', 'BTC/USD', 'AAPL']
const INTERVALS = [
  { value: '1h', label: '1 hour' },
  { value: '4h', label: '4 hour' },
  { value: '1day', label: 'Daily' },
  { value: '1week', label: 'Weekly' },
]
const OUTPUT_SIZE_BY_INTERVAL = {
  '1h': 5000,
  '4h': 5000,
  '1day': 5000,
  '1week': 5000,
}
// How much calendar history is visible by default — bigger timeframes show more.
const DEFAULT_VISIBLE_DAYS = {
  '1h': 30,
  '4h': 90,
  '1day': 365,
  '1week': 365 * 3,
}

const INDICATOR_DEFS = [
  { key: 'ema1', label: 'EMA', pane: 'price', params: [{ key: 'period', label: 'Period', default: 20 }] },
  { key: 'ema2', label: 'EMA', pane: 'price', params: [{ key: 'period', label: 'Period', default: 50 }] },
  { key: 'sma', label: 'SMA', pane: 'price', params: [{ key: 'period', label: 'Period', default: 50 }] },
  {
    key: 'bb',
    label: 'Bollinger Bands',
    pane: 'price',
    params: [
      { key: 'period', label: 'Period', default: 20 },
      { key: 'stdDev', label: 'StdDev', default: 2 },
    ],
  },
  { key: 'cci', label: 'CCI', pane: 'oscillator', params: [{ key: 'period', label: 'Period', default: 14 }] },
  { key: 'rsi', label: 'RSI', pane: 'oscillator', params: [{ key: 'period', label: 'Period', default: 14 }] },
  {
    key: 'macd',
    label: 'MACD',
    pane: 'oscillator',
    params: [
      { key: 'fast', label: 'Fast', default: 12 },
      { key: 'slow', label: 'Slow', default: 26 },
      { key: 'signal', label: 'Signal', default: 9 },
    ],
  },
  { key: 'atr', label: 'ATR', pane: 'oscillator', params: [{ key: 'period', label: 'Period', default: 14 }] },
  {
    key: 'stoch',
    label: 'Stochastic',
    pane: 'oscillator',
    params: [
      { key: 'kPeriod', label: '%K', default: 14 },
      { key: 'dPeriod', label: '%D', default: 3 },
    ],
  },
]
const DEFAULT_ENABLED = new Set(['ema1', 'ema2', 'cci'])
const OSCILLATOR_ORDER = ['cci', 'rsi', 'macd', 'atr', 'stoch']

const DEFAULT_INDICATOR_STATE = Object.fromEntries(
  INDICATOR_DEFS.map((def) => [
    def.key,
    {
      enabled: DEFAULT_ENABLED.has(def.key),
      ...Object.fromEntries(def.params.map((p) => [p.key, p.default])),
    },
  ]),
)

function computeEnabledIndicators(candles, settings) {
  const data = {}
  if (settings.ema1.enabled) {
    data.ema1 = { period: settings.ema1.period, points: computeEMA(candles, settings.ema1.period) }
  }
  if (settings.ema2.enabled) {
    data.ema2 = { period: settings.ema2.period, points: computeEMA(candles, settings.ema2.period) }
  }
  if (settings.sma.enabled) {
    data.sma = { period: settings.sma.period, points: computeSMA(candles, settings.sma.period) }
  }
  if (settings.bb.enabled) {
    data.bb = {
      period: settings.bb.period,
      stdDev: settings.bb.stdDev,
      ...computeBollingerBands(candles, settings.bb.period, settings.bb.stdDev),
    }
  }
  if (settings.cci.enabled) {
    data.cci = { period: settings.cci.period, points: computeCCI(candles, settings.cci.period) }
  }
  if (settings.rsi.enabled) {
    data.rsi = { period: settings.rsi.period, points: computeRSI(candles, settings.rsi.period) }
  }
  if (settings.macd.enabled) {
    data.macd = {
      fast: settings.macd.fast,
      slow: settings.macd.slow,
      signal: settings.macd.signal,
      ...computeMACD(candles, settings.macd.fast, settings.macd.slow, settings.macd.signal),
    }
  }
  if (settings.atr.enabled) {
    data.atr = { period: settings.atr.period, points: computeATR(candles, settings.atr.period) }
  }
  if (settings.stoch.enabled) {
    data.stoch = {
      kPeriod: settings.stoch.kPeriod,
      dPeriod: settings.stoch.dPeriod,
      ...computeStochastic(candles, settings.stoch.kPeriod, settings.stoch.dPeriod),
    }
  }
  return data
}

function last(points) {
  return points?.[points.length - 1]?.value
}

export default function ChartAnalysis() {
  const api = useApi()
  const isDark = usePrefersDark()
  const colors = getChartColors(isDark)

  const [symbolInput, setSymbolInput] = useState('XAU/USD')
  const [interval, setInterval_] = useState('1day')
  const [activeSymbol, setActiveSymbol] = useState(null)
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [candleType, setCandleType] = useState('heikinAshi')
  const [indicatorSettings, setIndicatorSettings] = useState(DEFAULT_INDICATOR_STATE)
  const [indicatorMenuOpen, setIndicatorMenuOpen] = useState(false)
  const [openSettingsKey, setOpenSettingsKey] = useState(null)

  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState('')

  const priceContainerRef = useRef(null)
  const chartRef = useRef(null)
  const indicatorMenuRef = useRef(null)

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

  useEffect(() => {
    if (!indicatorMenuOpen) return
    const handleClickOutside = (e) => {
      if (indicatorMenuRef.current && !indicatorMenuRef.current.contains(e.target)) {
        setIndicatorMenuOpen(false)
        setOpenSettingsKey(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [indicatorMenuOpen])

  const loadChart = async (e, overrideInterval) => {
    e?.preventDefault()
    const sym = symbolInput.trim()
    const int = overrideInterval ?? interval
    if (!sym) return
    setLoading(true)
    setError('')
    setMessages([])
    try {
      const data = await api.getMarketData(sym, int, OUTPUT_SIZE_BY_INTERVAL[int] ?? 500)
      setCandles(data.candles)
      setActiveSymbol(data.symbol)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleIntervalChange = (value) => {
    setInterval_(value)
    loadChart(undefined, value)
  }

  useEffect(() => {
    if (!priceContainerRef.current) return

    const chart = createChart(priceContainerRef.current, {
      width: priceContainerRef.current.clientWidth,
      height: 480,
      layout: { background: { color: colors.surface }, textColor: colors.textMuted },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      timeScale: { borderColor: colors.grid },
      rightPriceScale: { borderColor: colors.grid },
    })
    chartRef.current = chart

    const resizeObserver = new ResizeObserver(() => {
      if (priceContainerRef.current) {
        chart.applyOptions({ width: priceContainerRef.current.clientWidth })
      }
    })
    resizeObserver.observe(priceContainerRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || candles.length === 0) return

    const displayCandles = candleType === 'heikinAshi' ? toHeikinAshi(candles) : candles
    const enabled = computeEnabledIndicators(candles, indicatorSettings)
    const series = []

    const candleSeries = chart.addSeries(
      CandlestickSeries,
      {
        upColor: colors.profit,
        downColor: colors.loss,
        borderVisible: false,
        wickUpColor: colors.profit,
        wickDownColor: colors.loss,
      },
      0,
    )
    candleSeries.setData(displayCandles)
    series.push(candleSeries)

    if (enabled.ema1) {
      const s = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, 0)
      s.setData(enabled.ema1.points)
      series.push(s)
    }
    if (enabled.ema2) {
      const s = chart.addSeries(LineSeries, { color: colors.textMuted, lineWidth: 1 }, 0)
      s.setData(enabled.ema2.points)
      series.push(s)
    }
    if (enabled.sma) {
      const s = chart.addSeries(
        LineSeries,
        { color: colors.accent, lineWidth: 1, lineStyle: LineStyle.Dashed },
        0,
      )
      s.setData(enabled.sma.points)
      series.push(s)
    }
    if (enabled.bb) {
      const basisSeries = chart.addSeries(LineSeries, { color: colors.textMuted, lineWidth: 1 }, 0)
      basisSeries.setData(enabled.bb.basis)
      series.push(basisSeries)
      const upperSeries = chart.addSeries(
        LineSeries,
        { color: colors.textMuted, lineWidth: 1, lineStyle: LineStyle.Dotted },
        0,
      )
      upperSeries.setData(enabled.bb.upper)
      series.push(upperSeries)
      const lowerSeries = chart.addSeries(
        LineSeries,
        { color: colors.textMuted, lineWidth: 1, lineStyle: LineStyle.Dotted },
        0,
      )
      lowerSeries.setData(enabled.bb.lower)
      series.push(lowerSeries)
    }

    const enabledOscillators = OSCILLATOR_ORDER.filter((key) => enabled[key])
    enabledOscillators.forEach((key, idx) => {
      const paneIndex = idx + 1
      if (key === 'cci' || key === 'rsi' || key === 'atr') {
        const s = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, paneIndex)
        s.setData(enabled[key].points)
        series.push(s)
      } else if (key === 'macd') {
        const macdSeries = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, paneIndex)
        macdSeries.setData(enabled.macd.macdLine)
        series.push(macdSeries)

        const signalSeries = chart.addSeries(LineSeries, { color: colors.textMuted, lineWidth: 1 }, paneIndex)
        signalSeries.setData(enabled.macd.signalLine)
        series.push(signalSeries)

        const histSeries = chart.addSeries(HistogramSeries, { color: colors.profit }, paneIndex)
        histSeries.setData(
          enabled.macd.histogram.map((p) => ({
            time: p.time,
            value: p.value,
            color: p.value >= 0 ? colors.profit : colors.loss,
          })),
        )
        series.push(histSeries)
      } else if (key === 'stoch') {
        const kSeries = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, paneIndex)
        kSeries.setData(enabled.stoch.k)
        series.push(kSeries)

        const dSeries = chart.addSeries(LineSeries, { color: colors.textMuted, lineWidth: 1 }, paneIndex)
        dSeries.setData(enabled.stoch.d)
        series.push(dSeries)
      }
    })

    return () => {
      for (const s of series) chart.removeSeries(s)
    }
  }, [candles, colors, candleType, indicatorSettings])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || candles.length === 0) return
    const firstTime = candles[0]?.time
    const lastTime = candles[candles.length - 1]?.time
    if (!firstTime || !lastTime) return
    const spanSeconds = (DEFAULT_VISIBLE_DAYS[interval] ?? 365) * 24 * 60 * 60
    const fromTime = Math.max(firstTime, lastTime - spanSeconds)
    chart.timeScale().setVisibleRange({ from: fromTime, to: lastTime })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles])

  const send = async (text) => {
    if (!text.trim() || sending || candles.length === 0) return
    setChatError('')
    const userMessage = { role: 'user', content: text }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setChatInput('')
    setSending(true)
    try {
      const heikinAshi = toHeikinAshi(candles)
      const enabled = computeEnabledIndicators(candles, indicatorSettings)
      const indicatorContext = {}
      for (const [key, val] of Object.entries(enabled)) {
        if (val.points) {
          indicatorContext[key] = { ...val, latest: last(val.points), recent: val.points.slice(-20) }
          delete indicatorContext[key].points
        } else if (key === 'bb') {
          indicatorContext.bb = {
            period: val.period,
            stdDev: val.stdDev,
            latestBasis: last(val.basis),
            latestUpper: last(val.upper),
            latestLower: last(val.lower),
          }
        } else if (key === 'macd') {
          indicatorContext.macd = {
            fast: val.fast,
            slow: val.slow,
            signal: val.signal,
            latestMacd: last(val.macdLine),
            latestSignal: last(val.signalLine),
            latestHistogram: last(val.histogram),
          }
        } else if (key === 'stoch') {
          indicatorContext.stoch = {
            kPeriod: val.kPeriod,
            dPeriod: val.dPeriod,
            latestK: last(val.k),
            latestD: last(val.d),
          }
        }
      }

      const context = {
        type: 'chart_analysis',
        symbol: activeSymbol,
        interval,
        candleType,
        latestPrice: candles[candles.length - 1]?.close,
        heikinAshiCandles: heikinAshi.slice(-50),
        indicators: indicatorContext,
      }
      const history = messages.slice(-10)
      const { reply } = await api.askAssistant(text, context, history)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      setChatError(err.message)
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setSending(false)
    }
  }

  const handleChatSubmit = (e) => {
    e.preventDefault()
    send(chatInput)
  }

  return (
    <div className="p-4 sm:p-6">
      {error && <p className="mb-4 text-sm text-loss">{error}</p>}

      <div className="relative mb-6">
        <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface/90 px-2 py-1.5 backdrop-blur-sm">
          <form onSubmit={loadChart} className="flex items-center gap-1.5">
            <input
              id="symbol"
              type="text"
              list="symbol-suggestions"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              placeholder="Symbol"
              className="w-24 rounded border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-accent"
            />
            <datalist id="symbol-suggestions">
              {SYMBOL_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </form>

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
                candleType === 'heikinAshi'
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              Heikin Ashi
            </button>
          </div>

          <div ref={indicatorMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIndicatorMenuOpen((v) => !v)}
              className="rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
            >
              Indicators ▾
            </button>
            {indicatorMenuOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-surface p-2 shadow-lg">
                {INDICATOR_DEFS.map((def) => {
                  const st = indicatorSettings[def.key]
                  const isSettingsOpen = openSettingsKey === def.key
                  return (
                    <div key={def.key} className="border-b border-border py-1 last:border-0">
                      <div className="flex items-center justify-between gap-1">
                        <label className="flex flex-1 cursor-pointer items-center gap-1.5 text-xs text-text-muted hover:text-text">
                          <input
                            type="checkbox"
                            checked={st.enabled}
                            onChange={() => toggleIndicator(def.key)}
                            className="accent-accent"
                          />
                          {def.label}
                        </label>
                        <button
                          type="button"
                          onClick={() => setOpenSettingsKey(isSettingsOpen ? null : def.key)}
                          title={`${def.label} settings`}
                          aria-label={`${def.label} settings`}
                          className="text-text-muted hover:text-text"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-3.5 w-3.5"
                          >
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                          </svg>
                        </button>
                      </div>
                      {isSettingsOpen && (
                        <div className="mt-1 flex flex-wrap gap-2 pl-5">
                          {def.params.map((p) => (
                            <label key={p.key} className="flex items-center gap-1 text-[11px] text-text-muted">
                              {p.label}
                              <input
                                type="number"
                                value={st[p.key]}
                                onChange={(e) =>
                                  updateIndicatorParam(def.key, p.key, Number(e.target.value))
                                }
                                className="w-12 rounded border border-border bg-bg px-1 py-0.5 text-text outline-none focus:border-accent"
                              />
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={clearIndicators}
            title="Clear all indicators"
            aria-label="Clear all indicators"
            className="rounded border border-border p-1.5 text-text-muted hover:text-loss"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>

          {loading && <span className="text-xs text-text-muted">Loading…</span>}
        </div>

        <div ref={priceContainerRef} className="overflow-hidden rounded-lg border border-border" />
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-text-muted">Ask Claude about this chart</h2>

        {candles.length === 0 && (
          <p className="text-sm text-text-muted">Load a chart above before asking Claude about it.</p>
        )}

        {messages.length > 0 && (
          <div className="mb-3 flex flex-col gap-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[90%] whitespace-pre-wrap rounded-lg px-4 py-2.5 text-sm ${
                  m.role === 'user' ? 'ml-auto bg-accent text-white' : 'bg-bg text-text'
                }`}
              >
                {m.content}
              </div>
            ))}
            {sending && <div className="text-sm text-text-muted">Thinking…</div>}
          </div>
        )}

        {chatError && <p className="mb-2 text-sm text-loss">{chatError}</p>}

        <form onSubmit={handleChatSubmit} className="flex gap-3">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            disabled={candles.length === 0}
            placeholder="e.g. Project the next 10 sessions based on CCI and EMA trend…"
            className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || candles.length === 0 || !chatInput.trim()}
            className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}

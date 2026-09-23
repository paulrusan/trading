import { useEffect, useMemo, useRef, useState } from 'react'
import { usePrefersDark } from '../lib/chartColors'
import { useApi } from '../hooks/useApi'
import { TradingViewWidget } from '../components/TradingViewWidget'
import { TwelveDataChart } from '../components/TwelveDataChart'
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
const TV_INTERVAL = { '1h': '60', '4h': '240', '1day': 'D', '1week': 'W' }
const TV_STYLE = { simple: 1, heikinAshi: 8 }

const INDICATOR_DEFS = [
  { key: 'ema1', label: 'EMA', tvStudy: 'MAExp@tv-basicstudies', params: [{ key: 'period', label: 'Period', default: 20 }] },
  { key: 'ema2', label: 'EMA', tvStudy: 'MAExp@tv-basicstudies', params: [{ key: 'period', label: 'Period', default: 50 }] },
  { key: 'sma', label: 'SMA', tvStudy: 'MASimple@tv-basicstudies', params: [{ key: 'period', label: 'Period', default: 50 }] },
  {
    key: 'bb',
    label: 'Bollinger Bands',
    tvStudy: 'BB@tv-basicstudies',
    params: [
      { key: 'period', label: 'Period', default: 20 },
      { key: 'stdDev', label: 'StdDev', default: 2 },
    ],
  },
  { key: 'cci', label: 'CCI', tvStudy: 'CCI@tv-basicstudies', params: [{ key: 'period', label: 'Period', default: 14 }] },
  { key: 'rsi', label: 'RSI', tvStudy: 'RSI@tv-basicstudies', params: [{ key: 'period', label: 'Period', default: 14 }] },
  {
    key: 'macd',
    label: 'MACD',
    tvStudy: 'MACD@tv-basicstudies',
    params: [
      { key: 'fast', label: 'Fast', default: 12 },
      { key: 'slow', label: 'Slow', default: 26 },
      { key: 'signal', label: 'Signal', default: 9 },
    ],
  },
  { key: 'atr', label: 'ATR', tvStudy: 'ATR@tv-basicstudies', params: [{ key: 'period', label: 'Period', default: 14 }] },
  {
    key: 'stoch',
    label: 'Stochastic',
    tvStudy: 'Stochastic@tv-basicstudies',
    params: [
      { key: 'kPeriod', label: '%K', default: 14 },
      { key: 'dPeriod', label: '%D', default: 3 },
    ],
  },
]
const DEFAULT_ENABLED = new Set(['ema1', 'ema2', 'cci'])

const DEFAULT_INDICATOR_STATE = Object.fromEntries(
  INDICATOR_DEFS.map((def) => [
    def.key,
    {
      enabled: DEFAULT_ENABLED.has(def.key),
      ...Object.fromEntries(def.params.map((p) => [p.key, p.default])),
    },
  ]),
)

function toTradingViewSymbol(symbol) {
  return symbol ? symbol.replace('/', '') : null
}

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
  const [showCompare, setShowCompare] = useState(false)

  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState('')

  const indicatorMenuRef = useRef(null)

  const enabledIndicators = useMemo(
    () => computeEnabledIndicators(candles, indicatorSettings),
    [candles, indicatorSettings],
  )

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

  const studies = [
    ...new Set(
      INDICATOR_DEFS.filter((def) => indicatorSettings[def.key].enabled).map((def) => def.tvStudy),
    ),
  ]

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
      const enabled = enabledIndicators
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

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5">
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
              candleType === 'heikinAshi' ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
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
                              onChange={(e) => updateIndicatorParam(def.key, p.key, Number(e.target.value))}
                              className="w-12 rounded border border-border bg-bg px-1 py-0.5 text-text outline-none focus:border-accent"
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              <p className="mt-1 px-1 text-[10px] text-text-muted">
                Periods here drive Claude's analysis of the underlying data. The chart above shows
                each indicator using TradingView's own default settings.
              </p>
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

        <button
          type="button"
          onClick={() => setShowCompare((v) => !v)}
          disabled={candles.length === 0}
          className={`rounded border border-border px-2 py-1 text-xs disabled:opacity-50 ${
            showCompare ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
          }`}
        >
          Compare with Twelve Data
        </button>

        {loading && <span className="text-xs text-text-muted">Loading…</span>}
      </div>

      <div className="mb-6">
        {activeSymbol ? (
          <TradingViewWidget
            symbol={toTradingViewSymbol(activeSymbol)}
            interval={TV_INTERVAL[interval] ?? 'D'}
            style={TV_STYLE[candleType] ?? 1}
            studies={studies}
            theme={isDark ? 'dark' : 'light'}
            height={showCompare ? 400 : 560}
          />
        ) : (
          <div className="flex h-[560px] items-center justify-center rounded-lg border border-border bg-surface text-sm text-text-muted">
            {loading ? 'Loading…' : 'Enter a symbol above and click Load chart.'}
          </div>
        )}
      </div>

      {showCompare && candles.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-xs text-text-muted">
            Twelve Data — the source Claude actually analyzes. Compare against the TradingView chart
            above to check they agree.
          </p>
          <TwelveDataChart
            candles={candles}
            candleType={candleType}
            indicators={enabledIndicators}
            interval={interval}
            height={400}
          />
        </div>
      )}

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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const INTERVALS = [
  { value: '1h', label: '1 hour' },
  { value: '4h', label: '4 hour' },
  { value: '1day', label: 'Daily' },
  { value: '1week', label: 'Weekly' },
]
const DATA_SOURCES = [
  { value: 'twelvedata', label: 'Twelve Data' },
  { value: 'yahoo', label: 'Yahoo' },
]
const OUTPUT_SIZE_BY_INTERVAL = {
  '1h': 5000,
  '4h': 5000,
  '1day': 5000,
  '1week': 5000,
}
const TV_INTERVAL = { '1h': '60', '4h': '240', '1day': 'D', '1week': 'W' }
const TV_STYLE = { simple: 1, heikinAshi: 8 }

// tvOverrideName/tvOverrideKey map to TradingView's `studies_overrides` key format
// ("<study name>.<input name>"), reverse-engineered from public examples — TradingView
// doesn't document the free widget's exact input names, so these are best-effort and
// silently no-op if wrong.
const INDICATOR_DEFS = [
  {
    key: 'ema',
    label: 'EMA',
    tvStudy: 'MAExp@tv-basicstudies',
    tvOverrideName: 'moving average exponential',
    params: [{ key: 'period', label: 'Period', default: 20, tvOverrideKey: 'length' }],
  },
  {
    key: 'sma',
    label: 'SMA',
    tvStudy: 'MASimple@tv-basicstudies',
    tvOverrideName: 'moving average',
    params: [{ key: 'period', label: 'Period', default: 50, tvOverrideKey: 'length' }],
  },
  {
    key: 'bb',
    label: 'Bollinger Bands',
    tvStudy: 'BB@tv-basicstudies',
    tvOverrideName: 'bollinger bands',
    params: [
      { key: 'period', label: 'Period', default: 20, tvOverrideKey: 'length' },
      { key: 'stdDev', label: 'StdDev', default: 2 },
    ],
  },
  {
    key: 'cci',
    label: 'CCI',
    tvStudy: 'CCI@tv-basicstudies',
    tvOverrideName: 'commodity channel index',
    params: [{ key: 'period', label: 'Period', default: 14, tvOverrideKey: 'length' }],
  },
  {
    key: 'rsi',
    label: 'RSI',
    tvStudy: 'RSI@tv-basicstudies',
    tvOverrideName: 'relative strength index',
    params: [{ key: 'period', label: 'Period', default: 14, tvOverrideKey: 'length' }],
  },
  {
    key: 'macd',
    label: 'MACD',
    tvStudy: 'MACD@tv-basicstudies',
    tvOverrideName: 'macd',
    params: [
      { key: 'fast', label: 'Fast', default: 12, tvOverrideKey: 'fast length' },
      { key: 'slow', label: 'Slow', default: 26, tvOverrideKey: 'slow length' },
      { key: 'signal', label: 'Signal', default: 9, tvOverrideKey: 'signal smoothing' },
    ],
  },
  {
    key: 'atr',
    label: 'ATR',
    tvStudy: 'ATR@tv-basicstudies',
    tvOverrideName: 'average true range',
    params: [{ key: 'period', label: 'Period', default: 14, tvOverrideKey: 'length' }],
  },
  {
    key: 'stoch',
    label: 'Stochastic',
    tvStudy: 'Stochastic@tv-basicstudies',
    tvOverrideName: 'stochastic',
    params: [
      { key: 'kPeriod', label: '%K', default: 14, tvOverrideKey: 'k length' },
      { key: 'dPeriod', label: '%D', default: 3, tvOverrideKey: 'd length' },
    ],
  },
]
const DEFAULT_ENABLED = new Set(['ema', 'cci'])

const DEFAULT_INDICATOR_STATE = Object.fromEntries(
  INDICATOR_DEFS.map((def) => [
    def.key,
    {
      enabled: DEFAULT_ENABLED.has(def.key),
      ...Object.fromEntries(def.params.map((p) => [p.key, p.default])),
    },
  ]),
)

// Best-effort Yahoo -> TradingView symbol mapping, same spirit as the studies_overrides
// mapping above: TradingView's free widget always pulls its OWN live feed for whatever
// symbol it's given, so this can only point it at the same real-world instrument, not
// literally replay Yahoo's bars — the two will rarely be pixel-identical. Unmapped
// symbols (unknown futures roots, indices) return null and the compare panel hides.
const YAHOO_FUTURES_ROOT_TO_TV = {
  GC: 'COMEX:GC1!',
  MGC: 'COMEX_MINI:MGC1!', // Micro Gold
  SI: 'COMEX:SI1!',
  SIL: 'COMEX_MINI:SIL1!', // Micro Silver
  CL: 'NYMEX:CL1!',
  MCL: 'NYMEX:MCL1!', // Micro Crude Oil
  NG: 'NYMEX:NG1!',
  HG: 'COMEX:HG1!',
  ZC: 'CBOT:ZC1!',
  ZS: 'CBOT:ZS1!',
  ZW: 'CBOT:ZW1!',
  ES: 'CME:ES1!',
  MES: 'CME_MINI:MES1!', // Micro E-mini S&P 500
  NQ: 'CME:NQ1!',
  MNQ: 'CME_MINI:MNQ1!', // Micro E-mini Nasdaq-100
  YM: 'CBOT:YM1!',
  MYM: 'CBOT_MINI:MYM1!', // Micro E-mini Dow
}
const YAHOO_INDEX_TO_TV = {
  '^GSPC': 'SP:SPX',
  '^DJI': 'DJ:DJI',
  '^IXIC': 'NASDAQ:IXIC',
  '^RUT': 'TVC:RUT',
  '^VIX': 'TVC:VIX',
}

function yahooToTradingViewSymbol(symbol) {
  if (!symbol) return null
  if (YAHOO_INDEX_TO_TV[symbol]) return YAHOO_INDEX_TO_TV[symbol]
  if (symbol.startsWith('^')) return null
  if (symbol.endsWith('=F')) return YAHOO_FUTURES_ROOT_TO_TV[symbol.slice(0, -2)] ?? null
  if (symbol.endsWith('=X')) return `FX:${symbol.slice(0, -2)}`
  if (symbol.endsWith('-USD')) return symbol.replace('-', '')
  return symbol // plain equity/ETF ticker — TradingView's widget resolves bare tickers fine
}

function toTradingViewSymbol(symbol, dataSource) {
  if (!symbol) return null
  return dataSource === 'yahoo' ? yahooToTradingViewSymbol(symbol) : symbol.replace('/', '')
}

function computeEnabledIndicators(candles, settings) {
  const data = {}
  if (settings.ema.enabled) {
    data.ema = { period: settings.ema.period, points: computeEMA(candles, settings.ema.period) }
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

  const [symbolInput, setSymbolInput] = useState('')
  const [symbolResults, setSymbolResults] = useState([])
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false)
  const [symbolSearchLoading, setSymbolSearchLoading] = useState(false)
  const [dataSource, setDataSource] = useState('twelvedata')
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
  const symbolSearchRef = useRef(null)
  const symbolInputRef = useRef(null)

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

  useEffect(() => {
    if (!symbolSearchOpen) return
    const handleClickOutside = (e) => {
      if (symbolSearchRef.current && !symbolSearchRef.current.contains(e.target)) {
        setSymbolSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [symbolSearchOpen])

  useEffect(() => {
    const query = symbolInput.trim()
    if (query.length < 1) {
      setSymbolResults([])
      setSymbolSearchLoading(false)
      return
    }
    setSymbolSearchLoading(true)
    const timer = setTimeout(async () => {
      try {
        const data = await api.searchSymbols(query, dataSource)
        setSymbolResults(data.results ?? [])
      } catch {
        setSymbolResults([])
      } finally {
        setSymbolSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolInput, dataSource])

  useEffect(() => {
    const handleKeyDown = (e) => {
      const target = e.target
      const isTyping =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (isTyping || e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return
      symbolInputRef.current?.focus()
      setSymbolInput(e.key)
      setSymbolSearchOpen(true)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

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

  const handleIndicatorDoubleClick = useCallback((key) => {
    setIndicatorMenuOpen(true)
    setOpenSettingsKey(key)
  }, [])

  const loadChart = async (e, overrideInterval, overrideSymbol, overrideSource) => {
    e?.preventDefault()
    const sym = (overrideSymbol ?? symbolInput).trim()
    const int = overrideInterval ?? interval
    const src = overrideSource ?? dataSource
    if (!sym) return
    setLoading(true)
    setError('')
    setMessages([])
    try {
      const data = await api.getMarketData(sym, int, OUTPUT_SIZE_BY_INTERVAL[int] ?? 500, src)
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

  const selectSymbol = (symbol) => {
    setSymbolInput(symbol)
    setSymbolResults([])
    setSymbolSearchOpen(false)
    loadChart(undefined, undefined, symbol)
  }

  const handleDataSourceChange = (value) => {
    if (value === dataSource) return
    setDataSource(value)
    setSymbolInput('')
    setSymbolResults([])
    setActiveSymbol(null)
    setCandles([])
    setShowCompare(false)
  }

  const tvSymbol = toTradingViewSymbol(activeSymbol, dataSource)

  const studies = [
    ...new Set(
      INDICATOR_DEFS.filter((def) => indicatorSettings[def.key].enabled).map((def) => def.tvStudy),
    ),
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
        dataSource,
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
        <div ref={symbolSearchRef} className="relative">
          <form onSubmit={loadChart}>
            <input
              id="symbol"
              ref={symbolInputRef}
              type="text"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              onFocus={() => {
                setSymbolInput('')
                setSymbolSearchOpen(true)
              }}
              placeholder={activeSymbol ?? 'Search symbol…'}
              autoComplete="off"
              className="w-40 rounded border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-accent"
            />
          </form>
          {symbolSearchOpen && (symbolResults.length > 0 || symbolSearchLoading) && (
            <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-border bg-surface p-1 shadow-lg">
              {symbolSearchLoading && (
                <p className="px-2 py-1.5 text-xs text-text-muted">Searching…</p>
              )}
              {!symbolSearchLoading &&
                symbolResults.map((r) => (
                  <button
                    key={`${r.symbol}-${r.exchange}`}
                    type="button"
                    onClick={() => selectSymbol(r.symbol)}
                    className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-bg"
                  >
                    <span className="text-sm text-text">{r.symbol}</span>
                    <span className="truncate text-xs text-text-muted">
                      {r.name}
                      {r.exchange ? ` · ${r.exchange}` : ''}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>

        <div className="flex rounded border border-border p-0.5">
          {DATA_SOURCES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => handleDataSourceChange(s.value)}
              className={`rounded px-2 py-1 text-xs ${
                dataSource === s.value ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

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
                Periods here always drive Claude's analysis. The TradingView chart mirrors them on a
                best-effort basis, since its free widget doesn't officially document these settings.
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
          Compare
        </button>

        {loading && <span className="text-xs text-text-muted">Loading…</span>}
      </div>

      <div className="mb-6">
        {candles.length > 0 ? (
          <TwelveDataChart
            candles={candles}
            candleType={candleType}
            indicators={enabledIndicators}
            interval={interval}
            height={showCompare ? 400 : 560}
            onIndicatorDoubleClick={handleIndicatorDoubleClick}
          />
        ) : (
          <div className="flex h-[560px] items-center justify-center rounded-lg border border-border bg-surface text-sm text-text-muted">
            {loading ? 'Loading…' : 'Enter a symbol above and click Load chart.'}
          </div>
        )}
      </div>

      {showCompare && candles.length > 0 && (
        <div className="mb-6">
          {tvSymbol ? (
            <>
              <p className="mb-2 text-xs text-text-muted">
                TradingView's own live feed for <span className="font-medium text-text">{tvSymbol}</span>,
                shown for visual reference.
                {dataSource === 'yahoo' &&
                  ' Yahoo symbols are best-effort mapped to a TradingView symbol, so this may come from a different exchange/contract than the exact data Claude analyzes above.'}
              </p>
              <TradingViewWidget
                symbol={tvSymbol}
                interval={TV_INTERVAL[interval] ?? 'D'}
                style={TV_STYLE[candleType] ?? 1}
                studies={studies}
                studiesOverrides={studiesOverrides}
                theme={isDark ? 'dark' : 'light'}
                height={400}
              />
            </>
          ) : (
            <div className="flex h-[400px] items-center justify-center rounded-lg border border-border bg-surface text-sm text-text-muted">
              TradingView doesn't have a known symbol mapping for {activeSymbol}.
            </div>
          )}
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

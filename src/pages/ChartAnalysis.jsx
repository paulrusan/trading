import { useEffect, useMemo, useRef, useState } from 'react'
import { usePrefersDark } from '../lib/chartColors'
import { useApi } from '../hooks/useApi'
import { ComparePanel } from '../components/ComparePanel'
import { IndicatorMenu } from '../components/IndicatorMenu'
import { TwelveDataChart } from '../components/TwelveDataChart'
import { toHeikinAshi } from '../lib/indicators'
import { DEFAULT_INDICATOR_STATE, INDICATOR_DEFS, computeEnabledIndicators } from '../lib/indicatorDefs'
import { toTradingViewSymbol } from '../lib/tradingViewSymbols'

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
  const [indicatorOpenRequest, setIndicatorOpenRequest] = useState(null)
  const [showCompare, setShowCompare] = useState(false)

  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState('')

  const symbolSearchRef = useRef(null)
  const symbolInputRef = useRef(null)

  const enabledIndicators = useMemo(
    () => computeEnabledIndicators(candles, indicatorSettings),
    [candles, indicatorSettings],
  )

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

  const handleIndicatorDoubleClick = (key) => {
    setIndicatorOpenRequest({ key, token: Date.now() })
  }

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

      // Best-effort: only has data if this symbol/source/interval is on the user's
      // watchlist and has been snapshotted at least once. Claude interprets this
      // precomputed history rather than recomputing signals itself.
      let watchlistHistory
      try {
        const [{ results: snapshots }, { results: trends }] = await Promise.all([
          api.getSnapshots(activeSymbol, dataSource, interval, 30),
          api.getTrends(activeSymbol, dataSource, interval, 10),
        ])
        if (snapshots.length > 0 || trends.length > 0) watchlistHistory = { snapshots, trends }
      } catch {
        // not watched, or snapshots not available yet — fine, just omit it
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
        watchlistHistory,
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

      <ComparePanel
        show={showCompare && candles.length > 0}
        tvSymbol={tvSymbol}
        appInterval={interval}
        candleType={candleType}
        studies={studies}
        studiesOverrides={studiesOverrides}
        isDark={isDark}
        activeSymbol={activeSymbol}
        dataSource={dataSource}
      />

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

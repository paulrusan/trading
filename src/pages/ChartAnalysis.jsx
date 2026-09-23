import { CandlestickSeries, createChart, LineSeries } from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { getChartColors, usePrefersDark } from '../lib/chartColors'
import { useApi } from '../hooks/useApi'
import { computeCCI, computeEMA, toHeikinAshi } from '../lib/indicators'

const SYMBOL_SUGGESTIONS = ['XAU/USD', 'XAG/USD', 'NDX', 'SPX', 'BTC/USD', 'AAPL']
const INTERVALS = [
  { value: '1h', label: '1 hour' },
  { value: '4h', label: '4 hour' },
  { value: '1day', label: 'Daily' },
  { value: '1week', label: 'Weekly' },
]

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
  const [showEma20, setShowEma20] = useState(true)
  const [showEma50, setShowEma50] = useState(true)
  const [showCci, setShowCci] = useState(true)

  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState('')

  const priceContainerRef = useRef(null)
  const chartRef = useRef(null)

  const loadChart = async (e, overrideInterval) => {
    e?.preventDefault()
    const sym = symbolInput.trim()
    const int = overrideInterval ?? interval
    if (!sym) return
    setLoading(true)
    setError('')
    setMessages([])
    try {
      const data = await api.getMarketData(sym, int, 200)
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

    if (showEma20) {
      const ema20Series = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, 0)
      ema20Series.setData(computeEMA(candles, 20))
      series.push(ema20Series)
    }

    if (showEma50) {
      const ema50Series = chart.addSeries(
        LineSeries,
        { color: colors.textMuted, lineWidth: 1 },
        0,
      )
      ema50Series.setData(computeEMA(candles, 50))
      series.push(ema50Series)
    }

    if (showCci) {
      const cciSeries = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, 1)
      cciSeries.setData(computeCCI(candles, 14))
      series.push(cciSeries)
    }

    chart.timeScale().fitContent()

    return () => {
      for (const s of series) chart.removeSeries(s)
    }
  }, [candles, colors, candleType, showEma20, showEma50, showCci])

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
      const ema20 = computeEMA(candles, 20)
      const ema50 = computeEMA(candles, 50)
      const cci = computeCCI(candles, 14)

      const context = {
        type: 'chart_analysis',
        symbol: activeSymbol,
        interval,
        latestPrice: candles[candles.length - 1]?.close,
        heikinAshiCandles: heikinAshi.slice(-50),
        cci: { period: 14, latest: cci[cci.length - 1]?.value, recent: cci.slice(-20) },
        ema20: { latest: ema20[ema20.length - 1]?.value, recent: ema20.slice(-20) },
        ema50: { latest: ema50[ema50.length - 1]?.value, recent: ema50.slice(-20) },
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

      <div className="relative mb-3">
        <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface/90 px-2 py-1.5 backdrop-blur-sm">
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

          {loading && <span className="text-xs text-text-muted">Loading…</span>}
        </div>

        <div ref={priceContainerRef} className="overflow-hidden rounded-lg border border-border" />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <div className="flex rounded-md border border-border p-0.5">
          <button
            type="button"
            onClick={() => setCandleType('simple')}
            className={`rounded px-3 py-1 ${
              candleType === 'simple' ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
            }`}
          >
            Simple
          </button>
          <button
            type="button"
            onClick={() => setCandleType('heikinAshi')}
            className={`rounded px-3 py-1 ${
              candleType === 'heikinAshi'
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Heikin Ashi
          </button>
        </div>

        <label className="flex items-center gap-1.5 text-text-muted">
          <input
            type="checkbox"
            checked={showEma20}
            onChange={(e) => setShowEma20(e.target.checked)}
            className="accent-accent"
          />
          EMA 20
        </label>
        <label className="flex items-center gap-1.5 text-text-muted">
          <input
            type="checkbox"
            checked={showEma50}
            onChange={(e) => setShowEma50(e.target.checked)}
            className="accent-accent"
          />
          EMA 50
        </label>
        <label className="flex items-center gap-1.5 text-text-muted">
          <input
            type="checkbox"
            checked={showCci}
            onChange={(e) => setShowCci(e.target.checked)}
            className="accent-accent"
          />
          CCI (14)
        </label>
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

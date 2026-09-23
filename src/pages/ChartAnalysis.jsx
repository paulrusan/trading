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

  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState('')

  const priceContainerRef = useRef(null)
  const chartRef = useRef(null)

  const loadChart = async (e) => {
    e?.preventDefault()
    if (!symbolInput.trim()) return
    setLoading(true)
    setError('')
    setMessages([])
    try {
      const data = await api.getMarketData(symbolInput.trim(), interval, 200)
      setCandles(data.candles)
      setActiveSymbol(data.symbol)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
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

    const heikinAshi = toHeikinAshi(candles)
    const ema20 = computeEMA(candles, 20)
    const ema50 = computeEMA(candles, 50)
    const cci = computeCCI(candles, 14)

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
    candleSeries.setData(heikinAshi)

    const ema20Series = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, 0)
    ema20Series.setData(ema20)

    const ema50Series = chart.addSeries(
      LineSeries,
      { color: colors.textMuted, lineWidth: 1 },
      0,
    )
    ema50Series.setData(ema50)

    const cciSeries = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, 1)
    cciSeries.setData(cci)

    chart.timeScale().fitContent()

    return () => {
      chart.removeSeries(candleSeries)
      chart.removeSeries(ema20Series)
      chart.removeSeries(ema50Series)
      chart.removeSeries(cciSeries)
    }
  }, [candles, colors])

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
      <h1 className="mb-4 text-xl font-semibold text-text">Chart Analysis</h1>

      <form onSubmit={loadChart} className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm text-text-muted" htmlFor="symbol">
            Instrument / symbol
          </label>
          <input
            id="symbol"
            type="text"
            list="symbol-suggestions"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            placeholder="e.g. XAU/USD, NDX, AAPL…"
            className="rounded-md border border-border bg-surface px-3 py-2 text-text outline-none focus:border-accent"
          />
          <datalist id="symbol-suggestions">
            {SYMBOL_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="mb-1 block text-sm text-text-muted" htmlFor="interval">
            Interval
          </label>
          <select
            id="interval"
            value={interval}
            onChange={(e) => setInterval_(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-text outline-none focus:border-accent"
          >
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load chart'}
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-loss">{error}</p>}

      <div className="mb-2 text-sm text-text-muted">
        {activeSymbol && `${activeSymbol} · Heikin Ashi · EMA 20/50 · CCI (14)`}
      </div>
      <div
        ref={priceContainerRef}
        className="mb-6 overflow-hidden rounded-lg border border-border"
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

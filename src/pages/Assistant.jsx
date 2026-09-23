import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { computeStats, computePnlByInstrument, computeMonthlyPerformance } from '../lib/dashboardStats'

const SUGGESTIONS = [
  'Summarize my performance this month',
  'What patterns show up in my losing trades?',
  'Project my equity curve for the next 3 months if I keep this pace',
  'Build a scenario: what if I cut my worst instrument entirely?',
]

export default function Assistant() {
  const api = useApi()
  const [hasKey, setHasKey] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    api
      .getSettings()
      .then((data) => setHasKey(data.hasAnthropicApiKey))
      .catch(() => setHasKey(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const buildContext = async () => {
    const trades = await api.getTrades()
    return {
      stats: computeStats(trades),
      pnlByInstrument: computePnlByInstrument(trades),
      monthlyPerformance: computeMonthlyPerformance(trades),
      tradeCount: trades.length,
      recentTrades: trades.slice(0, 20).map((t) => ({
        instrument: t.instrument,
        direction: t.direction,
        status: t.status,
        entryDate: t.entryDate,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
      })),
    }
  }

  const send = async (text) => {
    if (!text.trim() || sending) return
    setError('')
    const userMessage = { role: 'user', content: text }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    try {
      const context = await buildContext()
      const history = messages.slice(-10)
      const { reply } = await api.askAssistant(text, context, history)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      setError(err.message)
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    send(input)
  }

  return (
    <div className="flex h-[calc(100svh-57px)] flex-col p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-semibold text-text">AI Assistant</h1>

      {hasKey === false && (
        <div className="mb-4 rounded-md border border-border bg-surface p-3 text-sm text-text-muted">
          No Anthropic API key configured.{' '}
          <Link to="/settings" className="text-accent hover:underline">
            Add one in Settings
          </Link>{' '}
          to start chatting.
        </div>
      )}

      <div className="mb-4 flex-1 overflow-y-auto rounded-lg border border-border bg-surface p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="text-text-muted">
              Ask about your trading patterns, get projections, or explore scenarios.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-sm text-text-muted hover:border-accent hover:text-text"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-2.5 text-sm ${
                m.role === 'user'
                  ? 'ml-auto bg-accent text-white'
                  : 'bg-bg text-text'
              }`}
            >
              {m.content}
            </div>
          ))}
          {sending && <div className="text-sm text-text-muted">Thinking…</div>}
          <div ref={bottomRef} />
        </div>
      </div>

      {error && <p className="mb-2 text-sm text-loss">{error}</p>}

      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your trades…"
          disabled={hasKey === false}
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-text outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || hasKey === false || !input.trim()}
          className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}

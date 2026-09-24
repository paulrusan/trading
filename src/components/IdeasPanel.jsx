import { useEffect, useMemo, useState } from 'react'
import { useApi } from '../hooks/useApi'
import { IDEA_STATUS_LABELS } from '../lib/constants'
import { IdeaDrawer } from './IdeaDrawer'
import { TradeDrawer } from './TradeDrawer'

function ConfidenceStars({ confidence }) {
  return (
    <span className="text-accent" aria-label={`Confidence ${confidence} of 5`}>
      {'★'.repeat(confidence)}
      <span className="text-text-muted">{'★'.repeat(5 - confidence)}</span>
    </span>
  )
}

function IdeaStatusBadge({ status }) {
  const toneClass =
    status === 'active'
      ? 'text-accent ring-accent/40'
      : status === 'expired'
        ? 'text-text-muted ring-border line-through'
        : 'text-text-muted ring-border'
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClass}`}>
      {IDEA_STATUS_LABELS[status]}
    </span>
  )
}

export function IdeasPanel() {
  const api = useApi()
  const [ideas, setIdeas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [drawerIdea, setDrawerIdea] = useState(undefined) // undefined = closed, null = new, object = edit
  const [promotingIdea, setPromotingIdea] = useState(null)

  useEffect(() => {
    let cancelled = false
    api
      .getIdeas()
      .then((data) => {
        if (!cancelled) setIdeas(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sorted = useMemo(
    () => [...ideas].sort((a, b) => b.confidence - a.confidence),
    [ideas],
  )

  const knownInstruments = useMemo(
    () => Array.from(new Set(ideas.map((i) => i.instrument))).sort(),
    [ideas],
  )

  const handleSaveIdea = async (ideaData) => {
    const saved = await api.saveIdea(ideaData)
    setIdeas((prev) => {
      const exists = prev.some((i) => i.id === saved.id)
      return exists ? prev.map((i) => (i.id === saved.id ? saved : i)) : [saved, ...prev]
    })
  }

  const handleMarkExpired = async (idea) => {
    const saved = await api.saveIdea({ ...idea, status: 'expired' })
    setIdeas((prev) => prev.map((i) => (i.id === saved.id ? saved : i)))
  }

  const handleDelete = async (idea) => {
    if (!window.confirm(`Delete this ${idea.instrument} idea?`)) return
    await api.deleteIdea(idea.id)
    setIdeas((prev) => prev.filter((i) => i.id !== idea.id))
  }

  const handlePromoteSave = async (tradeData) => {
    await api.saveTrade(tradeData)
    const saved = await api.saveIdea({ ...promotingIdea, status: 'active' })
    setIdeas((prev) => prev.map((i) => (i.id === saved.id ? saved : i)))
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-text">Trade ideas</h2>
        <button
          type="button"
          onClick={() => setDrawerIdea(null)}
          className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:opacity-90"
        >
          New Idea
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-loss">{error}</p>}

      {loading && <p className="text-text-muted">Loading…</p>}

      {!loading && sorted.length === 0 && (
        <p className="text-text-muted">No ideas yet. Add one to get started.</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sorted.map((idea) => (
          <div key={idea.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-text">{idea.instrument}</h3>
              <IdeaStatusBadge status={idea.status} />
            </div>

            <p className="flex-1 text-sm text-text-muted">{idea.setup}</p>

            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">{idea.timeframe || '—'}</span>
              <ConfidenceStars confidence={idea.confidence} />
            </div>

            <div className="text-xs text-text-muted">
              {new Date(idea.createdAt).toLocaleDateString()}
            </div>

            <div className="flex flex-wrap gap-3 border-t border-border pt-3 text-xs">
              <button
                type="button"
                onClick={() => setDrawerIdea(idea)}
                className="text-accent hover:underline"
              >
                Edit
              </button>
              {idea.status !== 'expired' && (
                <>
                  <button
                    type="button"
                    onClick={() => setPromotingIdea(idea)}
                    className="text-accent hover:underline"
                  >
                    Promote to trade
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMarkExpired(idea)}
                    className="text-text-muted hover:underline"
                  >
                    Mark expired
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => handleDelete(idea)}
                className="text-loss hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {drawerIdea !== undefined && (
        <IdeaDrawer
          idea={drawerIdea}
          knownInstruments={knownInstruments}
          onClose={() => setDrawerIdea(undefined)}
          onSave={handleSaveIdea}
        />
      )}

      {promotingIdea && (
        <TradeDrawer
          initialInstrument={promotingIdea.instrument}
          onClose={() => setPromotingIdea(null)}
          onSave={handlePromoteSave}
        />
      )}
    </div>
  )
}

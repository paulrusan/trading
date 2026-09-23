import { useState } from 'react'

const emptyIdea = {
  instrument: '',
  setup: '',
  timeframe: '',
  confidence: 3,
}

export function IdeaDrawer({ idea, knownInstruments, onClose, onSave }) {
  const isEdit = Boolean(idea)
  const [form, setForm] = useState(() => (idea ? { ...idea } : emptyIdea))
  const [submitting, setSubmitting] = useState(false)

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSave({
        ...idea,
        instrument: form.instrument,
        setup: form.setup,
        timeframe: form.timeframe,
        confidence: Number(form.confidence),
        status: idea?.status ?? 'watching',
        createdAt: idea?.createdAt ?? new Date().toISOString(),
      })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">{isEdit ? 'Edit idea' : 'New idea'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm text-text-muted" htmlFor="instrument">
              Instrument
            </label>
            <input
              id="instrument"
              type="text"
              required
              list="idea-instrument-options"
              placeholder="e.g. Gold, Bitcoin, AAPL…"
              value={form.instrument}
              onChange={update('instrument')}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
            />
            <datalist id="idea-instrument-options">
              {knownInstruments?.map((i) => <option key={i} value={i} />)}
            </datalist>
          </div>

          <div>
            <label className="mb-1 block text-sm text-text-muted" htmlFor="setup">
              Setup
            </label>
            <textarea
              id="setup"
              rows={3}
              required
              value={form.setup}
              onChange={update('setup')}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-text-muted" htmlFor="timeframe">
              Timeframe
            </label>
            <input
              id="timeframe"
              type="text"
              placeholder="e.g. Daily, 4H…"
              value={form.timeframe}
              onChange={update('timeframe')}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-text-muted" htmlFor="confidence">
              Confidence
            </label>
            <select
              id="confidence"
              value={form.confidence}
              onChange={update('confidence')}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {'★'.repeat(n)}
                  {'☆'.repeat(5 - n)}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-auto flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-border px-3 py-2 text-text hover:bg-bg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-md bg-accent px-3 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

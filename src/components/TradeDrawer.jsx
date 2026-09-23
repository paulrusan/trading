import { useState } from 'react'
import { INSTRUMENTS } from '../lib/constants'

const emptyTrade = {
  instrument: INSTRUMENTS[0],
  direction: 'long',
  entryDate: new Date().toISOString().slice(0, 10),
  entryPrice: '',
  shares: 100,
  notes: '',
  tags: '',
}

export function TradeDrawer({ trade, onClose, onSave }) {
  const isEdit = Boolean(trade)
  const [form, setForm] = useState(() =>
    trade
      ? { ...trade, tags: (trade.tags ?? []).join(', ') }
      : emptyTrade,
  )
  const [submitting, setSubmitting] = useState(false)

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSave({
        ...trade,
        instrument: form.instrument,
        direction: form.direction,
        entryDate: form.entryDate,
        entryPrice: Number(form.entryPrice),
        shares: Number(form.shares),
        notes: form.notes,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        status: trade?.status ?? 'open',
        partialSells: trade?.partialSells ?? [],
        exitDate: trade?.exitDate ?? null,
        exitPrice: trade?.exitPrice ?? null,
        pnl: trade?.pnl ?? null,
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
          <h2 className="text-lg font-semibold text-text">
            {isEdit ? 'Edit trade' : 'New trade'}
          </h2>
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
            <select
              id="instrument"
              value={form.instrument}
              onChange={update('instrument')}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
            >
              {INSTRUMENTS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-text-muted" htmlFor="direction">
              Direction
            </label>
            <select
              id="direction"
              value={form.direction}
              onChange={update('direction')}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
            >
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-text-muted" htmlFor="entryDate">
                Entry date
              </label>
              <input
                id="entryDate"
                type="date"
                required
                value={form.entryDate}
                onChange={update('entryDate')}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-text-muted" htmlFor="entryPrice">
                Entry price
              </label>
              <input
                id="entryPrice"
                type="number"
                step="0.01"
                required
                value={form.entryPrice}
                onChange={update('entryPrice')}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-text outline-none focus:border-accent"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-text-muted" htmlFor="shares">
              Shares
            </label>
            <input
              id="shares"
              type="number"
              required
              disabled={isEdit}
              value={form.shares}
              onChange={update('shares')}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-text outline-none focus:border-accent disabled:opacity-50"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-text-muted" htmlFor="tags">
              Tags (comma-separated)
            </label>
            <input
              id="tags"
              type="text"
              value={form.tags}
              onChange={update('tags')}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-text-muted" htmlFor="notes">
              Notes
            </label>
            <textarea
              id="notes"
              rows={4}
              value={form.notes}
              onChange={update('notes')}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
            />
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

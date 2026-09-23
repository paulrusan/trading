import { useState } from 'react'
import { remainingShares } from '../lib/tradePnl'

export function TradeSellModal({ trade, mode, onClose, onConfirm }) {
  const isClose = mode === 'close'
  const remaining = remainingShares(trade)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [price, setPrice] = useState('')
  const [shares, setShares] = useState(isClose ? remaining : '')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onConfirm({
        date,
        price: Number(price),
        shares: isClose ? remaining : Number(shares),
      })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-text">
          {isClose ? 'Close position' : 'Record partial sell'}
        </h2>
        <p className="mb-4 text-sm text-text-muted">
          {trade.instrument} · {remaining} shares remaining
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm text-text-muted" htmlFor="sellDate">
              Date
            </label>
            <input
              id="sellDate"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-text-muted" htmlFor="sellPrice">
              Price
            </label>
            <input
              id="sellPrice"
              type="number"
              step="0.01"
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-text outline-none focus:border-accent"
            />
          </div>

          {!isClose && (
            <div>
              <label className="mb-1 block text-sm text-text-muted" htmlFor="sellShares">
                Shares (max {remaining})
              </label>
              <input
                id="sellShares"
                type="number"
                required
                min={1}
                max={remaining - 1}
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-text outline-none focus:border-accent"
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
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
              {submitting ? 'Saving…' : isClose ? 'Close position' : 'Record sell'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

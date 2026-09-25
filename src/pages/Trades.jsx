import { useEffect, useMemo, useState } from 'react'
import { TradeDrawer } from '../components/TradeDrawer'
import { TradeSellModal } from '../components/TradeSellModal'
import { useApi } from '../hooks/useApi'
import { DEFAULT_INSTRUMENTS, STATUS_LABELS } from '../lib/constants'
import { formatDateOnly } from '../lib/formatDate'
import { hasRealizedActivity, realizedPnl, remainingShares } from '../lib/tradePnl'

const STATUS_TABS = ['all', 'open', 'partial', 'closed']

function DirectionBadge({ direction }) {
  const isLong = direction === 'long'
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${
        isLong ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'
      }`}
    >
      {isLong ? 'Long' : 'Short'}
    </span>
  )
}

function StatusBadge({ status }) {
  return (
    <span className="rounded px-2 py-0.5 text-xs font-medium text-text-muted ring-1 ring-inset ring-border">
      {STATUS_LABELS[status]}
    </span>
  )
}

function PnlValue({ trade }) {
  if (!hasRealizedActivity(trade)) return <span className="text-text-muted">—</span>
  const pnl = realizedPnl(trade)
  const sign = pnl > 0 ? '+' : ''
  return (
    <span className={`font-mono ${pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
      {sign}
      {pnl.toFixed(2)}
    </span>
  )
}

export default function Trades() {
  const api = useApi()
  const [trades, setTrades] = useState([])
  const [loadError, setLoadError] = useState('')
  const [loadingList, setLoadingList] = useState(true)

  const [statusFilter, setStatusFilter] = useState('all')
  const [instrumentFilter, setInstrumentFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [drawerTrade, setDrawerTrade] = useState(undefined) // undefined = closed, null = new, object = edit
  const [sellModal, setSellModal] = useState(null) // { trade, mode }

  useEffect(() => {
    let cancelled = false
    setLoadingList(true)
    api
      .getTrades()
      .then((data) => {
        if (!cancelled) setTrades(data)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const usedInstruments = useMemo(
    () => Array.from(new Set(trades.map((t) => t.instrument))).sort(),
    [trades],
  )
  const knownInstruments = useMemo(
    () => Array.from(new Set([...DEFAULT_INSTRUMENTS, ...usedInstruments])).sort(),
    [usedInstruments],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return trades.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (instrumentFilter !== 'all' && t.instrument !== instrumentFilter) return false
      if (q) {
        const haystack = [t.instrument, t.notes, ...(t.tags ?? [])].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [trades, statusFilter, instrumentFilter, search])

  const handleSaveTrade = async (tradeData) => {
    const saved = await api.saveTrade(tradeData)
    setTrades((prev) => {
      const exists = prev.some((t) => t.id === saved.id)
      return exists ? prev.map((t) => (t.id === saved.id ? saved : t)) : [saved, ...prev]
    })
  }

  const handleSellConfirm = async (data) => {
    const { trade, mode } = sellModal
    let updated
    if (mode === 'partial') {
      updated = {
        ...trade,
        partialSells: [...(trade.partialSells ?? []), data],
        status: 'partial',
      }
    } else {
      updated = {
        ...trade,
        exitDate: data.date,
        exitPrice: data.price,
        status: 'closed',
      }
      updated.pnl = realizedPnl(updated)
    }
    const saved = await api.saveTrade(updated)
    setTrades((prev) => prev.map((t) => (t.id === saved.id ? saved : t)))
  }

  const handleDelete = async (trade) => {
    if (!window.confirm(`Delete this ${trade.instrument} trade?`)) return
    await api.deleteTrade(trade.id)
    setTrades((prev) => prev.filter((t) => t.id !== trade.id))
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-text">Trades</h1>
        <button
          type="button"
          onClick={() => setDrawerTrade(null)}
          className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:opacity-90"
        >
          New Trade
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-border p-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`rounded px-3 py-1.5 text-sm capitalize ${
                statusFilter === tab
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <select
          value={instrumentFilter}
          onChange={(e) => setInstrumentFilter(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-accent"
        >
          <option value="all">All instruments</option>
          {usedInstruments.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search notes, tags…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-accent sm:max-w-xs"
        />
      </div>

      {loadError && <p className="mb-4 text-sm text-loss">{loadError}</p>}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="px-4 py-3 font-medium">Instrument</th>
              <th className="px-4 py-3 font-medium">Direction</th>
              <th className="px-4 py-3 font-medium">Entry date</th>
              <th className="px-4 py-3 font-medium">Entry price</th>
              <th className="px-4 py-3 font-medium">Shares</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">P&amp;L</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingList && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loadingList && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-text-muted">
                  No trades found.
                </td>
              </tr>
            )}
            {filtered.map((trade) => (
              <tr key={trade.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-text">{trade.instrument}</td>
                <td className="px-4 py-3">
                  <DirectionBadge direction={trade.direction} />
                </td>
                <td className="px-4 py-3 text-text-muted">{formatDateOnly(trade.entryDate)}</td>
                <td className="px-4 py-3 font-mono text-text">{trade.entryPrice}</td>
                <td className="px-4 py-3 font-mono text-text">
                  {trade.status === 'open' ? trade.shares : `${remainingShares(trade)}/${trade.shares}`}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={trade.status} />
                </td>
                <td className="px-4 py-3">
                  <PnlValue trade={trade} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setDrawerTrade(trade)}
                      className="text-accent hover:underline"
                    >
                      Edit
                    </button>
                    {trade.status !== 'closed' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setSellModal({ trade, mode: 'partial' })}
                          className="text-accent hover:underline"
                        >
                          Partial sell
                        </button>
                        <button
                          type="button"
                          onClick={() => setSellModal({ trade, mode: 'close' })}
                          className="text-accent hover:underline"
                        >
                          Close
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(trade)}
                      className="text-loss hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drawerTrade !== undefined && (
        <TradeDrawer
          trade={drawerTrade}
          knownInstruments={knownInstruments}
          onClose={() => setDrawerTrade(undefined)}
          onSave={handleSaveTrade}
        />
      )}

      {sellModal && (
        <TradeSellModal
          trade={sellModal.trade}
          mode={sellModal.mode}
          onClose={() => setSellModal(null)}
          onConfirm={handleSellConfirm}
        />
      )}
    </div>
  )
}

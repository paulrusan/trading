import { hasRealizedActivity, realizedPnl } from './tradePnl'

export function computeStats(trades) {
  const totalPnl = trades.reduce((sum, t) => sum + realizedPnl(t), 0)
  const closedTrades = trades.filter((t) => t.status === 'closed')
  const wins = closedTrades.filter((t) => realizedPnl(t) > 0)
  const winRate = closedTrades.length ? (wins.length / closedTrades.length) * 100 : null
  const openPositions = trades.filter((t) => t.status !== 'closed').length
  const bestTrade = closedTrades.reduce(
    (best, t) => (best === null || realizedPnl(t) > realizedPnl(best) ? t : best),
    null,
  )

  return {
    totalPnl,
    winRate,
    openPositions,
    bestTradePnl: bestTrade ? realizedPnl(bestTrade) : null,
    bestTradeInstrument: bestTrade?.instrument ?? null,
  }
}

function realizedEvents(trades) {
  const events = []
  for (const t of trades) {
    const sign = t.direction === 'long' ? 1 : -1
    for (const sale of t.partialSells ?? []) {
      events.push({ date: sale.date, pnl: sign * (sale.price - t.entryPrice) * sale.shares })
    }
    if (t.status === 'closed' && t.exitPrice != null && t.exitDate) {
      const sold = (t.partialSells ?? []).reduce((sum, s) => sum + s.shares, 0)
      const remaining = t.shares - sold
      events.push({ date: t.exitDate, pnl: sign * (t.exitPrice - t.entryPrice) * remaining })
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date))
}

export function computeEquityCurve(trades) {
  let cumulative = 0
  return realizedEvents(trades).map((e) => {
    cumulative += e.pnl
    return { date: e.date, cumulative }
  })
}

export function computePnlByInstrument(trades) {
  const map = new Map()
  for (const t of trades) {
    if (!hasRealizedActivity(t)) continue
    map.set(t.instrument, (map.get(t.instrument) ?? 0) + realizedPnl(t))
  }
  return Array.from(map, ([instrument, pnl]) => ({ instrument, pnl })).sort(
    (a, b) => b.pnl - a.pnl,
  )
}

export function computeMonthlyPerformance(trades) {
  const map = new Map()
  for (const e of realizedEvents(trades)) {
    const month = e.date.slice(0, 7)
    map.set(month, (map.get(month) ?? 0) + e.pnl)
  }
  return Array.from(map, ([month, pnl]) => ({ month, pnl })).sort((a, b) =>
    a.month.localeCompare(b.month),
  )
}

export function computeWinLoss(trades) {
  const closed = trades.filter((t) => t.status === 'closed')
  const wins = closed.filter((t) => realizedPnl(t) > 0).length
  const losses = closed.length - wins
  return [
    { name: 'Wins', value: wins },
    { name: 'Losses', value: losses },
  ]
}

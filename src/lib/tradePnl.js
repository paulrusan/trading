export function remainingShares(trade) {
  const sold = (trade.partialSells ?? []).reduce((sum, s) => sum + s.shares, 0)
  return trade.shares - sold
}

export function realizedPnl(trade) {
  const sign = trade.direction === 'long' ? 1 : -1
  let pnl = 0

  for (const sale of trade.partialSells ?? []) {
    pnl += sign * (sale.price - trade.entryPrice) * sale.shares
  }

  if (trade.status === 'closed' && trade.exitPrice != null) {
    pnl += sign * (trade.exitPrice - trade.entryPrice) * remainingShares(trade)
  }

  return pnl
}

export function hasRealizedActivity(trade) {
  return trade.status !== 'open' || (trade.partialSells ?? []).length > 0
}

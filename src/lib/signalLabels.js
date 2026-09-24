// Shared between Watchlist.jsx (list view) and SnapshotDetail.jsx (single-symbol view)
// so the signal/phase vocabulary stays in exactly one place.

export const SIGNAL_LABEL = {
  strong_buy: 'Strong buy',
  weak_buy: 'Weak buy (re-entry)',
  hold: 'Hold',
  partial_sell: 'Partial sell',
  strong_sell: 'Strong sell',
}

export const SIGNAL_STYLE = {
  strong_buy: 'text-profit',
  weak_buy: 'text-profit',
  hold: 'text-text-muted',
  partial_sell: 'text-loss',
  strong_sell: 'text-loss',
}

export const PHASE_LABEL = {
  beginning: 'Beginning',
  middle: 'Middle',
  end: 'End (weakening)',
}

export function describeCondition(snapshot) {
  if (!snapshot) return 'No data yet'
  const regimeLabel =
    snapshot.regime === 'up' ? 'Uptrend' : snapshot.regime === 'down' ? 'Downtrend' : 'No confirmed trend yet'
  return `${regimeLabel} — ${PHASE_LABEL[snapshot.trendPhase] ?? snapshot.trendPhase}`
}

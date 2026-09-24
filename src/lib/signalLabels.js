// Shared between Watchlist.jsx (list view) and SnapshotDetail.jsx (single-symbol view)
// so the signal/phase vocabulary stays in exactly one place.
//
// Just three real signals — the CCI(20)/SMA(200) rule in api/src/computeSnapshot.js has
// no equivalent of the old +-100 rule's weak_buy/partial_sell (a rejected crossing is
// just noise, not a distinct state), so those were removed rather than left unreachable.

export const SIGNAL_LABEL = {
  strong_buy: 'Strong buy',
  hold: 'Hold',
  strong_sell: 'Strong sell',
}

export const SIGNAL_STYLE = {
  strong_buy: 'text-profit',
  hold: 'text-text-muted',
  strong_sell: 'text-loss',
}

export const PHASE_LABEL = {
  beginning: 'Beginning',
  middle: 'Middle',
}

export function describeCondition(snapshot) {
  if (!snapshot) return 'No data yet'
  const regimeLabel =
    snapshot.regime === 'up' ? 'Uptrend' : snapshot.regime === 'down' ? 'Downtrend' : 'No confirmed trend yet'
  return `${regimeLabel} — ${PHASE_LABEL[snapshot.trendPhase] ?? snapshot.trendPhase}`
}

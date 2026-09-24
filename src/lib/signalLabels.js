// Shared between Watchlist.jsx (list view), SnapshotDetail.jsx (single-symbol view), and
// TwelveDataChart's markers so the signal vocabulary and its visuals stay in exactly one
// place.
//
// The rule (api/src/computeSnapshot.js): price vs SMA(200) sets the regime (up/down).
// CCI(20) crossing the zero line is the trigger, and what a crossing means depends on the
// regime at that moment — up-regime + cross-up = enter long, up-regime + cross-down = exit
// the long, down-regime + cross-down = enter short, down-regime + cross-up = exit the
// short. Every crossing produces one of these four signals; none are filtered out.

export const SIGNAL_LABEL = {
  buy: 'Buy',
  short: 'Short',
  exit_long: 'Exit long',
  exit_short: 'Exit short',
  hold: 'Hold',
}

export const SIGNAL_STYLE = {
  buy: 'text-profit',
  short: 'text-loss',
  exit_long: 'text-profit',
  exit_short: 'text-loss',
  hold: 'text-text-muted',
}

export const POSITION_LABEL = {
  long: 'Long',
  short: 'Short',
  flat: 'Flat',
}

const UP_COLOR = '#22c55e'
const DOWN_COLOR = '#ef4444'

// Chart marker per signal: entries as arrows pointing into the bar, exits as an "X" on
// the opposite side so an entry/exit pair reads as two marks bracketing the trade.
export const SIGNAL_MARKER = {
  buy: { color: UP_COLOR, shape: 'arrowUp', position: 'belowBar', text: 'Buy' },
  short: { color: DOWN_COLOR, shape: 'arrowDown', position: 'aboveBar', text: 'Short' },
  exit_long: { color: UP_COLOR, shape: 'circle', position: 'aboveBar', text: '✕' },
  exit_short: { color: DOWN_COLOR, shape: 'circle', position: 'belowBar', text: '✕' },
}

export function describeCondition(snapshot) {
  if (!snapshot) return 'No data yet'
  const regimeLabel =
    snapshot.regime === 'up' ? 'Uptrend' : snapshot.regime === 'down' ? 'Downtrend' : 'No trend yet'
  const positionLabel =
    snapshot.position === 'long'
      ? 'in a long'
      : snapshot.position === 'short'
        ? 'in a short'
        : 'flat, waiting for the next signal'
  return `${regimeLabel} — ${positionLabel}`
}

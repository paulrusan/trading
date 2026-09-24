import { computeCCI, computeEMA } from './lib/indicators.js'

const CCI_PERIOD = 14
const CCI_LEVEL = 100

function lastTwo(points) {
  if (points.length < 2) return null
  return { prev: points[points.length - 2], curr: points[points.length - 1] }
}

// Derives this hour's signal/trendPhase from CCI crossing +-100, per the approved rules:
// strong_buy = CCI crosses above +100 from a 'down' or 'neutral' regime (new uptrend).
// weak_buy = CCI re-crosses above +100 while already in an 'up' regime (re-entry after a
// dip, not a fresh trend). partial_sell = CCI crosses back below +100 after being above
// it, without a full reversal (momentum fading, position trimmed but trend not over).
// strong_sell = CCI crosses below -100 (reversal into a new downtrend, or the first
// down-trend). Anything else is 'hold'.
//
// This needs the PRIOR regime/weakened state, not just the prior "signal" — 'hold' alone
// is ambiguous (it can mean "holding an established uptrend" or "holding a weakened one
// still waiting to reverse"), so regime/weakened/trendStartTime/trendStartPrice are
// carried forward on the snapshot doc itself as bookkeeping fields (not just the fields
// originally sketched in CLAUDE.md's "Planned" note).
export function computeSnapshotUpdate(candles, prevSnapshot) {
  const cci = computeCCI(candles, CCI_PERIOD)
  const aligned = lastTwo(cci)
  if (!aligned) return null

  const { prev, curr } = aligned
  const price = candles[candles.length - 1].close
  const time = candles[candles.length - 1].time
  const nowIso = new Date(time * 1000).toISOString()

  let regime = prevSnapshot?.regime ?? 'neutral'
  let weakened = prevSnapshot?.weakened ?? false
  let trendStartTime = prevSnapshot?.trendStartTime ?? null
  let trendStartPrice = prevSnapshot?.trendStartPrice ?? null

  const crossedUp = prev.value <= CCI_LEVEL && curr.value > CCI_LEVEL
  const crossedDown = prev.value >= -CCI_LEVEL && curr.value < -CCI_LEVEL
  const weakenedNow = regime === 'up' && !weakened && prev.value > CCI_LEVEL && curr.value <= CCI_LEVEL

  let signal
  let trendPhase
  let closedTrend = null // a completed trends record, written only when a regime actually flips

  if (crossedUp) {
    signal = regime === 'up' ? 'weak_buy' : 'strong_buy'
    if (regime === 'down' && trendStartTime) {
      closedTrend = {
        direction: 'down',
        startTime: trendStartTime,
        endTime: nowIso,
        startPrice: trendStartPrice,
        endPrice: price,
        movePct: ((price - trendStartPrice) / trendStartPrice) * 100,
      }
    }
    if (regime !== 'up') {
      trendStartTime = nowIso
      trendStartPrice = price
    }
    regime = 'up'
    weakened = false
    trendPhase = 'beginning'
  } else if (crossedDown) {
    if (regime === 'up' && trendStartTime) {
      closedTrend = {
        direction: 'up',
        startTime: trendStartTime,
        endTime: nowIso,
        startPrice: trendStartPrice,
        endPrice: price,
        movePct: ((price - trendStartPrice) / trendStartPrice) * 100,
      }
    }
    signal = 'strong_sell'
    regime = 'down'
    weakened = false
    trendStartTime = nowIso
    trendStartPrice = price
    trendPhase = 'beginning'
  } else if (weakenedNow) {
    signal = 'partial_sell'
    weakened = true
    trendPhase = 'end'
  } else {
    signal = 'hold'
    trendPhase = weakened ? 'end' : regime === 'neutral' ? 'beginning' : 'middle'
  }

  const ema20 = computeEMA(candles, 20)
  const ema50 = computeEMA(candles, 50)

  return {
    snapshot: {
      timestamp: nowIso,
      price,
      indicators: {
        cci: curr.value,
        ema20: ema20[ema20.length - 1]?.value ?? null,
        ema50: ema50[ema50.length - 1]?.value ?? null,
      },
      signal,
      trendPhase,
      regime,
      weakened,
      trendStartTime,
      trendStartPrice,
    },
    closedTrend,
  }
}

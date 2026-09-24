import { computeCCI, computeEMA } from './lib/indicators.js'

const CCI_PERIOD = 14
const CCI_LEVEL = 100

function lastTwo(points) {
  if (points.length < 2) return null
  return { prev: points[points.length - 2], curr: points[points.length - 1] }
}

// Derives one step's signal/trendPhase from a CCI value transition, per the approved
// rules: strong_buy = CCI crosses above +100 from a 'down' or 'neutral' regime (new
// uptrend). weak_buy = CCI re-crosses above +100 while already in an 'up' regime
// (re-entry after a dip, not a fresh trend). partial_sell = CCI crosses back below +100
// after being above it, without a full reversal (momentum fading, not over). strong_sell
// = CCI crosses below -100 (reversal into a new downtrend, or the first down-trend).
// Anything else is 'hold'.
//
// Needs the PRIOR regime/weakened state, not just the prior "signal" — 'hold' alone is
// ambiguous (it can mean "holding an established uptrend" or "holding a weakened one
// still waiting to reverse"). Pure and side-effect-free so both the live hourly step
// (computeSnapshotUpdate) and the bulk historical replay (backfillTrendHistory) below
// use the exact same logic instead of two implementations that could drift apart.
function stepSignal({ prevCci, currCci, price, timestamp, prevState }) {
  let { regime, weakened, trendStartTime, trendStartPrice } = prevState

  const crossedUp = prevCci <= CCI_LEVEL && currCci > CCI_LEVEL
  const crossedDown = prevCci >= -CCI_LEVEL && currCci < -CCI_LEVEL
  const weakenedNow = regime === 'up' && !weakened && prevCci > CCI_LEVEL && currCci <= CCI_LEVEL

  let signal
  let trendPhase
  let closedTrend = null

  if (crossedUp) {
    signal = regime === 'up' ? 'weak_buy' : 'strong_buy'
    if (regime === 'down' && trendStartTime) {
      closedTrend = {
        direction: 'down',
        startTime: trendStartTime,
        endTime: timestamp,
        startPrice: trendStartPrice,
        endPrice: price,
        movePct: ((price - trendStartPrice) / trendStartPrice) * 100,
      }
    }
    if (regime !== 'up') {
      trendStartTime = timestamp
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
        endTime: timestamp,
        startPrice: trendStartPrice,
        endPrice: price,
        movePct: ((price - trendStartPrice) / trendStartPrice) * 100,
      }
    }
    signal = 'strong_sell'
    regime = 'down'
    weakened = false
    trendStartTime = timestamp
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

  return { signal, trendPhase, regime, weakened, trendStartTime, trendStartPrice, closedTrend }
}

// Regime/weakened/trendStartTime/trendStartPrice are carried forward on the snapshot
// doc itself as bookkeeping fields (not just the fields originally sketched in
// CLAUDE.md's "Planned" note) so the next hourly run can read them back.
export function computeSnapshotUpdate(candles, prevSnapshot) {
  const cci = computeCCI(candles, CCI_PERIOD)
  const aligned = lastTwo(cci)
  if (!aligned) return null

  const price = candles[candles.length - 1].close
  const time = candles[candles.length - 1].time
  const nowIso = new Date(time * 1000).toISOString()

  const prevState = {
    regime: prevSnapshot?.regime ?? 'neutral',
    weakened: prevSnapshot?.weakened ?? false,
    trendStartTime: prevSnapshot?.trendStartTime ?? null,
    trendStartPrice: prevSnapshot?.trendStartPrice ?? null,
  }
  const step = stepSignal({ prevCci: aligned.prev.value, currCci: aligned.curr.value, price, timestamp: nowIso, prevState })

  const ema20 = computeEMA(candles, 20)
  const ema50 = computeEMA(candles, 50)

  return {
    snapshot: {
      timestamp: nowIso,
      price,
      indicators: {
        cci: aligned.curr.value,
        ema20: ema20[ema20.length - 1]?.value ?? null,
        ema50: ema50[ema50.length - 1]?.value ?? null,
      },
      signal: step.signal,
      trendPhase: step.trendPhase,
      regime: step.regime,
      weakened: step.weakened,
      trendStartTime: step.trendStartTime,
      trendStartPrice: step.trendStartPrice,
    },
    closedTrend: step.closedTrend,
  }
}

// One-time (or re-run on demand) reconstruction of signal/trend history from candles
// already on hand, rather than only ever accumulating forward from whenever a symbol was
// added to the watchlist. Replays the exact same stepSignal logic bar-by-bar across the
// whole CCI series, so the result is identical to what the live hourly engine would have
// produced had it been running the entire time.
//
// Returns every bar where something happened (a non-'hold' signal) plus the final bar
// (the current state) — not every single 'hold' bar, which for a few thousand hourly
// candles would mean a few thousand near-identical Cosmos writes for one on-demand
// action. `trends` are always complete, since those only get written on an actual close.
export function backfillTrendHistory(candles) {
  const cci = computeCCI(candles, CCI_PERIOD)
  if (cci.length < 2) return { events: [], trends: [] }

  const timeToCandle = new Map(candles.map((c) => [c.time, c]))
  const ema20 = computeEMA(candles, 20)
  const ema50 = computeEMA(candles, 50)
  const timeToEma20 = new Map(ema20.map((p) => [p.time, p.value]))
  const timeToEma50 = new Map(ema50.map((p) => [p.time, p.value]))

  let state = { regime: 'neutral', weakened: false, trendStartTime: null, trendStartPrice: null }
  const events = []
  const trends = []

  for (let i = 1; i < cci.length; i++) {
    const candle = timeToCandle.get(cci[i].time)
    if (!candle) continue
    const timestamp = new Date(candle.time * 1000).toISOString()

    const step = stepSignal({
      prevCci: cci[i - 1].value,
      currCci: cci[i].value,
      price: candle.close,
      timestamp,
      prevState: state,
    })
    state = {
      regime: step.regime,
      weakened: step.weakened,
      trendStartTime: step.trendStartTime,
      trendStartPrice: step.trendStartPrice,
    }
    if (step.closedTrend) trends.push(step.closedTrend)

    const isLast = i === cci.length - 1
    if (step.signal !== 'hold' || isLast) {
      events.push({
        timestamp,
        price: candle.close,
        indicators: { cci: cci[i].value, ema20: timeToEma20.get(candle.time) ?? null, ema50: timeToEma50.get(candle.time) ?? null },
        signal: step.signal,
        trendPhase: step.trendPhase,
        regime: step.regime,
        weakened: step.weakened,
        trendStartTime: step.trendStartTime,
        trendStartPrice: step.trendStartPrice,
      })
    }
  }

  return { events, trends }
}

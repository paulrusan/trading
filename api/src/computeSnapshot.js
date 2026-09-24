import { computeCCI, computeSMA } from './lib/indicators.js'

const CCI_PERIOD = 20
const MA_PERIOD = 200

function lastTwo(points) {
  if (points.length < 2) return null
  return { prev: points[points.length - 2], curr: points[points.length - 1] }
}

// A real long/short trading rule, not just a trend detector:
//   - price vs SMA(200) sets the regime: above it is "up", below it is "down".
//   - CCI(20) crossing the zero line is the trigger — but what a crossing MEANS
//     depends entirely on the regime at that moment:
//       up-regime,   CCI crosses up   -> enter long   (buy)
//       up-regime,   CCI crosses down -> exit the long (exit_long)
//       down-regime, CCI crosses down -> enter short  (short)
//       down-regime, CCI crosses up   -> exit the short (exit_short)
// Every zero-line crossing produces one of those four signals — none are filtered
// out as noise the way the old SMA(200)-agreement rule rejected them. The regime
// gate means an entry only ever fires in the direction of the 200-SMA trend, and
// an open position is always closed by the *next* opposite crossing rather than
// waiting for the regime to also flip, so a trade's holding time is bounded by
// CCI(20) alone. position/positionStartTime/positionStartPrice are carried
// forward on the snapshot doc so the next hourly run knows what (if anything) is
// currently open.
function stepSignal({ prevCci, currCci, price, sma200, timestamp, prevState }) {
  const { position, positionStartTime, positionStartPrice } = prevState

  const trendUp = sma200 != null && price > sma200
  const trendDown = sma200 != null && price < sma200
  const regime = trendUp ? 'up' : trendDown ? 'down' : 'neutral'

  const crossedUp = prevCci <= 0 && currCci > 0
  const crossedDown = prevCci >= 0 && currCci < 0

  let signal = 'hold'
  let nextPosition = position
  let nextPositionStartTime = positionStartTime
  let nextPositionStartPrice = positionStartPrice
  let closedTrade = null

  if (crossedUp && trendUp) {
    signal = 'buy'
    nextPosition = 'long'
    nextPositionStartTime = timestamp
    nextPositionStartPrice = price
  } else if (crossedDown && trendDown) {
    signal = 'short'
    nextPosition = 'short'
    nextPositionStartTime = timestamp
    nextPositionStartPrice = price
  } else if (crossedDown && trendUp) {
    signal = 'exit_long'
    if (position === 'long' && positionStartTime) {
      closedTrade = {
        direction: 'long',
        startTime: positionStartTime,
        endTime: timestamp,
        startPrice: positionStartPrice,
        endPrice: price,
        movePct: ((price - positionStartPrice) / positionStartPrice) * 100,
      }
    }
    nextPosition = 'flat'
    nextPositionStartTime = null
    nextPositionStartPrice = null
  } else if (crossedUp && trendDown) {
    signal = 'exit_short'
    if (position === 'short' && positionStartTime) {
      closedTrade = {
        direction: 'short',
        startTime: positionStartTime,
        endTime: timestamp,
        startPrice: positionStartPrice,
        endPrice: price,
        movePct: ((positionStartPrice - price) / positionStartPrice) * 100,
      }
    }
    nextPosition = 'flat'
    nextPositionStartTime = null
    nextPositionStartPrice = null
  }

  return {
    signal,
    regime,
    position: nextPosition,
    positionStartTime: nextPositionStartTime,
    positionStartPrice: nextPositionStartPrice,
    closedTrade,
  }
}

// position/positionStartTime/positionStartPrice are carried forward on the snapshot doc
// itself as bookkeeping fields so the next hourly run can read back what's currently open.
export function computeSnapshotUpdate(candles, prevSnapshot) {
  const cci = computeCCI(candles, CCI_PERIOD)
  const aligned = lastTwo(cci)
  if (!aligned) return null

  const price = candles[candles.length - 1].close
  const time = candles[candles.length - 1].time
  const nowIso = new Date(time * 1000).toISOString()

  const sma200 = computeSMA(candles, MA_PERIOD)
  const sma200Now = sma200[sma200.length - 1]?.value ?? null

  const prevState = {
    position: prevSnapshot?.position ?? 'flat',
    positionStartTime: prevSnapshot?.positionStartTime ?? null,
    positionStartPrice: prevSnapshot?.positionStartPrice ?? null,
  }
  const step = stepSignal({
    prevCci: aligned.prev.value,
    currCci: aligned.curr.value,
    price,
    sma200: sma200Now,
    timestamp: nowIso,
    prevState,
  })

  return {
    snapshot: {
      timestamp: nowIso,
      price,
      indicators: { cci: aligned.curr.value, sma200: sma200Now },
      signal: step.signal,
      regime: step.regime,
      position: step.position,
      positionStartTime: step.positionStartTime,
      positionStartPrice: step.positionStartPrice,
    },
    closedTrade: step.closedTrade,
  }
}

// One-time (or re-run on demand) reconstruction of signal/trade history from candles
// already on hand, rather than only ever accumulating forward from whenever a symbol was
// added to the watchlist. Replays the exact same stepSignal logic bar-by-bar, so the
// result is identical to what the live hourly engine would have produced had it been
// running the entire time.
//
// Returns every bar where something happened (a non-'hold' signal — i.e. every CCI
// zero-line crossing) plus the final bar (the current state) — not every single 'hold'
// bar, which for a few thousand hourly candles would mean a few thousand near-identical
// Cosmos writes for one on-demand action. `trends` are always complete, closed trades.
export function backfillTrendHistory(candles) {
  const cci = computeCCI(candles, CCI_PERIOD)
  if (cci.length < 2) return { events: [], trends: [] }

  const timeToCandle = new Map(candles.map((c) => [c.time, c]))
  const sma200 = computeSMA(candles, MA_PERIOD)
  const timeToSma200 = new Map(sma200.map((p) => [p.time, p.value]))

  let state = { position: 'flat', positionStartTime: null, positionStartPrice: null }
  const events = []
  const trends = []

  for (let i = 1; i < cci.length; i++) {
    const candle = timeToCandle.get(cci[i].time)
    if (!candle) continue
    const timestamp = new Date(candle.time * 1000).toISOString()
    const sma200Now = timeToSma200.get(candle.time) ?? null

    const step = stepSignal({
      prevCci: cci[i - 1].value,
      currCci: cci[i].value,
      price: candle.close,
      sma200: sma200Now,
      timestamp,
      prevState: state,
    })
    state = {
      position: step.position,
      positionStartTime: step.positionStartTime,
      positionStartPrice: step.positionStartPrice,
    }
    if (step.closedTrade) trends.push(step.closedTrade)

    const isLast = i === cci.length - 1
    if (step.signal !== 'hold' || isLast) {
      events.push({
        timestamp,
        price: candle.close,
        indicators: { cci: cci[i].value, sma200: sma200Now },
        signal: step.signal,
        regime: step.regime,
        position: step.position,
        positionStartTime: step.positionStartTime,
        positionStartPrice: step.positionStartPrice,
      })
    }
  }

  return { events, trends }
}

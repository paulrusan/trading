import { computeCCI, computeParabolicSAR, computeSMA } from './lib/indicators.js'

const CCI_PERIOD = 20
const MA_PERIOD = 200

function lastTwo(points) {
  if (points.length < 2) return null
  return { prev: points[points.length - 2], curr: points[points.length - 1] }
}

// A real long/short trading rule, using a different indicator for entries than for exits:
//   - price vs SMA(200) sets the regime: above it is "up", below it is "down".
//   - CCI(20) crossing the zero line is the ENTRY trigger, gated by the regime — only
//     while flat, an up-regime + CCI cross-up enters a long, a down-regime + CCI
//     cross-down enters a short. CCI is fast and confirms early, good for timing the
//     start of a move.
//   - Parabolic SAR is the EXIT trigger — only while a position is open, a long exits
//     when price crosses below the SAR dots, a short exits when price crosses above
//     them. SAR trails the trend and only flips on a structural reversal, so it holds
//     through the small oscillations that made CCI-based exits whipsaw (the previous
//     version of this rule exited on every opposite CCI crossing, which cut winning
//     trades short constantly — see CLAUDE.md's "Watchlist" section for the numbers).
// CCI crossings that happen while a position is already open are ignored (not a new
// entry, just noise inside a trade already running) — entries and exits are each only
// evaluated in the position state they apply to. position/positionStartTime/
// positionStartPrice are carried forward on the snapshot doc so the next hourly run
// knows what (if anything) is currently open.
function stepSignal({ prevCci, currCci, prevPrice, price, prevSar, currSar, sma200, timestamp, prevState }) {
  const { position, positionStartTime, positionStartPrice } = prevState

  const trendUp = sma200 != null && price > sma200
  const trendDown = sma200 != null && price < sma200
  const regime = trendUp ? 'up' : trendDown ? 'down' : 'neutral'

  const crossedUp = prevCci <= 0 && currCci > 0
  const crossedDown = prevCci >= 0 && currCci < 0

  const sarReady = prevSar != null && currSar != null
  const sarFlippedDown = sarReady && prevPrice >= prevSar && price < currSar
  const sarFlippedUp = sarReady && prevPrice <= prevSar && price > currSar

  let signal = 'hold'
  let nextPosition = position
  let nextPositionStartTime = positionStartTime
  let nextPositionStartPrice = positionStartPrice
  let closedTrade = null

  if (position === 'flat') {
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
    }
  } else if (position === 'long' && sarFlippedDown) {
    signal = 'exit_long'
    closedTrade = {
      direction: 'long',
      startTime: positionStartTime,
      endTime: timestamp,
      startPrice: positionStartPrice,
      endPrice: price,
      movePct: ((price - positionStartPrice) / positionStartPrice) * 100,
    }
    nextPosition = 'flat'
    nextPositionStartTime = null
    nextPositionStartPrice = null
  } else if (position === 'short' && sarFlippedUp) {
    signal = 'exit_short'
    closedTrade = {
      direction: 'short',
      startTime: positionStartTime,
      endTime: timestamp,
      startPrice: positionStartPrice,
      endPrice: price,
      movePct: ((positionStartPrice - price) / positionStartPrice) * 100,
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

  const sar = computeParabolicSAR(candles)
  const timeToSar = new Map(sar.map((p) => [p.time, p.value]))

  const prevCandle = candles[candles.length - 2]
  const currCandle = candles[candles.length - 1]
  const price = currCandle.close
  const nowIso = new Date(currCandle.time * 1000).toISOString()

  const sma200 = computeSMA(candles, MA_PERIOD)
  const sma200Now = sma200[sma200.length - 1]?.value ?? null

  const prevSarVal = prevCandle ? (timeToSar.get(prevCandle.time) ?? null) : null
  const currSarVal = timeToSar.get(currCandle.time) ?? null

  const prevState = {
    position: prevSnapshot?.position ?? 'flat',
    positionStartTime: prevSnapshot?.positionStartTime ?? null,
    positionStartPrice: prevSnapshot?.positionStartPrice ?? null,
  }
  const step = stepSignal({
    prevCci: aligned.prev.value,
    currCci: aligned.curr.value,
    prevPrice: prevCandle?.close ?? null,
    price,
    prevSar: prevSarVal,
    currSar: currSarVal,
    sma200: sma200Now,
    timestamp: nowIso,
    prevState,
  })

  return {
    snapshot: {
      timestamp: nowIso,
      price,
      indicators: { cci: aligned.curr.value, sma200: sma200Now, sar: currSarVal },
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
// Returns every bar where something happened (an entry or exit) plus the final bar (the
// current state) — not every single 'hold' bar, which for a few thousand hourly candles
// would mean a few thousand near-identical Cosmos writes for one on-demand action.
// `trends` are always complete, closed trades.
export function backfillTrendHistory(candles) {
  const cci = computeCCI(candles, CCI_PERIOD)
  if (cci.length < 2) return { events: [], trends: [] }

  const timeToCandle = new Map(candles.map((c) => [c.time, c]))
  const sma200 = computeSMA(candles, MA_PERIOD)
  const timeToSma200 = new Map(sma200.map((p) => [p.time, p.value]))
  const sar = computeParabolicSAR(candles)
  const timeToSar = new Map(sar.map((p) => [p.time, p.value]))

  let state = { position: 'flat', positionStartTime: null, positionStartPrice: null }
  const events = []
  const trends = []

  for (let i = 1; i < cci.length; i++) {
    const candle = timeToCandle.get(cci[i].time)
    const prevCandle = timeToCandle.get(cci[i - 1].time)
    if (!candle || !prevCandle) continue
    const timestamp = new Date(candle.time * 1000).toISOString()
    const sma200Now = timeToSma200.get(candle.time) ?? null
    const sarNow = timeToSar.get(candle.time) ?? null
    const sarPrev = timeToSar.get(prevCandle.time) ?? null

    const step = stepSignal({
      prevCci: cci[i - 1].value,
      currCci: cci[i].value,
      prevPrice: prevCandle.close,
      price: candle.close,
      prevSar: sarPrev,
      currSar: sarNow,
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
        indicators: { cci: cci[i].value, sma200: sma200Now, sar: sarNow },
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

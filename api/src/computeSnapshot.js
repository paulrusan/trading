import { computeCCI, computeSMA } from './lib/indicators.js'

const CCI_PERIOD = 20
const MA_PERIOD = 200

function lastTwo(points) {
  if (points.length < 2) return null
  return { prev: points[points.length - 2], curr: points[points.length - 1] }
}

// Trend rule, tuned against real data rather than guessed: CCI(20) crossing the zero
// line marks a trend flip, but only counts when price agrees with the 200-period SMA's
// side (price above it for an up-flip, below it for a down-flip) — the SMA(200) filters
// out counter-trend noise from the zero-line crossing, which alone is far noisier than
// it looks (see CLAUDE.md's "Watchlist" section for the comparison numbers). Verified
// against ~149 days of real USD/CAD 1h data before shipping: raw CCI(20) zero-crossing
// alone gave 326 flips; adding the SMA(200) filter cut that to 19, and each of those 19
// checked out as a real, sensible trend segment (including one that ran the entire
// June-July period) rather than noise.
//
// This replaces the old CCI(14)/+-100 rule, which had its own weak_buy/partial_sell
// distinction for re-entries and fading momentum near the +-100 extreme. There's no
// natural equivalent of that here — a rejected crossing is just noise, not a distinct
// state — so the signal set is simpler: strong_buy / strong_sell / hold.
function stepSignal({ prevCci, currCci, price, sma200, timestamp, prevState }) {
  const { regime, trendStartTime, trendStartPrice } = prevState

  const crossedUp = prevCci <= 0 && currCci > 0
  const crossedDown = prevCci >= 0 && currCci < 0
  // No SMA(200) yet (still warming up) — don't filter, but don't confirm either; treat
  // as if the crossing didn't happen rather than accepting it unfiltered.
  const agreesUp = sma200 != null && price > sma200
  const agreesDown = sma200 != null && price < sma200

  let signal = 'hold'
  let trendPhase = regime === 'neutral' ? 'beginning' : 'middle'
  let nextRegime = regime
  let nextTrendStartTime = trendStartTime
  let nextTrendStartPrice = trendStartPrice
  let closedTrend = null

  if (crossedUp && agreesUp && regime !== 'up') {
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
    signal = 'strong_buy'
    trendPhase = 'beginning'
    nextRegime = 'up'
    nextTrendStartTime = timestamp
    nextTrendStartPrice = price
  } else if (crossedDown && agreesDown && regime !== 'down') {
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
    trendPhase = 'beginning'
    nextRegime = 'down'
    nextTrendStartTime = timestamp
    nextTrendStartPrice = price
  }

  return {
    signal,
    trendPhase,
    regime: nextRegime,
    trendStartTime: nextTrendStartTime,
    trendStartPrice: nextTrendStartPrice,
    closedTrend,
  }
}

// regime/trendStartTime/trendStartPrice are carried forward on the snapshot doc itself
// as bookkeeping fields so the next hourly run can read them back — a rejected (noise)
// crossing needs to know the CURRENT confirmed regime, not just the last signal.
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
    regime: prevSnapshot?.regime ?? 'neutral',
    trendStartTime: prevSnapshot?.trendStartTime ?? null,
    trendStartPrice: prevSnapshot?.trendStartPrice ?? null,
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
      trendPhase: step.trendPhase,
      regime: step.regime,
      trendStartTime: step.trendStartTime,
      trendStartPrice: step.trendStartPrice,
    },
    closedTrend: step.closedTrend,
  }
}

// One-time (or re-run on demand) reconstruction of signal/trend history from candles
// already on hand, rather than only ever accumulating forward from whenever a symbol was
// added to the watchlist. Replays the exact same stepSignal logic bar-by-bar, so the
// result is identical to what the live hourly engine would have produced had it been
// running the entire time.
//
// Returns every bar where something happened (a non-'hold' signal) plus the final bar
// (the current state) — not every single 'hold' bar, which for a few thousand hourly
// candles would mean a few thousand near-identical Cosmos writes for one on-demand
// action. `trends` are always complete, since those only get written on an actual close.
export function backfillTrendHistory(candles) {
  const cci = computeCCI(candles, CCI_PERIOD)
  if (cci.length < 2) return { events: [], trends: [] }

  const timeToCandle = new Map(candles.map((c) => [c.time, c]))
  const sma200 = computeSMA(candles, MA_PERIOD)
  const timeToSma200 = new Map(sma200.map((p) => [p.time, p.value]))

  let state = { regime: 'neutral', trendStartTime: null, trendStartPrice: null }
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
      regime: step.regime,
      trendStartTime: step.trendStartTime,
      trendStartPrice: step.trendStartPrice,
    }
    if (step.closedTrend) trends.push(step.closedTrend)

    const isLast = i === cci.length - 1
    if (step.signal !== 'hold' || isLast) {
      events.push({
        timestamp,
        price: candle.close,
        indicators: { cci: cci[i].value, sma200: sma200Now },
        signal: step.signal,
        trendPhase: step.trendPhase,
        regime: step.regime,
        trendStartTime: step.trendStartTime,
        trendStartPrice: step.trendStartPrice,
      })
    }
  }

  return { events, trends }
}

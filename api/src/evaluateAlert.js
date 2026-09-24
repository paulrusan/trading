import { computeCCI, computeEMA, computeMACD, computeRSI, computeStochastic, toHeikinAshi } from './lib/indicators.js'

function lastTwoAligned(candles, points) {
  if (points.length < 2) return null
  const prevPoint = points[points.length - 2]
  const currPoint = points[points.length - 1]
  const prevCandle = candles.find((c) => c.time === prevPoint.time)
  const currCandle = candles.find((c) => c.time === currPoint.time)
  if (!prevCandle || !currCandle) return null
  return { prev: { ...prevPoint, candle: prevCandle }, curr: { ...currPoint, candle: currCandle } }
}

function isAbove(direction, value, level) {
  return direction === 'above' ? value > level : value < level
}

// Evaluates whether one condition is currently satisfied at the previous and
// current candle. Not edge-triggered itself — combining multiple conditions
// and edge-triggering the combined result happens in evaluateAlert below.
// `candles` here is already resolved to the right interval for this condition
// (see evaluateAlert's candlesByInterval lookup).
function evaluateCondition(condition, candles) {
  if (condition.type === 'haColor') {
    const ha = toHeikinAshi(candles)
    if (ha.length < 2) return null
    const colorOf = (c) => (c.close >= c.open ? 'green' : 'red')
    const prev = colorOf(ha[ha.length - 2])
    const curr = colorOf(ha[ha.length - 1])
    // A plain state check ("is the candle this color"), not a "just flipped" check —
    // relying on evaluateAlert's own edge-trigger (combined state going from not-met to
    // met) to produce "first green after red" naturally: once this condition and every
    // other one in the alert are all true for the first time, that's the fire. If the
    // color stays the same color for several bars in a row, this stays "met" the whole
    // time but doesn't re-trigger, since the edge only fires once per transition.
    return {
      prevMet: prev === condition.haColor,
      currMet: curr === condition.haColor,
      label: `Heikin Ashi ${condition.haColor} (now ${curr})`,
    }
  }

  if (condition.type === 'price') {
    const prev = candles[candles.length - 2]
    const curr = candles[candles.length - 1]
    return {
      prevMet: isAbove(condition.priceDirection, prev.close, condition.priceLevel),
      currMet: isAbove(condition.priceDirection, curr.close, condition.priceLevel),
      label: `price ${condition.priceDirection} ${condition.priceLevel} (now ${curr.close})`,
    }
  }

  const period = condition.indicatorPeriod ?? 14

  if (condition.indicatorKey === 'cci') {
    const aligned = lastTwoAligned(candles, computeCCI(candles, period))
    if (!aligned) return null
    return {
      prevMet: isAbove(condition.indicatorDirection, aligned.prev.value, condition.indicatorLevel),
      currMet: isAbove(condition.indicatorDirection, aligned.curr.value, condition.indicatorLevel),
      label: `CCI(${period}) ${condition.indicatorDirection} ${condition.indicatorLevel} (now ${aligned.curr.value.toFixed(2)})`,
    }
  }

  if (condition.indicatorKey === 'rsi') {
    const aligned = lastTwoAligned(candles, computeRSI(candles, period))
    if (!aligned) return null
    return {
      prevMet: isAbove(condition.indicatorDirection, aligned.prev.value, condition.indicatorLevel),
      currMet: isAbove(condition.indicatorDirection, aligned.curr.value, condition.indicatorLevel),
      label: `RSI(${period}) ${condition.indicatorDirection} ${condition.indicatorLevel} (now ${aligned.curr.value.toFixed(2)})`,
    }
  }

  if (condition.indicatorKey === 'stoch') {
    const { k } = computeStochastic(candles, period, 3)
    const aligned = lastTwoAligned(candles, k)
    if (!aligned) return null
    return {
      prevMet: isAbove(condition.indicatorDirection, aligned.prev.value, condition.indicatorLevel),
      currMet: isAbove(condition.indicatorDirection, aligned.curr.value, condition.indicatorLevel),
      label: `Stochastic %K(${period}) ${condition.indicatorDirection} ${condition.indicatorLevel} (now ${aligned.curr.value.toFixed(2)})`,
    }
  }

  if (condition.indicatorKey === 'macd') {
    const { histogram } = computeMACD(candles, 12, 26, 9)
    const aligned = lastTwoAligned(candles, histogram)
    if (!aligned) return null
    return {
      prevMet: isAbove(condition.indicatorDirection, aligned.prev.value, 0),
      currMet: isAbove(condition.indicatorDirection, aligned.curr.value, 0),
      label: `MACD histogram ${condition.indicatorDirection === 'above' ? 'bullish' : 'bearish'} (now ${aligned.curr.value.toFixed(4)})`,
    }
  }

  if (condition.indicatorKey === 'ema') {
    const aligned = lastTwoAligned(candles, computeEMA(candles, period))
    if (!aligned) return null
    const prevDiff = aligned.prev.candle.close - aligned.prev.value
    const currDiff = aligned.curr.candle.close - aligned.curr.value
    return {
      prevMet: condition.indicatorDirection === 'above' ? prevDiff > 0 : prevDiff < 0,
      currMet: condition.indicatorDirection === 'above' ? currDiff > 0 : currDiff < 0,
      label: `price ${condition.indicatorDirection} its EMA(${period}) (price ${aligned.curr.candle.close}, EMA ${aligned.curr.value.toFixed(2)})`,
    }
  }

  return null
}

// An alert has one or more conditions combined with matchMode 'all' (AND) or
// 'any' (OR). Each condition can specify its own `interval` (e.g. a daily
// trend-permission condition alongside an hourly trigger condition in the
// same alert) — falling back to the alert's own `interval` when not set, so
// existing single-interval alerts keep working unchanged. `candlesByInterval`
// is a Map from interval string to that interval's candles (see
// alertsEngine.js, which fetches every interval any of the alert's
// conditions needs). The combined result is what gets edge-triggered — it
// fires once when the combined state transitions from not-met to met, not
// every check it stays met. Returns null if there isn't enough data yet to
// evaluate any condition, otherwise { triggered, candleTime, message }.
export function evaluateAlert(alert, candlesByInterval) {
  const results = alert.conditions.map((c) => {
    const candles = candlesByInterval.get(c.interval ?? alert.interval)
    if (!candles || candles.length < 2) return null
    return evaluateCondition(c, candles)
  })
  if (results.some((r) => r === null)) return null

  const matchAny = alert.matchMode === 'any'
  const combine = (key) => (matchAny ? results.some((r) => r[key]) : results.every((r) => r[key]))

  // The trigger/dedup timestamp is the alert's own (primary) interval's latest candle —
  // the fastest-moving interval actually driving when this alert can fire.
  const triggerCandles = candlesByInterval.get(alert.interval)
  const curr = triggerCandles[triggerCandles.length - 1]

  const labelFor = (condition, result) => {
    const interval = condition.interval ?? alert.interval
    const prefix = interval !== alert.interval ? `${interval} ` : ''
    return `${prefix}${result.label}`
  }

  return {
    triggered: !combine('prevMet') && combine('currMet'),
    candleTime: curr.time,
    message: `${alert.symbol}: ${alert.conditions.map((c, i) => labelFor(c, results[i])).join(matchAny ? ' OR ' : ' AND ')}`,
  }
}

import { computeCCI, computeEMA, computeMACD, computeRSI, computeStochastic } from './lib/indicators.js'

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
function evaluateCondition(condition, candles) {
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

// An alert has one or more conditions (all evaluated against the same
// symbol/interval's candles) combined with matchMode 'all' (AND) or 'any'
// (OR). The combined result is what gets edge-triggered — it fires once
// when the combined state transitions from not-met to met, not every check
// it stays met. Returns null if there isn't enough data yet to evaluate,
// otherwise { triggered: boolean, candleTime: number, message: string }.
export function evaluateAlert(alert, candles) {
  if (candles.length < 2) return null

  const results = alert.conditions.map((c) => evaluateCondition(c, candles))
  if (results.some((r) => r === null)) return null

  const matchAny = alert.matchMode === 'any'
  const combine = (key) => (matchAny ? results.some((r) => r[key]) : results.every((r) => r[key]))
  const curr = candles[candles.length - 1]

  return {
    triggered: !combine('prevMet') && combine('currMet'),
    candleTime: curr.time,
    message: `${alert.symbol}: ${results.map((r) => r.label).join(matchAny ? ' OR ' : ' AND ')}`,
  }
}

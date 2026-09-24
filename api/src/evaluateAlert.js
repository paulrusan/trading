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

// Edge-triggered: fires on the transition from not-met to met, not every bar it stays met.
function crossed(prevValue, currValue, level, direction) {
  if (direction === 'above') return prevValue <= level && currValue > level
  return prevValue >= level && currValue < level
}

// Returns null if there isn't enough data yet to evaluate, otherwise
// { triggered: boolean, candleTime: number, message: string }.
export function evaluateAlert(alert, candles) {
  if (candles.length < 2) return null

  if (alert.type === 'price') {
    const prev = candles[candles.length - 2]
    const curr = candles[candles.length - 1]
    return {
      triggered: crossed(prev.close, curr.close, alert.priceLevel, alert.priceDirection),
      candleTime: curr.time,
      message: `${alert.symbol} price crossed ${alert.priceDirection} ${alert.priceLevel} (now ${curr.close}).`,
    }
  }

  const period = alert.indicatorPeriod ?? 14

  if (alert.indicatorKey === 'cci') {
    const aligned = lastTwoAligned(candles, computeCCI(candles, period))
    if (!aligned) return null
    return {
      triggered: crossed(aligned.prev.value, aligned.curr.value, alert.indicatorLevel, alert.indicatorDirection),
      candleTime: aligned.curr.time,
      message: `${alert.symbol} CCI(${period}) crossed ${alert.indicatorDirection} ${alert.indicatorLevel} (now ${aligned.curr.value.toFixed(2)}).`,
    }
  }

  if (alert.indicatorKey === 'rsi') {
    const aligned = lastTwoAligned(candles, computeRSI(candles, period))
    if (!aligned) return null
    return {
      triggered: crossed(aligned.prev.value, aligned.curr.value, alert.indicatorLevel, alert.indicatorDirection),
      candleTime: aligned.curr.time,
      message: `${alert.symbol} RSI(${period}) crossed ${alert.indicatorDirection} ${alert.indicatorLevel} (now ${aligned.curr.value.toFixed(2)}).`,
    }
  }

  if (alert.indicatorKey === 'stoch') {
    const { k } = computeStochastic(candles, period, 3)
    const aligned = lastTwoAligned(candles, k)
    if (!aligned) return null
    return {
      triggered: crossed(aligned.prev.value, aligned.curr.value, alert.indicatorLevel, alert.indicatorDirection),
      candleTime: aligned.curr.time,
      message: `${alert.symbol} Stochastic %K(${period}) crossed ${alert.indicatorDirection} ${alert.indicatorLevel} (now ${aligned.curr.value.toFixed(2)}).`,
    }
  }

  if (alert.indicatorKey === 'macd') {
    const { histogram } = computeMACD(candles, 12, 26, 9)
    const aligned = lastTwoAligned(candles, histogram)
    if (!aligned) return null
    // Zero-cross: direction 'above' = bullish cross, 'below' = bearish cross.
    return {
      triggered: crossed(aligned.prev.value, aligned.curr.value, 0, alert.indicatorDirection),
      candleTime: aligned.curr.time,
      message: `${alert.symbol} MACD histogram turned ${
        alert.indicatorDirection === 'above' ? 'bullish (crossed above 0)' : 'bearish (crossed below 0)'
      } (now ${aligned.curr.value.toFixed(4)}).`,
    }
  }

  if (alert.indicatorKey === 'ema') {
    const aligned = lastTwoAligned(candles, computeEMA(candles, period))
    if (!aligned) return null
    const prevDiff = aligned.prev.candle.close - aligned.prev.value
    const currDiff = aligned.curr.candle.close - aligned.curr.value
    const triggered =
      alert.indicatorDirection === 'above' ? prevDiff <= 0 && currDiff > 0 : prevDiff >= 0 && currDiff < 0
    return {
      triggered,
      candleTime: aligned.curr.time,
      message: `${alert.symbol} price crossed ${alert.indicatorDirection} its EMA(${period}) (price ${aligned.curr.candle.close}, EMA ${aligned.curr.value.toFixed(2)}).`,
    }
  }

  return null
}

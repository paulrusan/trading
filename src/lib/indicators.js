export function toHeikinAshi(candles) {
  const result = []
  let prevHA = null

  for (const c of candles) {
    const haClose = (c.open + c.high + c.low + c.close) / 4
    const haOpen = prevHA ? (prevHA.open + prevHA.close) / 2 : (c.open + c.close) / 2
    const haHigh = Math.max(c.high, haOpen, haClose)
    const haLow = Math.min(c.low, haOpen, haClose)
    const ha = { time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose }
    result.push(ha)
    prevHA = ha
  }

  return result
}

export function computeEMA(candles, period) {
  const closes = candles.map((c) => c.close)
  const multiplier = 2 / (period + 1)
  const result = []

  let ema = null
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) continue
    if (ema === null) {
      const seed = closes.slice(i - period + 1, i + 1).reduce((sum, v) => sum + v, 0) / period
      ema = seed
    } else {
      ema = (closes[i] - ema) * multiplier + ema
    }
    result.push({ time: candles[i].time, value: ema })
  }

  return result
}

export function computeCCI(candles, period = 14) {
  const typicalPrices = candles.map((c) => (c.high + c.low + c.close) / 3)
  const result = []

  for (let i = period - 1; i < candles.length; i++) {
    const window = typicalPrices.slice(i - period + 1, i + 1)
    const sma = window.reduce((sum, v) => sum + v, 0) / period
    const meanDeviation = window.reduce((sum, v) => sum + Math.abs(v - sma), 0) / period
    const cci = meanDeviation === 0 ? 0 : (typicalPrices[i] - sma) / (0.015 * meanDeviation)
    result.push({ time: candles[i].time, value: cci })
  }

  return result
}

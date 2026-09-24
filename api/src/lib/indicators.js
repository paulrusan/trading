// Ported from src/lib/indicators.js (frontend) — kept as an exact copy since these are
// pure functions with no browser dependencies. Update both files together if the math
// changes; there's no shared package between the two projects to enforce this.

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

export function computeSMA(candles, period) {
  const result = []
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close
    result.push({ time: candles[i].time, value: sum / period })
  }
  return result
}

export function computeBollingerBands(candles, period = 20, stdDevMultiplier = 2) {
  const basis = []
  const upper = []
  const lower = []

  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close
    const mean = sum / period
    let variance = 0
    for (let j = i - period + 1; j <= i; j++) variance += (candles[j].close - mean) ** 2
    const stdDev = Math.sqrt(variance / period)
    const time = candles[i].time
    basis.push({ time, value: mean })
    upper.push({ time, value: mean + stdDevMultiplier * stdDev })
    lower.push({ time, value: mean - stdDevMultiplier * stdDev })
  }

  return { basis, upper, lower }
}

export function computeRSI(candles, period = 14) {
  const result = []
  if (candles.length < period + 1) return result

  let gainSum = 0
  let lossSum = 0
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close
    if (change >= 0) gainSum += change
    else lossSum -= change
  }
  let avgGain = gainSum / period
  let avgLoss = lossSum / period

  const toRsi = (time, gain, loss) => {
    if (loss === 0) return { time, value: 100 }
    const rs = gain / loss
    return { time, value: 100 - 100 / (1 + rs) }
  }

  result.push(toRsi(candles[period].time, avgGain, avgLoss))

  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    result.push(toRsi(candles[i].time, avgGain, avgLoss))
  }

  return result
}

function emaOfValues(points, period) {
  const multiplier = 2 / (period + 1)
  const result = []

  let ema = null
  for (let i = 0; i < points.length; i++) {
    if (i < period - 1) continue
    if (ema === null) {
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) sum += points[j].value
      ema = sum / period
    } else {
      ema = (points[i].value - ema) * multiplier + ema
    }
    result.push({ time: points[i].time, value: ema })
  }

  return result
}

export function computeMACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const emaFast = computeEMA(candles, fastPeriod)
  const emaSlow = computeEMA(candles, slowPeriod)
  const fastMap = new Map(emaFast.map((p) => [p.time, p.value]))

  const macdLine = emaSlow
    .filter((p) => fastMap.has(p.time))
    .map((p) => ({ time: p.time, value: fastMap.get(p.time) - p.value }))

  const signalLine = emaOfValues(macdLine, signalPeriod)
  const signalMap = new Map(signalLine.map((p) => [p.time, p.value]))

  const histogram = macdLine
    .filter((p) => signalMap.has(p.time))
    .map((p) => ({ time: p.time, value: p.value - signalMap.get(p.time) }))

  return { macdLine, signalLine, histogram }
}

export function computeATR(candles, period = 14) {
  const result = []
  if (candles.length < period) return result

  const trueRanges = candles.map((c, i) => {
    if (i === 0) return c.high - c.low
    const prevClose = candles[i - 1].close
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose))
  })

  let sum = 0
  for (let i = 0; i < period; i++) sum += trueRanges[i]
  let atr = sum / period
  result.push({ time: candles[period - 1].time, value: atr })

  for (let i = period; i < candles.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period
    result.push({ time: candles[i].time, value: atr })
  }

  return result
}

export function computeStochastic(candles, kPeriod = 14, dPeriod = 3) {
  const kValues = []

  for (let i = kPeriod - 1; i < candles.length; i++) {
    let highest = -Infinity
    let lowest = Infinity
    for (let j = i - kPeriod + 1; j <= i; j++) {
      highest = Math.max(highest, candles[j].high)
      lowest = Math.min(lowest, candles[j].low)
    }
    const k = highest === lowest ? 0 : ((candles[i].close - lowest) / (highest - lowest)) * 100
    kValues.push({ time: candles[i].time, value: k })
  }

  const dValues = []
  for (let i = dPeriod - 1; i < kValues.length; i++) {
    let sum = 0
    for (let j = i - dPeriod + 1; j <= i; j++) sum += kValues[j].value
    dValues.push({ time: kValues[i].time, value: sum / dPeriod })
  }

  return { k: kValues, d: dValues }
}

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

export function computeParabolicSAR(candles, step = 0.02, maxStep = 0.2) {
  const result = []
  if (candles.length < 2) return result

  let isUptrend = candles[1].close >= candles[0].close
  let sar = isUptrend ? candles[0].low : candles[0].high
  let extremePoint = isUptrend ? candles[0].high : candles[0].low
  let af = step

  result.push({ time: candles[0].time, value: sar })

  for (let i = 1; i < candles.length; i++) {
    let nextSar = sar + af * (extremePoint - sar)

    if (isUptrend) {
      const priorLow1 = candles[i - 1].low
      const priorLow2 = i >= 2 ? candles[i - 2].low : priorLow1
      nextSar = Math.min(nextSar, priorLow1, priorLow2)

      if (candles[i].low < nextSar) {
        isUptrend = false
        nextSar = extremePoint
        extremePoint = candles[i].low
        af = step
      } else if (candles[i].high > extremePoint) {
        extremePoint = candles[i].high
        af = Math.min(af + step, maxStep)
      }
    } else {
      const priorHigh1 = candles[i - 1].high
      const priorHigh2 = i >= 2 ? candles[i - 2].high : priorHigh1
      nextSar = Math.max(nextSar, priorHigh1, priorHigh2)

      if (candles[i].high > nextSar) {
        isUptrend = true
        nextSar = extremePoint
        extremePoint = candles[i].high
        af = step
      } else if (candles[i].low < extremePoint) {
        extremePoint = candles[i].low
        af = Math.min(af + step, maxStep)
      }
    }

    sar = nextSar
    result.push({ time: candles[i].time, value: sar })
  }

  return result
}

export function computeADX(candles, period = 14) {
  const result = []
  if (candles.length < period * 2) return result

  const trueRanges = []
  const plusDMs = []
  const minusDMs = []
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close
    trueRanges.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - prevClose),
        Math.abs(candles[i].low - prevClose),
      ),
    )
    const upMove = candles[i].high - candles[i - 1].high
    const downMove = candles[i - 1].low - candles[i].low
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0)
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0)
  }
  // trueRanges[k]/plusDMs[k]/minusDMs[k] correspond to candles[k + 1].

  let smoothedTR = trueRanges.slice(0, period).reduce((sum, v) => sum + v, 0)
  let smoothedPlusDM = plusDMs.slice(0, period).reduce((sum, v) => sum + v, 0)
  let smoothedMinusDM = minusDMs.slice(0, period).reduce((sum, v) => sum + v, 0)

  const dxValues = []
  const pushDx = () => {
    const plusDI = (smoothedPlusDM / smoothedTR) * 100
    const minusDI = (smoothedMinusDM / smoothedTR) * 100
    const diSum = plusDI + minusDI
    dxValues.push(diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100)
  }
  pushDx() // dxValues[0] corresponds to candles[period]

  for (let i = period; i < trueRanges.length; i++) {
    smoothedTR = smoothedTR - smoothedTR / period + trueRanges[i]
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDMs[i]
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDMs[i]
    pushDx() // dxValues[k] corresponds to candles[period + k]
  }

  if (dxValues.length < period) return result

  let adx = dxValues.slice(0, period).reduce((sum, v) => sum + v, 0) / period
  result.push({ time: candles[period + period - 1].time, value: adx })

  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period
    result.push({ time: candles[period + i].time, value: adx })
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

import {
  computeADX,
  computeATR,
  computeBollingerBands,
  computeCCI,
  computeEMA,
  computeMACD,
  computeParabolicSAR,
  computeRSI,
  computeSMA,
  computeStochastic,
} from './indicators'

// tvOverrideName/tvOverrideKey map to TradingView's `studies_overrides` key format
// ("<study name>.<input name>"), reverse-engineered from public examples — TradingView
// doesn't document the free widget's exact input names, so these are best-effort and
// silently no-op if wrong.
export const INDICATOR_DEFS = [
  {
    key: 'ema',
    label: 'EMA',
    tvStudy: 'MAExp@tv-basicstudies',
    tvOverrideName: 'moving average exponential',
    params: [{ key: 'period', label: 'Period', default: 20, tvOverrideKey: 'length' }],
  },
  {
    key: 'sma',
    label: 'SMA',
    tvStudy: 'MASimple@tv-basicstudies',
    tvOverrideName: 'moving average',
    params: [{ key: 'period', label: 'Period', default: 50, tvOverrideKey: 'length' }],
  },
  {
    key: 'bb',
    label: 'Bollinger Bands',
    tvStudy: 'BB@tv-basicstudies',
    tvOverrideName: 'bollinger bands',
    params: [
      { key: 'period', label: 'Period', default: 20, tvOverrideKey: 'length' },
      { key: 'stdDev', label: 'StdDev', default: 2 },
    ],
  },
  {
    key: 'cci',
    label: 'CCI',
    tvStudy: 'CCI@tv-basicstudies',
    tvOverrideName: 'commodity channel index',
    params: [{ key: 'period', label: 'Period', default: 14, tvOverrideKey: 'length' }],
  },
  {
    key: 'rsi',
    label: 'RSI',
    tvStudy: 'RSI@tv-basicstudies',
    tvOverrideName: 'relative strength index',
    params: [{ key: 'period', label: 'Period', default: 14, tvOverrideKey: 'length' }],
  },
  {
    key: 'macd',
    label: 'MACD',
    tvStudy: 'MACD@tv-basicstudies',
    tvOverrideName: 'macd',
    params: [
      { key: 'fast', label: 'Fast', default: 12, tvOverrideKey: 'fast length' },
      { key: 'slow', label: 'Slow', default: 26, tvOverrideKey: 'slow length' },
      { key: 'signal', label: 'Signal', default: 9, tvOverrideKey: 'signal smoothing' },
    ],
  },
  {
    key: 'atr',
    label: 'ATR',
    tvStudy: 'ATR@tv-basicstudies',
    tvOverrideName: 'average true range',
    params: [{ key: 'period', label: 'Period', default: 14, tvOverrideKey: 'length' }],
  },
  {
    key: 'stoch',
    label: 'Stochastic',
    tvStudy: 'Stochastic@tv-basicstudies',
    tvOverrideName: 'stochastic',
    params: [
      { key: 'kPeriod', label: '%K', default: 14, tvOverrideKey: 'k length' },
      { key: 'dPeriod', label: '%D', default: 3, tvOverrideKey: 'd length' },
    ],
  },
  {
    key: 'sar',
    label: 'Parabolic SAR',
    tvStudy: 'PSAR@tv-basicstudies',
    tvOverrideName: 'parabolic sar',
    params: [
      { key: 'step', label: 'Step', default: 0.02, tvOverrideKey: 'increment' },
      { key: 'maxStep', label: 'Max', default: 0.2, tvOverrideKey: 'maximum' },
    ],
  },
  {
    key: 'adx',
    label: 'ADX',
    tvStudy: 'DM@tv-basicstudies', // "Directional Movement" study — plots ADX (+ +DI/-DI)
    tvOverrideName: 'directional movement',
    params: [{ key: 'period', label: 'Period', default: 14, tvOverrideKey: 'length' }],
  },
]

export const DEFAULT_ENABLED = new Set(['ema', 'cci'])

export const DEFAULT_INDICATOR_STATE = Object.fromEntries(
  INDICATOR_DEFS.map((def) => [
    def.key,
    {
      enabled: DEFAULT_ENABLED.has(def.key),
      ...Object.fromEntries(def.params.map((p) => [p.key, p.default])),
    },
  ]),
)

export function computeEnabledIndicators(candles, settings) {
  const data = {}
  if (settings.ema.enabled) {
    data.ema = { period: settings.ema.period, points: computeEMA(candles, settings.ema.period) }
  }
  if (settings.sma.enabled) {
    data.sma = { period: settings.sma.period, points: computeSMA(candles, settings.sma.period) }
  }
  if (settings.bb.enabled) {
    data.bb = {
      period: settings.bb.period,
      stdDev: settings.bb.stdDev,
      ...computeBollingerBands(candles, settings.bb.period, settings.bb.stdDev),
    }
  }
  if (settings.cci.enabled) {
    data.cci = { period: settings.cci.period, points: computeCCI(candles, settings.cci.period) }
  }
  if (settings.rsi.enabled) {
    data.rsi = { period: settings.rsi.period, points: computeRSI(candles, settings.rsi.period) }
  }
  if (settings.macd.enabled) {
    data.macd = {
      fast: settings.macd.fast,
      slow: settings.macd.slow,
      signal: settings.macd.signal,
      ...computeMACD(candles, settings.macd.fast, settings.macd.slow, settings.macd.signal),
    }
  }
  if (settings.atr.enabled) {
    data.atr = { period: settings.atr.period, points: computeATR(candles, settings.atr.period) }
  }
  if (settings.stoch.enabled) {
    data.stoch = {
      kPeriod: settings.stoch.kPeriod,
      dPeriod: settings.stoch.dPeriod,
      ...computeStochastic(candles, settings.stoch.kPeriod, settings.stoch.dPeriod),
    }
  }
  if (settings.sar.enabled) {
    data.sar = {
      step: settings.sar.step,
      maxStep: settings.sar.maxStep,
      points: computeParabolicSAR(candles, settings.sar.step, settings.sar.maxStep),
    }
  }
  if (settings.adx.enabled) {
    data.adx = { period: settings.adx.period, points: computeADX(candles, settings.adx.period) }
  }
  return data
}

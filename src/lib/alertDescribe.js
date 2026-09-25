// Shared between Alerts.jsx (the alert list + condition builder) and AlertChart.jsx
// (showing an alert's own settings on its chart page), so the condition vocabulary and
// how it's described in plain English stay in exactly one place.
export const INDICATORS = [
  { value: 'cci', label: 'CCI', hasLevel: true, defaultPeriod: 14, defaultLevel: 100 },
  { value: 'rsi', label: 'RSI', hasLevel: true, defaultPeriod: 14, defaultLevel: 70 },
  { value: 'stoch', label: 'Stochastic %K', hasLevel: true, defaultPeriod: 14, defaultLevel: 80 },
  { value: 'macd', label: 'MACD histogram crosses 0', hasLevel: false, defaultPeriod: null, defaultLevel: null },
  { value: 'ema', label: 'Price crosses EMA', hasLevel: false, defaultPeriod: 20, defaultLevel: null },
]

// Each condition can run against a different interval than the alert's own (e.g. a daily
// trend condition alongside an hourly trigger condition in the same alert) — shown only
// when it actually differs, so a plain single-interval alert's description stays terse.
export function describeCondition(condition, alertInterval) {
  const base =
    condition.type === 'haColor'
      ? `Heikin Ashi ${condition.haColor}`
      : condition.type === 'price'
        ? `Price crosses ${condition.priceDirection} ${condition.priceLevel}`
        : (() => {
            const def = INDICATORS.find((i) => i.value === condition.indicatorKey)
            const label = def?.label ?? condition.indicatorKey
            return !def?.hasLevel
              ? `${label}, ${condition.indicatorDirection}`
              : `${label}(${condition.indicatorPeriod}) crosses ${condition.indicatorDirection} ${condition.indicatorLevel}`
          })()
  const interval = condition.interval ?? alertInterval
  return interval !== alertInterval ? `${interval} ${base}` : base
}

export function describeAlert(alert) {
  if (!Array.isArray(alert.conditions)) return '(unrecognized alert format)'
  const joiner = alert.matchMode === 'any' ? ' OR ' : ' AND '
  return alert.conditions.map((c) => describeCondition(c, alert.interval)).join(joiner)
}

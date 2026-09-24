import { useEffect, useState } from 'react'
import { SymbolSearchInput } from '../components/SymbolSearchInput'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks/useApi'

const DATA_SOURCES = [
  { value: 'twelvedata', label: 'Twelve Data' },
  { value: 'yahoo', label: 'Yahoo' },
]
const INTERVALS = [
  { value: '1h', label: '1 hour' },
  { value: '4h', label: '4 hour' },
  { value: '1day', label: 'Daily' },
  { value: '1week', label: 'Weekly' },
]
const INDICATORS = [
  { value: 'cci', label: 'CCI', hasLevel: true, defaultPeriod: 14, defaultLevel: 100 },
  { value: 'rsi', label: 'RSI', hasLevel: true, defaultPeriod: 14, defaultLevel: 70 },
  { value: 'stoch', label: 'Stochastic %K', hasLevel: true, defaultPeriod: 14, defaultLevel: 80 },
  { value: 'macd', label: 'MACD histogram crosses 0', hasLevel: false, defaultPeriod: null, defaultLevel: null },
  { value: 'ema', label: 'Price crosses EMA', hasLevel: false, defaultPeriod: 20, defaultLevel: null },
]

// One-click starting points for the multi-timeframe rule validated against real data
// (see CLAUDE.md's "Alerts" section) — daily CCI(9) sign as trend permission, hourly
// Heikin Ashi color flip as the entry timing trigger, hourly CCI(20) confirming the
// bounce is real rather than a fake single-candle wobble. Just prefills interval +
// conditions into the normal, still-fully-editable condition rows below — not a locked
// mode, so manual tweaks (or building an alert from scratch) work exactly as before.
const PRESETS = [
  {
    key: 'uptrend-pullback',
    label: 'Uptrend pullback entry',
    title: 'Daily CCI(9) above 0, 1h Heikin Ashi green, 1h CCI(20) above 0',
    interval: '1h',
    conditions: [
      { type: 'indicator', indicatorKey: 'cci', indicatorPeriod: 9, indicatorDirection: 'above', indicatorLevel: 0, interval: '1day' },
      { type: 'haColor', haColor: 'green', interval: '1h' },
      { type: 'indicator', indicatorKey: 'cci', indicatorPeriod: 20, indicatorDirection: 'above', indicatorLevel: 0, interval: '1h' },
    ],
  },
  {
    key: 'downtrend-pullback',
    label: 'Downtrend pullback entry',
    title: 'Daily CCI(9) below 0, 1h Heikin Ashi red, 1h CCI(20) below 0',
    interval: '1h',
    conditions: [
      { type: 'indicator', indicatorKey: 'cci', indicatorPeriod: 9, indicatorDirection: 'below', indicatorLevel: 0, interval: '1day' },
      { type: 'haColor', haColor: 'red', interval: '1h' },
      { type: 'indicator', indicatorKey: 'cci', indicatorPeriod: 20, indicatorDirection: 'below', indicatorLevel: 0, interval: '1h' },
    ],
  },
]

function emptyPriceCondition(interval) {
  return { type: 'price', priceLevel: '', priceDirection: 'above', interval }
}

function emptyIndicatorCondition(interval) {
  const def = INDICATORS[0]
  return {
    type: 'indicator',
    indicatorKey: def.value,
    indicatorPeriod: def.defaultPeriod,
    indicatorLevel: def.defaultLevel,
    indicatorDirection: 'above',
    interval,
  }
}

function emptyHaColorCondition(interval) {
  return { type: 'haColor', haColor: 'green', interval }
}

const EMPTY_FORM = {
  symbol: '',
  dataSource: 'twelvedata',
  interval: '1day',
  matchMode: 'all',
  conditions: [emptyPriceCondition('1day')],
}

// Each condition can run against a different interval than the alert's own (e.g. a daily
// trend condition alongside an hourly trigger condition in the same alert) — shown only
// when it actually differs, so a plain single-interval alert's description stays terse.
function describeCondition(condition, alertInterval) {
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

function describeAlert(alert) {
  if (!Array.isArray(alert.conditions)) return '(unrecognized alert format)'
  const joiner = alert.matchMode === 'any' ? ' OR ' : ' AND '
  return alert.conditions.map((c) => describeCondition(c, alert.interval)).join(joiner)
}

function ConditionRow({ condition, onChange, onRemove, canRemove }) {
  const selectedIndicator = INDICATORS.find((i) => i.value === condition.indicatorKey)

  const handleIndicatorChange = (value) => {
    const def = INDICATORS.find((i) => i.value === value)
    onChange({
      ...condition,
      indicatorKey: value,
      indicatorPeriod: def?.defaultPeriod ?? condition.indicatorPeriod,
      indicatorLevel: def?.defaultLevel ?? condition.indicatorLevel,
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-bg p-3">
      {condition.type === 'haColor' ? (
        <>
          <span className="text-sm text-text-muted">Heikin Ashi candle is</span>
          <select
            value={condition.haColor}
            onChange={(e) => onChange({ ...condition, haColor: e.target.value })}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
          >
            <option value="green">green</option>
            <option value="red">red</option>
          </select>
        </>
      ) : condition.type === 'price' ? (
        <>
          <span className="text-sm text-text-muted">Price crosses</span>
          <select
            value={condition.priceDirection}
            onChange={(e) => onChange({ ...condition, priceDirection: e.target.value })}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
          >
            <option value="above">above</option>
            <option value="below">below</option>
          </select>
          <input
            type="number"
            step="any"
            placeholder="Level"
            value={condition.priceLevel}
            onChange={(e) => onChange({ ...condition, priceLevel: e.target.value })}
            className="w-32 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </>
      ) : (
        <>
          <select
            value={condition.indicatorKey}
            onChange={(e) => handleIndicatorChange(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
          >
            {INDICATORS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>

          {condition.indicatorKey !== 'macd' && (
            <label className="flex items-center gap-1.5 text-sm text-text-muted">
              Period
              <input
                type="number"
                value={condition.indicatorPeriod}
                onChange={(e) => onChange({ ...condition, indicatorPeriod: e.target.value })}
                className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-sm text-text outline-none focus:border-accent"
              />
            </label>
          )}

          <select
            value={condition.indicatorDirection}
            onChange={(e) => onChange({ ...condition, indicatorDirection: e.target.value })}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
          >
            <option value="above">crosses above</option>
            <option value="below">crosses below</option>
          </select>

          {selectedIndicator?.hasLevel && (
            <input
              type="number"
              step="any"
              placeholder="Level"
              value={condition.indicatorLevel}
              onChange={(e) => onChange({ ...condition, indicatorLevel: e.target.value })}
              className="w-24 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          )}
        </>
      )}

      <label className="flex items-center gap-1.5 text-sm text-text-muted">
        on
        <select
          value={condition.interval}
          onChange={(e) => onChange({ ...condition, interval: e.target.value })}
          className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-text outline-none focus:border-accent"
        >
          {INTERVALS.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
      </label>

      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto rounded border border-border px-2 py-1 text-xs text-loss hover:bg-surface"
        >
          Remove
        </button>
      )}
    </div>
  )
}

export default function Alerts() {
  const { user } = useAuth()
  const api = useApi()

  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ ...EMPTY_FORM, email: user?.email ?? '' })
  const [submitting, setSubmitting] = useState(false)
  const [runStatus, setRunStatus] = useState('')
  const [running, setRunning] = useState(false)

  const loadAlerts = () => {
    setLoading(true)
    api
      .getAlerts()
      .then(setAlerts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadAlerts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  const updateCondition = (index, next) =>
    setForm((prev) => ({
      ...prev,
      conditions: prev.conditions.map((c, i) => (i === index ? next : c)),
    }))

  const addCondition = (type) =>
    setForm((prev) => ({
      ...prev,
      conditions: [
        ...prev.conditions,
        type === 'price'
          ? emptyPriceCondition(prev.interval)
          : type === 'haColor'
            ? emptyHaColorCondition(prev.interval)
            : emptyIndicatorCondition(prev.interval),
      ],
    }))

  const removeCondition = (index) =>
    setForm((prev) => ({ ...prev, conditions: prev.conditions.filter((_, i) => i !== index) }))

  const applyPreset = (preset) =>
    setForm((prev) => ({ ...prev, interval: preset.interval, conditions: preset.conditions }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.symbol.trim()) return
    setError('')
    setSubmitting(true)
    try {
      const payload = {
        symbol: form.symbol.trim(),
        dataSource: form.dataSource,
        interval: form.interval,
        matchMode: form.matchMode,
        conditions: form.conditions.map((c) =>
          c.type === 'haColor'
            ? { type: 'haColor', haColor: c.haColor, interval: c.interval }
            : c.type === 'price'
              ? { type: 'price', priceLevel: Number(c.priceLevel), priceDirection: c.priceDirection, interval: c.interval }
              : {
                  type: 'indicator',
                  indicatorKey: c.indicatorKey,
                  indicatorPeriod: Number(c.indicatorPeriod) || undefined,
                  indicatorLevel: Number(c.indicatorLevel) || undefined,
                  indicatorDirection: c.indicatorDirection,
                  interval: c.interval,
                },
        ),
        email: form.email,
        active: true,
        createdAt: new Date().toISOString(),
        lastTriggeredAt: null,
        lastTriggeredCandleTime: null,
      }
      await api.saveAlert(payload)
      setForm({ ...EMPTY_FORM, email: user?.email ?? '' })
      loadAlerts()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (alert) => {
    try {
      await api.saveAlert({ ...alert, active: !alert.active })
      loadAlerts()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this alert?')) return
    try {
      await api.deleteAlert(id)
      loadAlerts()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRunNow = async () => {
    setRunning(true)
    setRunStatus('')
    try {
      const summary = await api.runAlertsCheck()
      setRunStatus(
        `Checked ${summary.checked} alert(s) across ${summary.groups} symbol(s) — ${summary.triggered} triggered, ${summary.failed} failed.`,
      )
      loadAlerts()
    } catch (err) {
      setRunStatus(err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Alerts</h1>
        <button
          type="button"
          onClick={handleRunNow}
          disabled={running}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-text-muted hover:text-text disabled:opacity-50"
        >
          {running ? 'Checking…' : 'Check now'}
        </button>
      </div>

      {runStatus && <p className="mb-4 text-sm text-text-muted">{runStatus}</p>}

      <div className="mb-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-text-muted">New alert</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <SymbolSearchInput
              dataSource={form.dataSource}
              value={form.symbol}
              onChange={(symbol) => updateField('symbol', symbol)}
              placeholder="Search symbol, e.g. XAU/USD"
            />
            <select
              value={form.dataSource}
              onChange={(e) => setForm((prev) => ({ ...prev, dataSource: e.target.value, symbol: '' }))}
              className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            >
              {DATA_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={form.interval}
              onChange={(e) => updateField('interval', e.target.value)}
              className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            >
              {INTERVALS.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted">Presets:</span>
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset)}
                title={preset.title}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {form.conditions.map((condition, index) => (
              <ConditionRow
                key={index}
                condition={condition}
                onChange={(next) => updateCondition(index, next)}
                onRemove={() => removeCondition(index)}
                canRemove={form.conditions.length > 1}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => addCondition('price')}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text"
            >
              + Price condition
            </button>
            <button
              type="button"
              onClick={() => addCondition('indicator')}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text"
            >
              + Indicator condition
            </button>
            <button
              type="button"
              onClick={() => addCondition('haColor')}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text"
            >
              + Heikin Ashi condition
            </button>

            {form.conditions.length > 1 && (
              <label className="ml-auto flex items-center gap-2 text-sm text-text-muted">
                Require
                <select
                  value={form.matchMode}
                  onChange={(e) => updateField('matchMode', e.target.value)}
                  className="rounded-md border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-accent"
                >
                  <option value="all">All conditions (AND)</option>
                  <option value="any">Any condition (OR)</option>
                </select>
              </label>
            )}
          </div>

          <input
            type="email"
            placeholder="Notify email"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            className="w-full max-w-sm rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />

          {error && <p className="text-sm text-loss">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !form.symbol.trim() || !form.email}
            className="w-fit rounded-md bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Create alert'}
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-text-muted">Your alerts</h2>

        {loading && <p className="text-sm text-text-muted">Loading…</p>}
        {!loading && alerts.length === 0 && (
          <p className="text-sm text-text-muted">No alerts yet — create one above.</p>
        )}

        <div className="flex flex-col divide-y divide-border">
          {alerts.map((alert) => (
            <div key={alert.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="text-sm text-text">
                  {alert.symbol}{' '}
                  <span className="text-text-muted">
                    ({DATA_SOURCES.find((s) => s.value === alert.dataSource)?.label},{' '}
                    {INTERVALS.find((i) => i.value === alert.interval)?.label})
                  </span>
                </p>
                <p className="text-xs text-text-muted">{describeAlert(alert)}</p>
                {alert.lastTriggeredAt && (
                  <p className="text-xs text-text-muted">
                    Last triggered {new Date(alert.lastTriggeredAt).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleActive(alert)}
                  className={`rounded border border-border px-2 py-1 text-xs ${
                    alert.active ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
                  }`}
                >
                  {alert.active ? 'Active' : 'Paused'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(alert.id)}
                  className="rounded border border-border px-2 py-1 text-xs text-loss hover:bg-bg"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

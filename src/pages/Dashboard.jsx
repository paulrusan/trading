import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { StatTile } from '../components/StatTile'
import { getChartColors, usePrefersDark } from '../lib/chartColors'
import {
  computeEquityCurve,
  computeMonthlyPerformance,
  computePnlByInstrument,
  computeStats,
  computeWinLoss,
} from '../lib/dashboardStats'
import { formatCurrency, formatPercent } from '../lib/format'
import { useApi } from '../hooks/useApi'

function ChartCard({ title, children }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-4 text-sm font-medium text-text-muted">{title}</h2>
      {children}
    </div>
  )
}

function ChartTooltip({ active, payload, label, colors, formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-md border px-3 py-2 text-sm"
      style={{ background: colors.surface, borderColor: colors.grid, color: colors.text }}
    >
      {label && <div className="mb-1 text-text-muted">{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey ?? p.name}>{formatter ? formatter(p) : `${p.name}: ${p.value}`}</div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const api = useApi()
  const isDark = usePrefersDark()
  const colors = getChartColors(isDark)

  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .getTrades()
      .then((data) => {
        if (!cancelled) setTrades(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = useMemo(() => computeStats(trades), [trades])
  const equityCurve = useMemo(() => computeEquityCurve(trades), [trades])
  const pnlByInstrument = useMemo(() => computePnlByInstrument(trades), [trades])
  const monthly = useMemo(() => computeMonthlyPerformance(trades), [trades])
  const winLoss = useMemo(() => computeWinLoss(trades), [trades])

  if (loading) {
    return <div className="p-6 text-text-muted">Loading…</div>
  }

  if (error) {
    return <div className="p-6 text-loss">{error}</div>
  }

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-6 text-xl font-semibold text-text">Dashboard</h1>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Total P&L"
          value={formatCurrency(stats.totalPnl)}
          tone={stats.totalPnl > 0 ? 'profit' : stats.totalPnl < 0 ? 'loss' : undefined}
        />
        <StatTile
          label="Win rate"
          value={stats.winRate === null ? '—' : formatPercent(stats.winRate)}
        />
        <StatTile label="Open positions" value={stats.openPositions} />
        <StatTile
          label="Best trade"
          value={stats.bestTradePnl === null ? '—' : formatCurrency(stats.bestTradePnl)}
          tone={stats.bestTradePnl > 0 ? 'profit' : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Equity curve">
          {equityCurve.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">No realized trades yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={equityCurve}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="0" vertical={false} />
                <XAxis dataKey="date" stroke={colors.textMuted} fontSize={12} />
                <YAxis stroke={colors.textMuted} fontSize={12} />
                <Tooltip
                  content={
                    <ChartTooltip
                      colors={colors}
                      formatter={(p) => `Cumulative: ${formatCurrency(p.value)}`}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke={colors.accent}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="P&L by instrument">
          {pnlByInstrument.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">No realized trades yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={pnlByInstrument}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="0" vertical={false} />
                <XAxis dataKey="instrument" stroke={colors.textMuted} fontSize={12} />
                <YAxis stroke={colors.textMuted} fontSize={12} />
                <Tooltip
                  content={
                    <ChartTooltip colors={colors} formatter={(p) => formatCurrency(p.value)} />
                  }
                />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {pnlByInstrument.map((entry) => (
                    <Cell
                      key={entry.instrument}
                      fill={entry.pnl >= 0 ? colors.profit : colors.loss}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Monthly performance">
          {monthly.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">No realized trades yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="0" vertical={false} />
                <XAxis dataKey="month" stroke={colors.textMuted} fontSize={12} />
                <YAxis stroke={colors.textMuted} fontSize={12} />
                <Tooltip
                  content={
                    <ChartTooltip colors={colors} formatter={(p) => formatCurrency(p.value)} />
                  }
                />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {monthly.map((entry) => (
                    <Cell key={entry.month} fill={entry.pnl >= 0 ? colors.profit : colors.loss} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Win / loss">
          {winLoss[0].value + winLoss[1].value === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">No closed trades yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Tooltip content={<ChartTooltip colors={colors} />} />
                <Legend
                  wrapperStyle={{ color: colors.textMuted, fontSize: 12 }}
                  iconType="circle"
                />
                <Pie
                  data={winLoss}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  <Cell fill={colors.profit} />
                  <Cell fill={colors.loss} />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

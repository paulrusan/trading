import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TwelveDataChart } from '../components/TwelveDataChart'
import { useApi } from '../hooks/useApi'

const OUTPUT_SIZE_BY_INTERVAL = { '1h': 2000, '4h': 2000, '1day': 5000, '1week': 5000 }
const MARKER_COLOR = '#f59e0b' // amber — distinct from the green/red buy/sell markers elsewhere

export default function AlertChart() {
  const api = useApi()
  const [searchParams] = useSearchParams()
  const alertId = searchParams.get('alertId')
  const symbol = searchParams.get('symbol')
  const dataSource = searchParams.get('dataSource') ?? 'twelvedata'
  const interval = searchParams.get('interval') ?? '1day'

  const [candles, setCandles] = useState([])
  const [alert, setAlert] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    setError('')
    Promise.all([
      api.getMarketData(symbol, interval, OUTPUT_SIZE_BY_INTERVAL[interval] ?? 2000, dataSource),
      api.getAlerts(),
    ])
      .then(([marketData, alerts]) => {
        setCandles(marketData.candles)
        setAlert(alerts.find((a) => a.id === alertId) ?? null)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, dataSource, interval, alertId])

  // Oldest -> newest for the chart markers (TwelveDataChart doesn't care about order,
  // but consistent with how the rest of the app lists history), newest-first for the table.
  const triggerHistory = alert?.triggerHistory ?? []
  const triggerHistoryNewestFirst = useMemo(() => [...triggerHistory].reverse(), [triggerHistory])

  const markers = useMemo(
    () => triggerHistory.map((t) => ({ time: t.candleTime, color: MARKER_COLOR, shape: 'circle', text: 'Alert' })),
    [triggerHistory],
  )

  if (!symbol) {
    return <div className="p-6 text-sm text-loss">Missing symbol query parameter.</div>
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-text">{symbol}</h1>
        <p className="text-xs text-text-muted">
          {dataSource === 'yahoo' ? 'Yahoo' : 'Twelve Data'} · {interval} · alert trigger history
        </p>
      </div>

      {error && <p className="mb-3 text-sm text-loss">{error}</p>}
      {loading && <p className="mb-3 text-sm text-text-muted">Loading…</p>}

      {candles.length > 0 && (
        <div className="mb-6">
          <TwelveDataChart candles={candles} indicators={{}} interval={interval} height={480} markers={markers} />
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-text-muted">
          Last {triggerHistoryNewestFirst.length} trigger{triggerHistoryNewestFirst.length === 1 ? '' : 's'}
        </h2>
        {!alert ? (
          <p className="text-sm text-text-muted">Alert not found — it may have been deleted.</p>
        ) : triggerHistoryNewestFirst.length === 0 ? (
          <p className="text-sm text-text-muted">This alert hasn't triggered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-text-muted">
                  <th className="pb-2 pr-4 font-normal">Candle time</th>
                  <th className="pb-2 font-normal">Alerted at</th>
                </tr>
              </thead>
              <tbody>
                {triggerHistoryNewestFirst.map((t, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-2 pr-4 text-text">{new Date(t.candleTime * 1000).toLocaleString()}</td>
                    <td className="py-2 text-text-muted">{new Date(t.triggeredAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

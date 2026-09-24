import { app } from '@azure/functions'
import { getContainer } from '../cosmosClient.js'
import { evaluateAlert } from '../evaluateAlert.js'
import { fetchCandles } from '../marketDataFetchers.js'
import { sendAlertEmail } from '../sendEmail.js'
import { verifyAuth } from '../verifyAuth.js'

const OUTPUT_SIZE_BY_INTERVAL = { '1h': 200, '4h': 200, '1day': 200, '1week': 200 }

// Shared by the hourly timer and the manual "run now" endpoint below, so both exercise
// the exact same logic — the manual endpoint exists purely because a timer trigger is
// otherwise painful to test locally without waiting for the clock.
//
// An alert's conditions can each specify their own interval (e.g. a daily trend
// condition alongside an hourly trigger condition in the same alert), so alerts are
// grouped by symbol/dataSource only — not by a single interval — and every distinct
// interval any of that symbol's conditions need is fetched once and shared.
export async function runAlertsCheck(log = () => {}) {
  const container = getContainer('alerts')
  const { resources: alerts } = await container.items
    .query({ query: 'SELECT * FROM c WHERE c.active = true' })
    .fetchAll()

  const groups = new Map()
  for (const alert of alerts) {
    const key = `${alert.symbol}|${alert.dataSource}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(alert)
  }

  let checked = 0
  let triggered = 0
  let failed = 0

  for (const [key, groupAlerts] of groups) {
    const [symbol, dataSource] = key.split('|')
    const intervals = new Set()
    for (const alert of groupAlerts) {
      intervals.add(alert.interval)
      for (const c of alert.conditions) intervals.add(c.interval ?? alert.interval)
    }

    const candlesByInterval = new Map()
    let fetchFailed = false
    for (const interval of intervals) {
      try {
        candlesByInterval.set(
          interval,
          await fetchCandles(symbol, interval, OUTPUT_SIZE_BY_INTERVAL[interval] ?? 200, dataSource),
        )
      } catch (err) {
        log(`Failed to fetch ${key}|${interval}: ${err.message}`)
        fetchFailed = true
      }
    }
    if (fetchFailed) {
      failed += groupAlerts.length
      continue
    }

    for (const alert of groupAlerts) {
      checked++
      let result
      try {
        result = evaluateAlert(alert, candlesByInterval)
      } catch (err) {
        log(`Failed to evaluate alert ${alert.id}: ${err.message}`)
        failed++
        continue
      }
      if (!result || !result.triggered) continue
      if (result.candleTime === alert.lastTriggeredCandleTime) continue // already alerted for this bar

      const triggeredAt = new Date().toISOString()
      try {
        await sendAlertEmail({
          to: alert.email,
          subject: `Trading Journal alert: ${alert.symbol}`,
          text: result.message,
        })
        await container.items.upsert({
          ...alert,
          lastTriggeredAt: triggeredAt,
          lastTriggeredCandleTime: result.candleTime,
          // Last 10 firings, for the "show me on the chart when this fired" view — not
          // meant as a full audit log, just enough for a quick visual sanity check.
          triggerHistory: [...(alert.triggerHistory ?? []), { candleTime: result.candleTime, triggeredAt }].slice(-10),
        })
        triggered++
      } catch (err) {
        log(`Failed to send/record alert ${alert.id}: ${err.message}`)
        failed++
      }
    }
  }

  return { alertsActive: alerts.length, groups: groups.size, checked, triggered, failed }
}

app.timer('alertsEngine', {
  schedule: '0 0 * * * *', // top of every hour
  handler: async (_myTimer, context) => {
    const summary = await runAlertsCheck((msg) => context.log(msg))
    context.log('Alerts check complete:', JSON.stringify(summary))
  },
})

app.http('alertsRun', {
  methods: ['POST'],
  route: 'alerts/run',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const uid = await verifyAuth(request)
    if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }

    const summary = await runAlertsCheck((msg) => context.log(msg))
    return { jsonBody: summary }
  },
})

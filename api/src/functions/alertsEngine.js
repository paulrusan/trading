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
export async function runAlertsCheck(log = () => {}) {
  const container = getContainer('alerts')
  const { resources: alerts } = await container.items
    .query({ query: 'SELECT * FROM c WHERE c.active = true' })
    .fetchAll()

  const groups = new Map()
  for (const alert of alerts) {
    const key = `${alert.symbol}|${alert.dataSource}|${alert.interval}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(alert)
  }

  let checked = 0
  let triggered = 0
  let failed = 0

  for (const [key, groupAlerts] of groups) {
    const [symbol, dataSource, interval] = key.split('|')
    let candles
    try {
      candles = await fetchCandles(symbol, interval, OUTPUT_SIZE_BY_INTERVAL[interval] ?? 200, dataSource)
    } catch (err) {
      log(`Failed to fetch ${key}: ${err.message}`)
      failed += groupAlerts.length
      continue
    }

    for (const alert of groupAlerts) {
      checked++
      let result
      try {
        result = evaluateAlert(alert, candles)
      } catch (err) {
        log(`Failed to evaluate alert ${alert.id}: ${err.message}`)
        failed++
        continue
      }
      if (!result || !result.triggered) continue
      if (result.candleTime === alert.lastTriggeredCandleTime) continue // already alerted for this bar

      try {
        await sendAlertEmail({
          to: alert.email,
          subject: `Trading Journal alert: ${alert.symbol}`,
          text: result.message,
        })
        await container.items.upsert({
          ...alert,
          lastTriggeredAt: new Date().toISOString(),
          lastTriggeredCandleTime: result.candleTime,
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

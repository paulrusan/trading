import { app } from '@azure/functions'
import sharp from 'sharp'
import { getContainer } from '../cosmosClient.js'
import { buildAlertChartSvg, buildAlertEmailText } from '../emailChart.js'
import { evaluateAlert } from '../evaluateAlert.js'
import { fetchCandles } from '../marketDataFetchers.js'
import { sendAlertEmail } from '../sendEmail.js'
import { verifyAuth } from '../verifyAuth.js'

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Builds the HTML body (readable per-condition text + the two-panel trend graphic, when
// this alert's conditions are the shape emailChart.js knows how to draw) and the inline
// cid attachment for it. Falls back to text-only (no graphic) for condition combos outside
// that shape, rather than guessing at a layout.
async function buildEmailContent(alert, result) {
  const text = buildAlertEmailText(alert, result)
  const svg = buildAlertChartSvg(alert, result)

  if (!svg) {
    return { text, html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">${escapeHtml(text)}</pre>`, attachments: [] }
  }

  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  const html = `
    <div style="font-family:Arial,sans-serif;color:#1e293b;font-size:14px;line-height:1.5;">
      <img src="cid:trendChart" width="600" height="270" alt="Trend chart" style="max-width:100%;height:auto;display:block;margin-bottom:16px;"/>
      <pre style="font-family:Arial,sans-serif;white-space:pre-wrap;margin:0;">${escapeHtml(text)}</pre>
    </div>
  `
  return { text, html, attachments: [{ filename: 'trend-chart.png', content: png, cid: 'trendChart' }] }
}

const OUTPUT_SIZE_BY_INTERVAL = { '1h': 200, '4h': 200, '1day': 200, '1week': 200 }

// Shared by the hourly timer and the manual "run now" endpoint below, so both exercise
// the exact same logic — the manual endpoint exists purely because a timer trigger is
// otherwise painful to test locally without waiting for the clock.
//
// An alert's conditions can each specify their own interval (e.g. a daily trend
// condition alongside an hourly trigger condition in the same alert), so alerts are
// grouped by symbol/dataSource only — not by a single interval — and every distinct
// interval any of that symbol's conditions need is fetched once and shared.
// A fixed, non-user doc in the 'settings' container recording when the hourly check last
// actually ran and what it found — the only way to tell (from inside the app, without
// digging through the Azure Portal, which for this Function App's plan has no searchable
// invocation history without Application Insights) whether a given hour's tick fired.
const STATUS_DOC_ID = 'alertsEngineStatus'

export async function runAlertsCheck(log = () => {}) {
  try {
    const result = await runAlertsCheckInner(log)
    await getContainer('settings').items.upsert({
      id: STATUS_DOC_ID,
      userId: STATUS_DOC_ID,
      lastRunAt: new Date().toISOString(),
      summary: result,
      error: null,
    })
    return result
  } catch (err) {
    await getContainer('settings').items.upsert({
      id: STATUS_DOC_ID,
      userId: STATUS_DOC_ID,
      lastRunAt: new Date().toISOString(),
      summary: null,
      error: err.message,
    })
    throw err
  }
}

async function runAlertsCheckInner(log) {
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
  // Per-alert failure detail, surfaced through the heartbeat doc below so a "2 failed" on
  // the Alerts page is actually diagnosable from the app itself instead of just a count —
  // this is exactly the gap that left the 2026-09-25 missed-alert investigation with no
  // way to know *why* those runs failed after the fact.
  const failures = []

  for (const [key, groupAlerts] of groups) {
    const [symbol, dataSource] = key.split('|')
    const intervals = new Set()
    for (const alert of groupAlerts) {
      intervals.add(alert.interval)
      for (const c of alert.conditions) intervals.add(c.interval ?? alert.interval)
    }

    const candlesByInterval = new Map()
    const fetchErrors = []
    for (const interval of intervals) {
      try {
        candlesByInterval.set(
          interval,
          await fetchCandles(symbol, interval, OUTPUT_SIZE_BY_INTERVAL[interval] ?? 200, dataSource),
        )
      } catch (err) {
        log(`Failed to fetch ${key}|${interval}: ${err.message}`)
        fetchErrors.push(`${interval}: ${err.message}`)
      }
    }
    if (fetchErrors.length > 0) {
      failed += groupAlerts.length
      for (const alert of groupAlerts) {
        failures.push({ alertId: alert.id, symbol, dataSource, stage: 'fetch', message: fetchErrors.join('; ') })
      }
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
        failures.push({ alertId: alert.id, symbol, dataSource, stage: 'evaluate', message: err.message })
        continue
      }
      if (!result || !result.triggered) continue
      if (result.candleTime === alert.lastTriggeredCandleTime) continue // already alerted for this bar

      const triggeredAt = new Date().toISOString()
      try {
        const { text, html, attachments } = await buildEmailContent(alert, result)
        await sendAlertEmail({
          to: alert.email,
          subject: `Trading Journal alert: ${alert.symbol}`,
          text,
          html,
          attachments,
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
        failures.push({ alertId: alert.id, symbol, dataSource, stage: 'send', message: err.message })
      }
    }
  }

  return { alertsActive: alerts.length, groups: groups.size, checked, triggered, failed, failures }
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

app.http('alertsStatus', {
  methods: ['GET'],
  route: 'alerts/status',
  authLevel: 'anonymous',
  handler: async (request) => {
    const uid = await verifyAuth(request)
    if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }

    try {
      const { resource } = await getContainer('settings').item(STATUS_DOC_ID, STATUS_DOC_ID).read()
      return { jsonBody: resource ? { lastRunAt: resource.lastRunAt, summary: resource.summary, error: resource.error } : null }
    } catch (err) {
      if (err.code === 404) return { jsonBody: null } // hourly check hasn't run since this was added
      throw err
    }
  },
})

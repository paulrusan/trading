import { app } from '@azure/functions'
import { backfillTrendHistory, computeSnapshotUpdate } from '../computeSnapshot.js'
import { getContainer } from '../cosmosClient.js'
import { fetchCandles } from '../marketDataFetchers.js'
import { verifyAuth } from '../verifyAuth.js'

const OUTPUT_SIZE_BY_INTERVAL = { '1h': 300, '4h': 300, '1day': 300, '1week': 300 }
const BACKFILL_OUTPUT_SIZE = { '1h': 2000, '4h': 2000, '1day': 5000, '1week': 5000 }

// Cosmos doc ids can't contain '/', which real symbols do (e.g. "XAU/USD").
function idPrefix(symbol, dataSource, interval) {
  return `${symbol}_${dataSource}_${interval}`.replace(/[/\\?#]/g, '-')
}

async function getLatestSnapshot(symbol, dataSource, interval) {
  const { resources } = await getContainer('snapshots')
    .items.query({
      query:
        'SELECT TOP 1 * FROM c WHERE c.symbol = @symbol AND c.dataSource = @dataSource AND c.interval = @interval ORDER BY c.timestamp DESC',
      parameters: [
        { name: '@symbol', value: symbol },
        { name: '@dataSource', value: dataSource },
        { name: '@interval', value: interval },
      ],
    })
    .fetchAll()
  return resources[0] ?? null
}

// Shared by the hourly timer and the manual "run now" endpoint, mirroring
// alertsEngine.js's pattern — a timer trigger can't be exercised locally, so the exact
// same logic is also reachable on demand.
export async function runSnapshotsCheck(log = () => {}) {
  const { resources: watched } = await getContainer('watchlist').items
    .query({ query: 'SELECT * FROM c' })
    .fetchAll()

  const groups = new Map()
  for (const w of watched) {
    const key = `${w.symbol}|${w.dataSource}|${w.interval}`
    if (!groups.has(key)) groups.set(key, { symbol: w.symbol, dataSource: w.dataSource, interval: w.interval })
  }

  let updated = 0
  let trendsClosed = 0
  let failed = 0
  const failures = []

  for (const [key, { symbol, dataSource, interval }] of groups) {
    try {
      const candles = await fetchCandles(symbol, interval, OUTPUT_SIZE_BY_INTERVAL[interval] ?? 300, dataSource)
      const prevSnapshot = await getLatestSnapshot(symbol, dataSource, interval)
      const result = computeSnapshotUpdate(candles, prevSnapshot)
      if (!result) {
        log(`Skipped ${key}: only ${candles.length} candle(s), not enough for CCI(14) yet`)
        failures.push({ key, message: `Only ${candles.length} candle(s) returned — not enough for CCI(14) yet` })
        continue
      }

      const { snapshot, closedTrend } = result
      const prefix = idPrefix(symbol, dataSource, interval)
      const doc = {
        id: `${prefix}_${snapshot.timestamp}`,
        symbol,
        dataSource,
        interval,
        ...snapshot,
      }
      await getContainer('snapshots').items.upsert(doc)
      updated++

      if (closedTrend) {
        await getContainer('trends').items.upsert({
          id: `${prefix}_${closedTrend.startTime}`,
          symbol,
          dataSource,
          interval,
          ...closedTrend,
        })
        trendsClosed++
      }
    } catch (err) {
      log(`Failed to snapshot ${key}: ${err.message}`)
      failed++
      failures.push({ key, message: err.message })
    }
  }

  return { watchedActive: watched.length, groups: groups.size, updated, trendsClosed, failed, failures }
}

// One-time (or re-runnable) reconstruction of history from candles already on hand,
// rather than only accumulating forward from whenever the symbol was added to the
// watchlist. Writes only the bars where something happened (a non-'hold' signal) plus
// the final/current bar — not every single 'hold' bar, which for a few thousand hourly
// candles would mean a few thousand near-identical Cosmos writes for one on-demand call.
export async function runBackfill(symbol, dataSource, interval, log = () => {}) {
  const candles = await fetchCandles(symbol, interval, BACKFILL_OUTPUT_SIZE[interval] ?? 2000, dataSource)
  const { events, trends } = backfillTrendHistory(candles)
  const prefix = idPrefix(symbol, dataSource, interval)

  for (const snapshot of events) {
    await getContainer('snapshots').items.upsert({
      id: `${prefix}_${snapshot.timestamp}`,
      symbol,
      dataSource,
      interval,
      ...snapshot,
    })
  }
  for (const t of trends) {
    await getContainer('trends').items.upsert({
      id: `${prefix}_${t.startTime}`,
      symbol,
      dataSource,
      interval,
      ...t,
    })
  }

  log(`Backfilled ${symbol}|${dataSource}|${interval}: ${candles.length} candles, ${events.length} events, ${trends.length} trends`)
  return { candles: candles.length, events: events.length, trends: trends.length }
}

app.timer('snapshotsEngine', {
  schedule: '0 5 * * * *', // :05 past the hour — offset from alertsEngine's :00 so both don't hit Twelve Data at once
  handler: async (_myTimer, context) => {
    const summary = await runSnapshotsCheck((msg) => context.log(msg))
    context.log('Snapshots check complete:', JSON.stringify(summary))
  },
})

app.http('snapshotsRun', {
  methods: ['POST'],
  route: 'snapshots/run',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const uid = await verifyAuth(request)
    if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }

    const summary = await runSnapshotsCheck((msg) => context.log(msg))
    return { jsonBody: summary }
  },
})

app.http('snapshotsBackfill', {
  methods: ['POST'],
  route: 'snapshots/backfill',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const uid = await verifyAuth(request)
    if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }

    const body = await request.json()
    const { symbol, dataSource, interval } = body
    if (!symbol || !dataSource || !interval) {
      return { status: 400, jsonBody: { error: 'symbol, dataSource, and interval are required.' } }
    }

    try {
      const summary = await runBackfill(symbol, dataSource, interval, (msg) => context.log(msg))
      return { jsonBody: summary }
    } catch (err) {
      return { status: err.status ?? 500, jsonBody: { error: err.message } }
    }
  },
})

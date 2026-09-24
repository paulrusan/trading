import { app } from '@azure/functions'
import { getContainer } from '../cosmosClient.js'
import { verifyAuth } from '../verifyAuth.js'

// Snapshots/trends are shared, system-written data (partitioned by /symbol, not
// /userId, since the underlying market data is the same regardless of who's watching)
// — read-only from the client, so these are GET-only, unlike the CRUD resources.
async function queryRecent(containerName, orderField, request) {
  const symbol = request.query.get('symbol')
  const dataSource = request.query.get('dataSource') ?? 'twelvedata'
  const interval = request.query.get('interval') ?? '1day'
  const limit = Math.min(Number(request.query.get('limit')) || 50, 200)
  if (!symbol) return { status: 400, jsonBody: { error: 'symbol query parameter is required.' } }

  const { resources } = await getContainer(containerName)
    .items.query({
      query: `SELECT TOP ${limit} * FROM c WHERE c.symbol = @symbol AND c.dataSource = @dataSource AND c.interval = @interval ORDER BY c.${orderField} DESC`,
      parameters: [
        { name: '@symbol', value: symbol },
        { name: '@dataSource', value: dataSource },
        { name: '@interval', value: interval },
      ],
    })
    .fetchAll()

  return { jsonBody: { results: resources.reverse() } } // oldest -> newest, easier to read as a timeline
}

app.http('snapshotsList', {
  methods: ['GET'],
  route: 'snapshots',
  authLevel: 'anonymous',
  handler: async (request) => {
    const uid = await verifyAuth(request)
    if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }
    return queryRecent('snapshots', 'timestamp', request)
  },
})

app.http('trendsList', {
  methods: ['GET'],
  route: 'trends',
  authLevel: 'anonymous',
  handler: async (request) => {
    const uid = await verifyAuth(request)
    if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }
    return queryRecent('trends', 'endTime', request)
  },
})

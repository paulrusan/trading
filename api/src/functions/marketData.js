import { app } from '@azure/functions'
import { fetchCandles } from '../marketDataFetchers.js'
import { verifyAuth } from '../verifyAuth.js'

app.http('marketData', {
  methods: ['GET'],
  route: 'market-data',
  authLevel: 'anonymous',
  handler: async (request) => {
    const uid = await verifyAuth(request)
    if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }

    const symbol = request.query.get('symbol')
    const interval = request.query.get('interval') ?? '1day'
    const outputsize = request.query.get('outputsize') ?? '200'
    const source = request.query.get('source') ?? 'twelvedata'
    if (!symbol) {
      return { status: 400, jsonBody: { error: 'symbol query parameter is required.' } }
    }

    try {
      const candles = await fetchCandles(symbol, interval, outputsize, source)
      return { jsonBody: { symbol, interval, source, candles } }
    } catch (err) {
      return { status: err.status ?? 500, jsonBody: { error: err.message } }
    }
  },
})

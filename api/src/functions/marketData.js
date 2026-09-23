import { app } from '@azure/functions'
import { verifyAuth } from '../verifyAuth.js'

app.http('marketData', {
  methods: ['GET'],
  route: 'market-data',
  authLevel: 'anonymous',
  handler: async (request) => {
    const uid = await verifyAuth(request)
    if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }

    const apiKey = process.env.TWELVE_DATA_API_KEY
    if (!apiKey) {
      return { status: 500, jsonBody: { error: 'Market data is not configured on the server.' } }
    }

    const symbol = request.query.get('symbol')
    const interval = request.query.get('interval') ?? '1day'
    const outputsize = request.query.get('outputsize') ?? '200'
    if (!symbol) {
      return { status: 400, jsonBody: { error: 'symbol query parameter is required.' } }
    }

    const url = new URL('https://api.twelvedata.com/time_series')
    url.searchParams.set('symbol', symbol)
    url.searchParams.set('interval', interval)
    url.searchParams.set('outputsize', outputsize)
    url.searchParams.set('apikey', apiKey)

    const res = await fetch(url)
    const data = await res.json()

    if (data.status === 'error') {
      return { status: 400, jsonBody: { error: data.message ?? 'Market data request failed.' } }
    }

    const candles = (data.values ?? [])
      .map((v) => ({
        time: Math.floor(new Date(v.datetime.replace(' ', 'T')).getTime() / 1000),
        dateLabel: v.datetime,
        open: Number(v.open),
        high: Number(v.high),
        low: Number(v.low),
        close: Number(v.close),
      }))
      .reverse()

    return { jsonBody: { symbol, interval, candles } }
  },
})

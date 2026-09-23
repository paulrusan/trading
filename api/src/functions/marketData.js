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
    // Twelve Data defaults to exchange-local time otherwise, which drifted daily bars by
    // several hours against the TradingView widget (configured for UTC) and could push a
    // bar into the wrong calendar day depending on the server's own local timezone.
    url.searchParams.set('timezone', 'UTC')
    url.searchParams.set('apikey', apiKey)

    const res = await fetch(url)
    const data = await res.json()

    if (data.status === 'error') {
      return { status: 400, jsonBody: { error: data.message ?? 'Market data request failed.' } }
    }

    const candles = (data.values ?? [])
      .map((v) => {
        // Intraday values come back as "YYYY-MM-DD HH:mm:ss" — force UTC parsing
        // explicitly (the 'Z' suffix), since without it a datetime string with no offset
        // is parsed as the executing process's local time, not UTC. Daily/weekly values
        // come back date-only ("YYYY-MM-DD"), which the Date constructor already parses
        // as UTC midnight per spec, so leave those as-is.
        const iso = v.datetime.includes(' ') ? `${v.datetime.replace(' ', 'T')}Z` : v.datetime
        return {
          time: Math.floor(new Date(iso).getTime() / 1000),
          dateLabel: v.datetime,
          open: Number(v.open),
          high: Number(v.high),
          low: Number(v.low),
          close: Number(v.close),
        }
      })
      .reverse()

    return { jsonBody: { symbol, interval, candles } }
  },
})

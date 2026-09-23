import { app } from '@azure/functions'
import { verifyAuth } from '../verifyAuth.js'

app.http('symbolSearch', {
  methods: ['GET'],
  route: 'symbol-search',
  authLevel: 'anonymous',
  handler: async (request) => {
    const uid = await verifyAuth(request)
    if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }

    const apiKey = process.env.TWELVE_DATA_API_KEY
    if (!apiKey) {
      return { status: 500, jsonBody: { error: 'Market data is not configured on the server.' } }
    }

    const query = request.query.get('query')?.trim()
    if (!query) {
      return { jsonBody: { results: [] } }
    }

    const url = new URL('https://api.twelvedata.com/symbol_search')
    url.searchParams.set('symbol', query)
    url.searchParams.set('outputsize', '15')
    url.searchParams.set('apikey', apiKey)

    const res = await fetch(url)
    const data = await res.json()

    if (data.status === 'error') {
      return { jsonBody: { results: [] } }
    }

    const results = (data.data ?? []).map((r) => ({
      symbol: r.symbol,
      name: r.instrument_name,
      exchange: r.exchange,
      type: r.instrument_type,
      country: r.country,
    }))

    return { jsonBody: { results } }
  },
})

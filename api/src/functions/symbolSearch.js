import { app } from '@azure/functions'
import YahooFinance from 'yahoo-finance2'
import { verifyAuth } from '../verifyAuth.js'

const yahooFinance = new YahooFinance()

async function searchTwelveData(query) {
  const apiKey = process.env.TWELVE_DATA_API_KEY
  if (!apiKey) {
    throw Object.assign(new Error('Market data is not configured on the server.'), { status: 500 })
  }

  const url = new URL('https://api.twelvedata.com/symbol_search')
  url.searchParams.set('symbol', query)
  url.searchParams.set('outputsize', '15')
  url.searchParams.set('apikey', apiKey)

  const res = await fetch(url)
  const data = await res.json()
  if (data.status === 'error') return []

  return (data.data ?? []).map((r) => ({
    symbol: r.symbol,
    name: r.instrument_name,
    exchange: r.exchange,
    type: r.instrument_type,
    country: r.country,
  }))
}

async function searchYahoo(query) {
  const data = await yahooFinance.search(query)
  return (data.quotes ?? [])
    .filter((r) => r.isYahooFinance && r.symbol)
    .map((r) => ({
      symbol: r.symbol,
      name: r.shortname ?? r.longname ?? r.symbol,
      exchange: r.exchDisp,
      type: r.typeDisp,
      country: undefined,
    }))
}

app.http('symbolSearch', {
  methods: ['GET'],
  route: 'symbol-search',
  authLevel: 'anonymous',
  handler: async (request) => {
    const uid = await verifyAuth(request)
    if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }

    const query = request.query.get('query')?.trim()
    const source = request.query.get('source') ?? 'twelvedata'
    if (!query) {
      return { jsonBody: { results: [] } }
    }

    try {
      const results = source === 'yahoo' ? await searchYahoo(query) : await searchTwelveData(query)
      return { jsonBody: { results } }
    } catch (err) {
      return { status: err.status ?? 500, jsonBody: { error: err.message } }
    }
  },
})

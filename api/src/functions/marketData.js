import { app } from '@azure/functions'
import YahooFinance from 'yahoo-finance2'
import { verifyAuth } from '../verifyAuth.js'

// No credentials needed to construct this, so it's safe at module scope (unlike the
// Cosmos/Firebase clients elsewhere, which crash at import time without real secrets).
const yahooFinance = new YahooFinance()

// Both providers can return real, non-flat Saturday/Sunday bars for forex/metals/futures
// that aren't legitimate trading days — confirmed by inspecting live responses. Crypto
// genuinely trades every day, so it's exempt.
function dropWeekendBars(candles, interval, isContinuousMarket) {
  if (isContinuousMarket || interval === '1week') return candles
  return candles.filter((c) => {
    const day = new Date(c.time * 1000).getUTCDay()
    return day !== 0 && day !== 6
  })
}

async function fetchFromTwelveData(symbol, interval, outputsize) {
  const apiKey = process.env.TWELVE_DATA_API_KEY
  if (!apiKey) {
    throw Object.assign(new Error('Market data is not configured on the server.'), { status: 500 })
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
    throw Object.assign(new Error(data.message ?? 'Market data request failed.'), { status: 400 })
  }

  const isContinuousMarket = data.meta?.type === 'Digital Currency'

  const candles = (data.values ?? []).map((v) => {
    // Intraday values come back as "YYYY-MM-DD HH:mm:ss" — force UTC parsing explicitly
    // (the 'Z' suffix), since without it a datetime string with no offset is parsed as
    // the executing process's local time, not UTC. Daily/weekly values come back
    // date-only ("YYYY-MM-DD"), which the Date constructor already parses as UTC
    // midnight per spec, so leave those as-is.
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

  return dropWeekendBars(candles.reverse(), interval, isContinuousMarket)
}

const YAHOO_INTERVAL = { '1h': '60m', '4h': '60m', '1day': '1d', '1week': '1wk' }
// Yahoo has no native 4-hour granularity — fetch hourly and bucket it ourselves.
const YAHOO_PERIOD1 = {
  '1h': () => new Date(Date.now() - 730 * 24 * 60 * 60 * 1000),
  '4h': () => new Date(Date.now() - 730 * 24 * 60 * 60 * 1000),
  '1day': () => new Date('1995-01-01'),
  '1week': () => new Date('1990-01-01'),
}

function aggregateHourlyTo4h(candles) {
  const bucketSeconds = 4 * 60 * 60
  const buckets = new Map()
  for (const c of candles) {
    const bucketTime = Math.floor(c.time / bucketSeconds) * bucketSeconds
    const existing = buckets.get(bucketTime)
    if (!existing) {
      buckets.set(bucketTime, { ...c, time: bucketTime })
    } else {
      existing.high = Math.max(existing.high, c.high)
      existing.low = Math.min(existing.low, c.low)
      existing.close = c.close
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time)
}

async function fetchFromYahoo(symbol, interval) {
  const yahooInterval = YAHOO_INTERVAL[interval] ?? '1d'
  const period1 = (YAHOO_PERIOD1[interval] ?? YAHOO_PERIOD1['1day'])()

  let chart
  try {
    chart = await yahooFinance.chart(symbol, { period1, interval: yahooInterval })
  } catch (err) {
    throw Object.assign(new Error(`Yahoo Finance: ${err.message}`), { status: 400 })
  }

  const isContinuousMarket = chart.meta?.instrumentType === 'CRYPTOCURRENCY'

  let candles = (chart.quotes ?? [])
    .filter((q) => q.open != null && q.high != null && q.low != null && q.close != null)
    .map((q) => ({
      time: Math.floor(q.date.getTime() / 1000),
      dateLabel: q.date.toISOString(),
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
    }))

  if (interval === '4h') candles = aggregateHourlyTo4h(candles)

  return dropWeekendBars(candles, interval, isContinuousMarket)
}

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
      const candles =
        source === 'yahoo'
          ? await fetchFromYahoo(symbol, interval)
          : await fetchFromTwelveData(symbol, interval, outputsize)

      return { jsonBody: { symbol, interval, source, candles } }
    } catch (err) {
      return { status: err.status ?? 500, jsonBody: { error: err.message } }
    }
  },
})

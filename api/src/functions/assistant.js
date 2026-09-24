import { app } from '@azure/functions'
import { getContainer } from '../cosmosClient.js'
import { verifyAuth } from '../verifyAuth.js'

const ANTHROPIC_MODEL = 'claude-sonnet-5'

function buildSystemPrompt(context) {
  return `You are a trading analysis assistant embedded in a personal trading journal and
charting app. The context below may be a summary of the user's trade history and journal
performance, live market chart data (Heikin Ashi candles with CCI and EMA indicators for a
specific instrument), a "watchlistHistory" of hourly snapshots/completed trends for a symbol
the user is watching, or some combination. Use whatever is present to answer questions,
analyze patterns, project price/equity scenarios, and reason through "what if" variations
when asked. Be direct and quantitative where possible, but always caveat that projections are
illustrative, not financial advice, and past performance/indicator behavior doesn't guarantee
future results.

When "watchlistHistory" is present: its "snapshots" are precomputed hourly records (price,
CCI(20), SMA(200), Parabolic SAR, a "signal" of buy/short/exit_long/exit_short/hold, a
"regime" of up/down/neutral, and a "position" of long/short/flat) and its "trends" are
closed trades (direction long/short, entry/exit time and price, movePct). These are
already computed server-side by a real long/short rule that uses one indicator for entries
and a different one for exits: price above SMA(200) is an uptrend, below it a downtrend;
while flat, CCI(20) crossing the zero line enters a position (up-cross in an uptrend =
long, down-cross in a downtrend = short); once a position is open, CCI crossings are
ignored and the exit instead fires when price crosses the Parabolic SAR (a long exits when
price drops below the SAR dots, a short when price rises above them). Interpret and explain
these, don't recompute your own signal from the raw indicator values, and don't imply more
certainty than the underlying rule actually supports.

Context (JSON):
${JSON.stringify(context, null, 2)}`
}

app.http('assistant', {
  methods: ['POST'],
  route: 'assistant',
  authLevel: 'anonymous',
  handler: async (request) => {
    const uid = await verifyAuth(request)
    if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }

    let settingsDoc
    try {
      const { resource } = await getContainer('settings').item(uid, uid).read()
      settingsDoc = resource
    } catch (err) {
      if (err.code !== 404) throw err
    }

    const apiKey = settingsDoc?.anthropicApiKey
    if (!apiKey) {
      return {
        status: 400,
        jsonBody: { error: 'No Anthropic API key configured. Add one in Settings.' },
      }
    }

    const body = await request.json()
    const { message, context, history } = body

    const messages = [
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ]

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
        system: buildSystemPrompt(context ?? {}),
        messages,
      }),
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      return {
        status: res.status === 401 ? 400 : 502,
        jsonBody: {
          error:
            res.status === 401
              ? 'Anthropic rejected the API key. Check it in Settings.'
              : (errBody.error?.message ?? 'Anthropic API request failed.'),
        },
      }
    }

    const data = await res.json()
    const text = data.content?.map((block) => block.text ?? '').join('') ?? ''
    return { jsonBody: { reply: text } }
  },
})

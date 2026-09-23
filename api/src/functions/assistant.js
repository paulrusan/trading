import { app } from '@azure/functions'
import { getContainer } from '../cosmosClient.js'
import { verifyAuth } from '../verifyAuth.js'

const ANTHROPIC_MODEL = 'claude-sonnet-5'

function buildSystemPrompt(context) {
  return `You are a trading analysis assistant embedded in the user's personal trading journal.
You have access to a summary of their trade history and performance below. Use it to answer
questions, analyze patterns, and build projections or scenarios when asked. Be direct and
quantitative where possible, but always caveat that projections are illustrative, not
financial advice, and past performance doesn't guarantee future results.

Trading journal summary (JSON):
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

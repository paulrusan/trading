import { app } from '@azure/functions'
import { getContainer } from '../cosmosClient.js'
import { verifyAuth } from '../verifyAuth.js'

app.http('settingsGet', {
  methods: ['GET'],
  route: 'settings',
  authLevel: 'anonymous',
  handler: async (request) => {
    const uid = await verifyAuth(request)
    if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }

    try {
      const { resource } = await getContainer('settings').item(uid, uid).read()
      return { jsonBody: { hasAnthropicApiKey: Boolean(resource?.anthropicApiKey) } }
    } catch (err) {
      if (err.code === 404) return { jsonBody: { hasAnthropicApiKey: false } }
      throw err
    }
  },
})

app.http('settingsSave', {
  methods: ['POST'],
  route: 'settings',
  authLevel: 'anonymous',
  handler: async (request) => {
    const uid = await verifyAuth(request)
    if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }

    const body = await request.json()
    await getContainer('settings').items.upsert({
      id: uid,
      userId: uid,
      anthropicApiKey: body.anthropicApiKey,
    })
    return { jsonBody: { hasAnthropicApiKey: Boolean(body.anthropicApiKey) } }
  },
})

app.http('settingsDelete', {
  methods: ['DELETE'],
  route: 'settings',
  authLevel: 'anonymous',
  handler: async (request) => {
    const uid = await verifyAuth(request)
    if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }

    try {
      await getContainer('settings').item(uid, uid).delete()
    } catch (err) {
      if (err.code !== 404) throw err
    }
    return { status: 204 }
  },
})

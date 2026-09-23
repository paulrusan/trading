import { app } from '@azure/functions'
import { getContainer } from './cosmosClient.js'
import { verifyAuth } from './verifyAuth.js'

export function registerCrudRoutes(resource, containerName) {
  app.http(`${resource}List`, {
    methods: ['GET'],
    route: resource,
    authLevel: 'anonymous',
    handler: async (request) => {
      const uid = await verifyAuth(request)
      if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }

      const { resources } = await getContainer(containerName)
        .items.query({
          query: 'SELECT * FROM c WHERE c.userId = @userId',
          parameters: [{ name: '@userId', value: uid }],
        })
        .fetchAll()

      return { jsonBody: resources }
    },
  })

  app.http(`${resource}Save`, {
    methods: ['POST'],
    route: resource,
    authLevel: 'anonymous',
    handler: async (request) => {
      const uid = await verifyAuth(request)
      if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }

      const body = await request.json()
      const item = {
        ...body,
        id: body.id ?? crypto.randomUUID(),
        userId: uid,
      }

      const { resource: saved } = await getContainer(containerName).items.upsert(item)
      return { jsonBody: saved }
    },
  })

  app.http(`${resource}Delete`, {
    methods: ['DELETE'],
    route: `${resource}/{id}`,
    authLevel: 'anonymous',
    handler: async (request) => {
      const uid = await verifyAuth(request)
      if (!uid) return { status: 401, jsonBody: { error: 'Unauthorized' } }

      const { id } = request.params
      try {
        await getContainer(containerName).item(id, uid).delete()
        return { status: 204 }
      } catch (err) {
        if (err.code === 404) {
          return { status: 404, jsonBody: { error: 'Not found' } }
        }
        throw err
      }
    },
  })
}

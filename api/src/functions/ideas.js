import { ideasContainer } from '../cosmosClient.js'
import { registerCrudRoutes } from '../crudRoutes.js'

registerCrudRoutes('ideas', ideasContainer)

import { tradesContainer } from '../cosmosClient.js'
import { registerCrudRoutes } from '../crudRoutes.js'

registerCrudRoutes('trades', tradesContainer)

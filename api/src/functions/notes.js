import { notesContainer } from '../cosmosClient.js'
import { registerCrudRoutes } from '../crudRoutes.js'

registerCrudRoutes('notes', notesContainer)

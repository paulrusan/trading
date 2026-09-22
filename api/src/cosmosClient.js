import { CosmosClient } from '@azure/cosmos'

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING)
const database = client.database(process.env.COSMOS_DATABASE_NAME)

export const tradesContainer = database.container('trades')
export const ideasContainer = database.container('ideas')
export const notesContainer = database.container('notes')

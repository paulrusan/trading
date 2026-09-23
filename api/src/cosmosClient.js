import { CosmosClient } from '@azure/cosmos'

let database

function getDatabase() {
  if (!database) {
    const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING)
    database = client.database(process.env.COSMOS_DATABASE_NAME)
  }
  return database
}

export function getContainer(name) {
  return getDatabase().container(name)
}

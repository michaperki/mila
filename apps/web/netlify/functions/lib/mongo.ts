import { MongoClient, Db } from 'mongodb'

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB_NAME || 'mila'

if (!uri) {
  throw new Error('MONGODB_URI is not defined')
}

let client: MongoClient | null = null
let cachedDb: Db | null = null

export const getDb = async (): Promise<Db> => {
  if (cachedDb && client) {
    return cachedDb
  }

  client = new MongoClient(uri)
  await client.connect()
  cachedDb = client.db(dbName)
  return cachedDb
}

export const closeDb = async () => {
  if (client) {
    await client.close()
    client = null
    cachedDb = null
  }
}

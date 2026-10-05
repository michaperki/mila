import { MongoClient, Db } from 'mongodb'
import { ServiceError } from './serviceError'

let client: MongoClient | null = null
let cachedDb: Db | null = null
let pending: Promise<Db> | null = null

export const getDb = async (): Promise<Db> => {
  if (cachedDb) return cachedDb
  if (pending) return pending
  const uri = process.env.MONGODB_URI
  if (!uri?.trim() || !/^mongodb(?:\+srv)?:\/\//.test(uri)) {
    throw new ServiceError('DATABASE_CONFIG', 'Sign-in is unavailable because account storage is not configured. Please contact the site owner.')
  }
  pending = (async () => {
    let connection: MongoClient | null = null
    try {
      connection = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000 })
      await connection.connect()
      client = connection
      cachedDb = connection.db(process.env.MONGODB_DB_NAME || 'mila')
      return cachedDb
    } catch (error) {
      await connection?.close().catch(() => {})
      const failure = error as { name?: string; code?: string | number; cause?: { code?: string | number } }
      // Never log connection strings or database credentials.
      console.error('Database connection failed', { name: failure.name, code: failure.code, causeCode: failure.cause?.code })
      throw new ServiceError('DATABASE_UNAVAILABLE', 'We cannot reach account storage right now. Please try again later. If this continues, contact the site owner.')
    }
  })().finally(() => { pending = null })
  return pending
}

export const closeDb = async () => {
  if (client) await client.close()
  client = null
  cachedDb = null
}

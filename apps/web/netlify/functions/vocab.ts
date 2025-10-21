import type { Handler } from '@netlify/functions'
import { getDb } from './lib/mongo'
import { verifyAuth } from './lib/auth'

const handler: Handler = async (event) => {
  try {
    const auth = verifyAuth(event)
    const db = await getDb()
    const vocab = db.collection('vocab')

    if (event.httpMethod === 'GET') {
      const docs = await vocab.find({ userId: auth.userId }).sort({ createdAt: -1 }).toArray()
      const sanitized = docs.map(({ _id, ...rest }) => normalizeItem(rest))
      return {
        statusCode: 200,
        body: JSON.stringify({ vocab: sanitized }),
      }
    }

    if (event.httpMethod === 'POST') {
      if (!event.body) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Missing body' }) }
      }

      const payload = JSON.parse(event.body)
      const id = payload.id || (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
      const createdAt =
        typeof payload.createdAt === 'number'
          ? payload.createdAt
          : payload.createdAt
          ? new Date(payload.createdAt).getTime()
          : Date.now()

      const doc = {
        ...payload,
        id,
        userId: auth.userId,
        createdAt,
        updatedAt: Date.now(),
      }

      await vocab.updateOne({ userId: auth.userId, id }, { $set: doc }, { upsert: true })
      return {
        statusCode: 200,
        body: JSON.stringify({ item: normalizeItem(doc) }),
      }
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id
      if (!id) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Missing vocab id' }) }
      }

      await vocab.deleteOne({ userId: auth.userId, id })
      return { statusCode: 204, body: '' }
    }

    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) }
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500
    return {
      statusCode,
      body: JSON.stringify({ message: (error as Error).message || 'Unexpected error' }),
    }
  }
}

export { handler }

const normalizeItem = (item: any) => ({
  ...item,
  id: item.id ?? item._id ?? crypto.randomUUID(),
  lemma: typeof item.lemma === 'string' ? item.lemma.replace(/[,،，]+/g, '').trim() : item.lemma,
  createdAt:
    typeof item.createdAt === 'number'
      ? item.createdAt
      : item.createdAt
      ? new Date(item.createdAt).getTime()
      : Date.now(),
  frequency: item.frequency && item.frequency > 0 ? item.frequency : 1,
})

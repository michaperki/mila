import type { Handler } from '@netlify/functions'
import { ObjectId } from 'mongodb'
import { getDb } from './lib/mongo'
import { verifyAuth } from './lib/auth'

const handler: Handler = async (event) => {
  try {
    const auth = verifyAuth(event)
    const db = await getDb()
    const texts = db.collection('texts')

    if (event.httpMethod === 'GET') {
      const docs = await texts
        .find({ userId: auth.userId })
        .sort({ createdAt: -1 })
        .toArray()
      return {
        statusCode: 200,
        body: JSON.stringify({ texts: docs }),
      }
    }

    if (event.httpMethod === 'POST') {
      if (!event.body) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Missing body' }) }
      }
      const payload = JSON.parse(event.body)
      const textId = payload.textId || (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
      const doc = {
        ...payload,
        textId,
        userId: auth.userId,
        createdAt: payload.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await texts.updateOne({ userId: auth.userId, textId }, { $set: doc }, { upsert: true })
      return {
        statusCode: 200,
        body: JSON.stringify({ text: doc }),
      }
    }

    if (event.httpMethod === 'DELETE') {
      const textId = event.queryStringParameters?.textId
      const id = event.queryStringParameters?.id

      if (!textId && !id) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Provide id or textId query parameter' }),
        }
      }

      const filter = textId
        ? { userId: auth.userId, textId }
        : { userId: auth.userId, _id: new ObjectId(String(id)) }

      await texts.deleteOne(filter)
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

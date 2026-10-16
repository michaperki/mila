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

      // `encounter` (mobile): one place the word was met. It is added to the entry's
      // `encounters` (one per sentence, newest last) instead of replacing the entry's context,
      // so meeting a word again in another book keeps one entry and one practice history.
      const { encounter, createdAt: _sent, ...fields } = payload
      if (encounter !== undefined && !(encounter && typeof encounter === 'object' && typeof encounter.context === 'string')) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid encounter' }) }
      }
      const doc = {
        ...fields,
        id,
        userId: auth.userId,
        updatedAt: Date.now(),
      }

      if (encounter) await vocab.updateOne({ userId: auth.userId, id }, { $pull: { encounters: { context: encounter.context } } } as never)
      await vocab.updateOne(
        { userId: auth.userId, id },
        {
          $set: doc,
          // Saving again keeps the word's place in the practice order.
          $setOnInsert: { createdAt },
          ...(encounter ? { $push: { encounters: { $each: [encounter], $slice: -20 } } } : {}),
        } as never,
        { upsert: true },
      )
      return {
        statusCode: 200,
        body: JSON.stringify({ item: normalizeItem({ ...doc, createdAt }) }),
      }
    }

    // Records a practice result without touching the rest of the entry (POST replaces it).
    if (event.httpMethod === 'PATCH') {
      const payload = JSON.parse(event.body || '{}')
      const review = payload.review
      const valid = typeof payload.id === 'string' && review && ['due', 'interval', 'reps', 'lapses'].every(key => typeof review[key] === 'number' && Number.isFinite(review[key]))
      if (!valid) return { statusCode: 400, body: JSON.stringify({ message: 'Invalid review' }) }
      const { due, interval, reps, lapses, last } = review
      const result = await vocab.updateOne(
        { userId: auth.userId, id: payload.id },
        { $set: { review: { due, interval, reps, lapses, ...(typeof last === 'number' ? { last } : {}) }, updatedAt: Date.now() } },
      )
      if (!result.matchedCount) return { statusCode: 404, body: JSON.stringify({ message: 'This word is no longer saved.' }) }
      return { statusCode: 204, body: '' }
    }

    if (event.httpMethod === 'DELETE') {
      // `all=1` clears the whole list (Account → Delete all saved words); it must be explicit,
      // so a request that merely lacks an id still fails.
      if (event.queryStringParameters?.all === '1') {
        const { deletedCount } = await vocab.deleteMany({ userId: auth.userId })
        return { statusCode: 200, body: JSON.stringify({ deleted: deletedCount }) }
      }
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

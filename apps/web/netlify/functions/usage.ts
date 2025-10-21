import type { Handler } from '@netlify/functions'
import { getDb } from './lib/mongo'
import { verifyAuth } from './lib/auth'

const FREE_CAPTURE_LIMIT = Number(process.env.FREE_CAPTURE_LIMIT ?? 5)
const USAGE_PERIOD_DAYS = Number(process.env.USAGE_PERIOD_DAYS ?? 30)

const resetPeriod = () => {
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)
  return now.toISOString()
}

const isActivePeriod = (periodStart: string) => {
  const start = new Date(periodStart)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays < USAGE_PERIOD_DAYS
}

const handler: Handler = async (event) => {
  try {
    const auth = verifyAuth(event)
    const db = await getDb()
    const usage = db.collection('usage')

    const record = await usage.findOne({ userId: auth.userId })

    if (event.httpMethod === 'GET') {
      const normalized = record && isActivePeriod(record.periodStart)
        ? record
        : { userId: auth.userId, captures: 0, periodStart: resetPeriod() }

      return {
        statusCode: 200,
        body: JSON.stringify({
          captures: normalized.captures,
          limit: auth.tier === 'premium' ? null : FREE_CAPTURE_LIMIT,
          periodStart: normalized.periodStart,
        }),
      }
    }

    if (event.httpMethod === 'POST') {
      if (auth.tier === 'premium') {
        return {
          statusCode: 200,
          body: JSON.stringify({ captures: 0, limit: null, periodStart: resetPeriod() }),
        }
      }

      const activeRecord = record && isActivePeriod(record.periodStart)
        ? record
        : { userId: auth.userId, captures: 0, periodStart: resetPeriod() }

      if (activeRecord.captures >= FREE_CAPTURE_LIMIT) {
        return {
          statusCode: 429,
          body: JSON.stringify({ message: 'Capture limit reached', captures: activeRecord.captures, limit: FREE_CAPTURE_LIMIT }),
        }
      }

      const updated = {
        ...activeRecord,
        captures: activeRecord.captures + 1,
      }

      await usage.updateOne(
        { userId: auth.userId },
        { $set: updated },
        { upsert: true },
      )

      return {
        statusCode: 200,
        body: JSON.stringify({ captures: updated.captures, limit: FREE_CAPTURE_LIMIT, periodStart: updated.periodStart }),
      }
    }

    if (event.httpMethod === 'DELETE') {
      await usage.deleteOne({ userId: auth.userId })
      return {
        statusCode: 204,
        body: '',
      }
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

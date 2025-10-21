import type { Handler } from '@netlify/functions'
import { getDb } from './lib/mongo'
import { verifyAuth } from './lib/auth'

const handler: Handler = async (event) => {
  try {
    const auth = verifyAuth(event)
    const db = await getDb()
    const users = db.collection('users')

    if (event.httpMethod === 'POST') {
      const mockOnly = process.env.USE_MOCK_PAYMENTS !== 'false'

      if (!mockOnly) {
        return {
          statusCode: 501,
          body: JSON.stringify({ message: 'Real payments not yet implemented' }),
        }
      }

      await users.updateOne(
        { userId: auth.userId },
        { $set: { tier: 'premium', upgradedAt: new Date().toISOString() } },
      )

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Account upgraded (mock)', tier: 'premium' }),
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

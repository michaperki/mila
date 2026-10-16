import type { Handler } from '@netlify/functions'
import { verifyAuth } from './lib/auth'
import { monthSummary } from './lib/ai-usage'

const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })

// GET: this month's estimated AI spend for the signed-in user, by feature (Account → AI usage).
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') return reply(405, { message: 'Use GET.' })
  try {
    const auth = verifyAuth(event)
    return reply(200, await monthSummary(auth.userId))
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.' })
    console.error('Usage summary failed', { name: (error as Error).name })
    return reply(503, { message: 'Usage is unavailable right now.' })
  }
}

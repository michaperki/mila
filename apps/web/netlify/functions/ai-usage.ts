import type { Handler } from '@netlify/functions'
import { verifyAuth } from './lib/auth'
import { isAdmin, monthByUser, monthSummary } from './lib/ai-usage'

const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })

// GET: this month's estimated AI spend across all learners, by feature and by learner
// (Account → AI spend). Only for the developers (ADMIN_EMAILS); learners never see spend.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') return reply(405, { message: 'Use GET.' })
  try {
    const auth = verifyAuth(event)
    if (!isAdmin(auth.email)) return reply(403, { message: 'Not available.' })
    const [summary, users] = await Promise.all([monthSummary(), monthByUser()])
    return reply(200, { ...summary, users })
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.' })
    console.error('Usage summary failed', { name: (error as Error).name })
    return reply(503, { message: 'Usage is unavailable right now.' })
  }
}

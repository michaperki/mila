import type { Handler } from '@netlify/functions'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { getDb } from './lib/mongo'

const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// DELETE: removes the signed-in account and everything kept for it (Account → Delete account;
// Apple requires that an account made in the app can be deleted in it). The AI spend records
// stay for the totals but no longer say whose they were. Answers in the shared AI and speech
// caches belong to no one and stay.
export const handler: Handler = async (event) => {
  const requestId = randomUUID()
  if (event.httpMethod !== 'DELETE') return reply(405, { message: 'Use DELETE.' })
  try {
    const { userId } = verifyAuth(event)
    const db = await getDb()
    await Promise.all(['vocab', 'texts', 'usage', 'feedback', 'trees', 'activity'].map(name => db.collection(name).deleteMany({ userId })))
    await db.collection('mobileOcrUsage').deleteMany({ _id: { $regex: `^${escape(userId)}:` } } as never)
    await db.collection('aiUsage').updateMany({ userId }, { $set: { userId: 'deleted' } })
    // The account itself goes last, so a failure part way can be retried while still signed in.
    await db.collection('users').deleteOne({ userId })
    console.info('Account deleted', { requestId })
    return reply(200, { deleted: true })
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    console.error('Account deletion failed', { requestId, name: (error as Error).name })
    return reply(503, { message: 'Your account could not be deleted right now. Please try again.', code: 'DELETE_FAILED', requestId })
  }
}

import type { Handler } from '@netlify/functions'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { getDb } from './lib/mongo'

// Field reports from the mobile app: the user's note plus what the app saw at that
// moment (OCR text, segments, word analysis, app version), so issues found in real
// use can be reproduced later. Images are never stored.
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })

export const handler: Handler = async (event) => {
  const requestId = randomUUID()
  try {
    const auth = verifyAuth(event)
    const feedback = (await getDb()).collection('feedback')
    if (event.httpMethod === 'GET') {
      const items = await feedback.find({ userId: auth.userId }).sort({ createdAt: -1 }).limit(50).project({ _id: 0 }).toArray()
      return reply(200, { feedback: items })
    }
    if (event.httpMethod !== 'POST') return reply(405, { message: 'Use GET or POST.' })
    if ((event.body?.length ?? 0) > 200_000) return reply(413, { message: 'This report is too large to send.' })
    let payload: { note?: unknown; screen?: unknown; context?: unknown; app?: unknown }
    try { payload = JSON.parse(event.body || '{}') } catch { return reply(400, { message: 'Invalid report.' }) }
    const note = typeof payload.note === 'string' ? payload.note.trim().slice(0, 4000) : ''
    if (!note) return reply(400, { message: 'Write a short note about what happened.' })
    const id = randomUUID()
    await feedback.insertOne({
      id, userId: auth.userId, note, createdAt: Date.now(),
      screen: typeof payload.screen === 'string' ? payload.screen.slice(0, 40) : 'unknown',
      context: payload.context ?? null, app: payload.app ?? null,
    })
    return reply(200, { id })
  } catch (error) {
    const failure = error as { statusCode?: number; code?: string; name?: string }
    if (failure.statusCode === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    console.error('Feedback request failed', { requestId, name: failure.name, code: failure.code })
    return reply(503, { message: 'Your report could not be saved. Please try again.', code: failure.code || 'FEEDBACK_UNAVAILABLE', requestId })
  }
}

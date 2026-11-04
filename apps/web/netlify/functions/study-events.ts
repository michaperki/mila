import type { Handler } from '@netlify/functions'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { getDb } from './lib/mongo'

// Study events from the mobile app (apps/mobile/src/lib/study-log.ts): a session starting, every
// card shown, turned over and answered, and a round ending, each with its session, its place in
// it and what of its word had been shown before. They are kept as sent, per account, to look back
// at what Study chose and what was remembered (scripts/study-events.mjs), and deleted with the
// account. Each event's id is unique per account, so a batch sent again is kept once.
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
const TYPES = new Set(['start', 'show', 'reveal', 'answer', 'end'])
const MAX_EVENTS = 200
let indexReady: Promise<unknown> | null = null

export const isStudyEvent = (event: unknown): event is { id: string; session: string; seq: number; at: number; type: string } => {
  const item = event as Record<string, unknown> | null
  return !!item && typeof item === 'object' && !Array.isArray(item)
    && typeof item.id === 'string' && item.id.length <= 80 && typeof item.session === 'string' && item.session.length <= 60
    && Number.isInteger(item.seq) && (item.seq as number) >= 0 && typeof item.at === 'number' && Number.isFinite(item.at)
    && typeof item.type === 'string' && TYPES.has(item.type) && JSON.stringify(item).length <= 4000
}

export const handler: Handler = async (event) => {
  const requestId = randomUUID()
  try {
    const auth = verifyAuth(event)
    if (event.httpMethod !== 'POST') return reply(405, { message: 'Use POST.' })
    if ((event.body?.length ?? 0) > 600_000) return reply(413, { message: 'Too many study events at once.' })
    let payload: { events?: unknown }
    try { payload = JSON.parse(event.body || '{}') } catch { return reply(400, { message: 'Invalid study events.' }) }
    const events = Array.isArray(payload.events) ? payload.events : null
    if (!events || events.length > MAX_EVENTS || !events.every(isStudyEvent)) return reply(400, { message: 'Invalid study events.' })
    if (!events.length) return reply(200, { kept: 0 })
    const collection = (await getDb()).collection('studyEvents')
    indexReady ??= Promise.all([
      collection.createIndex({ userId: 1, id: 1 }, { unique: true }),
      collection.createIndex({ userId: 1, at: 1 }),
    ]).catch(error => { indexReady = null; throw error })
    await indexReady
    const receivedAt = Date.now()
    try {
      await collection.insertMany(events.map(item => ({ ...item, userId: auth.userId, receivedAt })), { ordered: false })
    } catch (error) {
      // Events already kept (a batch sent again) are skipped; anything else is a failure.
      const failure = error as { code?: number; writeErrors?: { code?: number }[] }
      const duplicates = failure.code === 11000 && (failure.writeErrors ?? []).every(item => item.code === 11000)
      if (!duplicates) throw error
    }
    return reply(200, { kept: events.length })
  } catch (error) {
    const failure = error as { statusCode?: number; code?: string; name?: string }
    if (failure.statusCode === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    console.error('Study events request failed', { requestId, name: failure.name, code: failure.code })
    return reply(503, { message: 'Study events could not be saved. Please try again.', code: failure.code || 'STUDY_EVENTS_UNAVAILABLE', requestId })
  }
}

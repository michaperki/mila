import type { Handler } from '@netlify/functions'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { getDb } from './lib/mongo'

// Study events from the mobile app (apps/mobile/src/lib/study-log.ts): a session starting, every
// card shown, turned over and answered, and a round ending, and in reading and Study alike each
// sentence selected, word looked up and explained, and save made or undone, each with its session, its place in
// it and what of its word had been shown before. They are kept as sent, per account, to look back
// at what Study chose and what was remembered (scripts/study-events.mjs), and deleted with the
// account. Each event's id is unique per account, so a batch sent again is kept once.
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
// Since 2026-11-17 also: the app going to the background and coming back (`app`), how far a passage
// was scrolled (`view`), a lookup's drawer closing (`closed`, with how long it was open), and a word
// held on a card shown in English (`hold`, with what it found).
const TYPES = new Set(['start', 'show', 'reveal', 'answer', 'end', 'read', 'select', 'lookup', 'explained', 'save', 'unsave', 'app', 'view', 'closed', 'hold'])
const MAX_EVENTS = 200
// An event larger than this is kept apart rather than with the others (see below).
const MAX_EVENT = 16_000
let indexReady: Promise<unknown> | null = null

// Why an event can't be kept as a study event, or null if it can.
export const problemOf = (event: unknown): string | null => {
  const item = event as Record<string, unknown> | null
  if (!item || typeof item !== 'object' || Array.isArray(item)) return 'not an object'
  if (typeof item.id !== 'string' || item.id.length > 80) return 'id'
  if (typeof item.session !== 'string' || item.session.length > 60) return 'session'
  if (!Number.isInteger(item.seq) || (item.seq as number) < 0) return 'seq'
  if (typeof item.at !== 'number' || !Number.isFinite(item.at)) return 'at'
  if (typeof item.type !== 'string' || !TYPES.has(item.type)) return `type ${String(item.type).slice(0, 20)}`
  const size = JSON.stringify(item).length
  return size > MAX_EVENT ? `size ${size}` : null
}
export const isStudyEvent = (event: unknown): event is { id: string; session: string; seq: number; at: number; type: string } => problemOf(event) === null

export const handler: Handler = async (event) => {
  const requestId = randomUUID()
  try {
    const auth = verifyAuth(event)
    if (event.httpMethod !== 'POST') return reply(405, { message: 'Use POST.' })
    if ((event.body?.length ?? 0) > 5_000_000) return reply(413, { message: 'Too many study events at once.' })
    let payload: { events?: unknown }
    try { payload = JSON.parse(event.body || '{}') } catch { return reply(400, { message: 'Invalid study events.' }) }
    const sent = Array.isArray(payload.events) ? payload.events : null
    if (!sent || sent.length > MAX_EVENTS) return reply(400, { message: 'Invalid study events.' })
    // One event that can't be kept never holds back the rest (before 2026-11-17 it refused the
    // whole batch, and the phone sent the same batch again and again): it is kept apart, cut
    // short, with why, so nothing is lost and the cause can be found.
    const events = sent.filter(isStudyEvent)
    const refused = sent.flatMap(item => { const problem = problemOf(item); return problem ? [{ problem, item }] : [] })
    if (refused.length) {
      console.warn('Study events kept apart', { requestId, problems: refused.map(item => item.problem) })
      await (await getDb()).collection('studyEventsRefused').insertMany(refused.map(({ problem, item }) => ({
        userId: auth.userId, problem, receivedAt: Date.now(),
        id: typeof (item as { id?: unknown })?.id === 'string' ? (item as { id: string }).id.slice(0, 80) : null,
        type: typeof (item as { type?: unknown })?.type === 'string' ? (item as { type: string }).type.slice(0, 20) : null,
        json: JSON.stringify(item).slice(0, 20_000),
      })))
    }
    if (!events.length) return reply(200, { kept: 0, ...(refused.length ? { refused: refused.length } : {}) })
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
    return reply(200, { kept: events.length, ...(refused.length ? { refused: refused.length } : {}) })
  } catch (error) {
    const failure = error as { statusCode?: number; code?: string; name?: string }
    if (failure.statusCode === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    console.error('Study events request failed', { requestId, name: failure.name, code: failure.code })
    return reply(503, { message: 'Study events could not be saved. Please try again.', code: failure.code || 'STUDY_EVENTS_UNAVAILABLE', requestId })
  }
}

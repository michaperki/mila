import type { Handler } from '@netlify/functions'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { isAdmin } from './lib/ai-usage'
import { getDb } from './lib/mongo'

// Debug captures (2026-11-22), for the developers only (ADMIN_EMAILS): a capture is started on the
// phone (Account → Debug capture), which then sends what it does as spans (screen states, actions,
// requests, work done on the phone) while the functions it calls add theirs (lib/trace.ts: the
// request, database operations, AI calls). The desktop viewer (/debug.html) reads a capture back.
// POST { op: 'start', prompts }            a new capture; `prompts`: keep each AI request as sent
// POST { op: 'stop', capture }             ends it (the phone stops sending; functions stop recording)
// POST { op: 'spans', capture, spans }     the phone's spans, in batches
// GET                                      the last captures, with how many spans each
// GET ?capture=<id>                        one capture and every span in it, phone's and server's
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
const MAX_SPANS = 400
const MAX_BYTES = 2_000_000
// A capture ends by itself after this long, so one left on doesn't record for days.
const LONGEST = 2 * 60 * 60_000
const KINDS = new Set(['state', 'action', 'phone', 'net'])

export const handler: Handler = async (event) => {
  try {
    const auth = verifyAuth(event)
    if (!isAdmin(auth.email)) return reply(403, { message: 'Not available.' })
    const db = await getDb()
    const captures = db.collection('debugCaptures')
    const spans = db.collection('debugSpans')
    const now = Date.now()
    await captures.updateMany({ userId: auth.userId, stoppedAt: null, startedAt: { $lt: now - LONGEST } }, { $set: { stoppedAt: now, stoppedBy: 'time' } })

    if (event.httpMethod === 'GET') {
      const id = event.queryStringParameters?.capture
      if (id) {
        const capture = await captures.findOne({ id, userId: auth.userId }, { projection: { _id: 0, userId: 0 } })
        if (!capture) return reply(404, { message: 'No such capture.' })
        const list = await spans.find({ userId: auth.userId, capture: id }, { projection: { _id: 0, userId: 0, capture: 0 } }).sort({ start: 1 }).toArray()
        return reply(200, { capture, spans: list })
      }
      const recent = await captures.find({ userId: auth.userId }, { projection: { _id: 0, userId: 0 } }).sort({ startedAt: -1 }).limit(20).toArray()
      const counts = await spans.aggregate<{ _id: string; n: number }>([{ $match: { userId: auth.userId, capture: { $in: recent.map(item => item.id) } } }, { $group: { _id: '$capture', n: { $sum: 1 } } }]).toArray()
      return reply(200, { captures: recent.map(item => ({ ...item, spans: counts.find(count => count._id === item.id)?.n ?? 0 })) })
    }
    if (event.httpMethod !== 'POST') return reply(405, { message: 'Use GET or POST.' })
    if ((event.body?.length ?? 0) > MAX_BYTES) return reply(413, { message: 'Too much at once.' })
    const body = JSON.parse(event.body || '{}') as { op?: string; prompts?: unknown; capture?: unknown; spans?: unknown; device?: unknown }
    if (body.op === 'start') {
      await captures.updateMany({ userId: auth.userId, stoppedAt: null }, { $set: { stoppedAt: now, stoppedBy: 'another started' } })
      const capture = { id: randomUUID().slice(0, 8), userId: auth.userId, startedAt: now, stoppedAt: null, prompts: body.prompts === true, device: typeof body.device === 'string' ? body.device.slice(0, 120) : null }
      await captures.insertOne({ ...capture })
      const { userId: _userId, ...shown } = capture
      return reply(200, { capture: shown })
    }
    const id = typeof body.capture === 'string' ? body.capture : ''
    const capture = id ? await captures.findOne({ id, userId: auth.userId }) : null
    if (!capture) return reply(404, { message: 'No such capture.' })
    if (body.op === 'stop') {
      await captures.updateOne({ id, userId: auth.userId, stoppedAt: null }, { $set: { stoppedAt: now, stoppedBy: 'phone' } })
      return reply(200, { stopped: true })
    }
    if (body.op === 'spans') {
      // Spans sent after a capture ended are still kept: they were recorded while it was on.
      const list = Array.isArray(body.spans) ? body.spans.slice(0, MAX_SPANS) : []
      const kept = list.filter((span): span is Record<string, unknown> => !!span && typeof span === 'object' && KINDS.has(String((span as Record<string, unknown>).kind))
        && typeof (span as Record<string, unknown>).start === 'number')
      if (kept.length) await spans.insertMany(kept.map(span => ({ ...span, userId: auth.userId, capture: id, side: 'phone' })))
      return reply(200, { kept: kept.length, refused: list.length - kept.length })
    }
    return reply(400, { message: 'Unknown operation.' })
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.' })
    console.error('Debug trace failed', { name: (error as Error).name, message: (error as Error).message })
    return reply(503, { message: 'Debug capture is unavailable right now.' })
  }
}

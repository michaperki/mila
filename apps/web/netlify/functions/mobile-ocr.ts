import type { Handler } from '@netlify/functions'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { getDb } from './lib/mongo'

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers, body: JSON.stringify(body) })
const positiveLimit = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

// Atomic shared counters apply across serverless instances. No camera images are stored.
let indexReady: Promise<string> | null = null
async function checkBudget(userId: string) {
  const db = await getDb()
  const counters = db.collection<{ _id: string; requests: number; createdAt: Date; expiresAt: Date }>('mobileOcrUsage')
  if (!indexReady) {
    indexReady = counters.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(error => { indexReady = null; throw error })
  }
  await indexReady
  const now = new Date()
  const windows = [
    { key: now.toISOString().slice(0, 10), limit: positiveLimit(process.env.MOBILE_OCR_DAILY_LIMIT, 200) },
    { key: now.toISOString().slice(0, 16), limit: positiveLimit(process.env.MOBILE_OCR_MINUTE_LIMIT, 15) },
  ]
  for (const window of windows) {
    const counter = await counters.findOneAndUpdate(
      { _id: `${userId}:${window.key}` },
      { $inc: { requests: 1 }, $setOnInsert: { createdAt: now, expiresAt: new Date(now.getTime() + 2 * 86400000) } },
      { upsert: true, returnDocument: 'after' },
    )
    if ((counter?.requests ?? 0) > window.limit) {
      throw Object.assign(new Error('Camera recognition limit reached. Please try again later.'), { statusCode: 429, code: 'OCR_LIMIT' })
    }
  }
}

export const handler: Handler = async (event) => {
  const requestId = randomUUID()
  if (event.httpMethod !== 'POST') return reply(405, { message: 'Use POST.' })
  try {
    const auth = verifyAuth(event)
    let payload: { image?: unknown }
    try { payload = JSON.parse(event.body || '{}') } catch { return reply(400, { message: 'Invalid image request.' }) }
    const image = payload?.image
    if (typeof image !== 'string' || !image || image.length > 2_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
      return reply(400, { message: 'Choose a smaller image and try again (maximum 1.5 MB).' })
    }
    const key = process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_API_KEY
    if (!key) return reply(503, { message: 'Camera recognition is not configured yet.', code: 'OCR_CONFIG', requestId })
    await checkBudget(auth.userId)
    const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({ requests: [{ image: { content: image }, features: [{ type: 'TEXT_DETECTION' }], imageContext: { languageHints: ['iw'] } }] }),
      signal: AbortSignal.timeout(15000),
    })
    const result = await response.json()
    const providerError = result.error || result.responses?.[0]?.error
    if (!response.ok || providerError) {
      // Log only provider classifications; images, recognized text and API keys stay out of logs.
      console.error('Mobile OCR provider failure', { requestId, status: response.status, code: providerError?.code, reason: providerError?.details?.[0]?.reason })
      return reply(503, { message: 'Camera recognition is unavailable. Please try again later.', code: 'OCR_PROVIDER', requestId })
    }
    const text = String(result.responses?.[0]?.fullTextAnnotation?.text || result.responses?.[0]?.textAnnotations?.[0]?.description || '').trim()
    if (text.length > 5000) return reply(422, { message: 'There is too much text. Move closer to a smaller passage.' })
    return reply(200, { text })
  } catch (error) {
    const failure = error as { statusCode?: number; code?: string; name?: string; message?: string }
    const status = failure.statusCode || 503
    console.error('Mobile OCR request failed', { requestId, status, code: failure.code, name: failure.name })
    return reply(status, {
      message: status === 401 ? 'Your session has expired. Please sign in again.' : status === 429 ? failure.message : 'Camera recognition could not complete. Please try again.',
      code: failure.code || 'OCR_UNAVAILABLE', requestId,
    })
  }
}

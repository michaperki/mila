import type { Handler } from '@netlify/functions'
import { verifyAuth, type AuthContext } from './lib/auth'
import { checkDailySpend, recordTranslation } from './lib/ai-usage'
import { getDb } from './lib/mongo'

interface TranslatePayload {
  sourceLang?: string
  targetLang?: string
  sentences?: string[]
  tokens?: string[][]
}

interface CacheItem<T> {
  value: T
  timestamp: number
}

interface TranslateResult {
  sentenceTranslations: string[]
  tokenGlosses?: string[][]
}

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.VITE_GOOGLE_API_KEY || ''
const CACHE_TTL = 1000 * 60 * 60 * 24 // 24 hours
const MAX_CACHE_ITEMS = 1000
const cache = new Map<string, CacheItem<TranslateResult>>()

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, Allow: 'POST' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  if (!GOOGLE_API_KEY) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'GOOGLE_API_KEY environment variable not configured' }),
    }
  }

  try {
    const payload = JSON.parse(event.body || '{}') as TranslatePayload

    const sentences = Array.isArray(payload.sentences) ? [...payload.sentences] : []
    const tokens = Array.isArray(payload.tokens) ? payload.tokens : []

    if (sentences.length === 0 && tokens.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing or invalid parameters - either sentences or tokens must be provided' }),
      }
    }

    const sentenceInputs = sentences.length > 0 ? sentences : ['dummy_sentence']
    const totalCharacters = [...sentenceInputs, ...tokens.flat()].reduce((sum, text) => sum + String(text).length, 0)

    if (totalCharacters > 5000) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Request too large. Maximum 5000 characters allowed.' }),
      }
    }

    const sourceLang = payload.sourceLang || 'he'
    const targetLang = payload.targetLang || 'en'

    const cacheKey = JSON.stringify({ sourceLang, targetLang, sentenceInputs, tokens })
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(cached.value),
      }
    }

    // Signed in, translation counts toward the daily AI limit; signed out (pasted text before an
    // account), each address gets a fixed number of requests a day.
    const auth = signedIn(event)
    if (auth) await checkDailySpend(auth)
    else await checkGuestLimit(event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown')

    // Billed per character sent; counted for the usage summary when the caller is signed in.
    let billed = 0
    const started = Date.now()
    const translate = async (segments: string[]) => {
      billed += segments.reduce((sum, segment) => sum + segment.length, 0)
      const url = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`
      const body = {
        q: segments,
        source: sourceLang,
        target: targetLang,
        format: 'text',
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Google API error (${response.status}): ${text}`)
      }

      const json = await response.json()
      return (json?.data?.translations ?? []).map((t: any) => t.translatedText)
    }

    const sentenceTranslations = await translate(sentenceInputs)
    if (sentenceTranslations.length !== sentenceInputs.length) {
      throw new Error('Unexpected response format from Google API')
    }

    let tokenGlosses: string[][] | undefined
    if (tokens.length > 0) {
      tokenGlosses = []
      for (const sentenceTokens of tokens) {
        if (!Array.isArray(sentenceTokens) || sentenceTokens.length === 0) {
          tokenGlosses.push([])
          continue
        }

        try {
          const tokenTranslations = await translate(sentenceTokens)
          tokenGlosses.push(tokenTranslations)
        } catch (error) {
          console.error('Token translation error:', error)
          tokenGlosses.push(sentenceTokens.map(() => '—'))
        }
      }
    }

    if (auth) await recordTranslation(auth.userId, billed, Date.now() - started)

    const result: TranslateResult = {
      sentenceTranslations,
      tokenGlosses,
    }

    if (cache.size >= MAX_CACHE_ITEMS) {
      const oldest = cache.keys().next().value
      cache.delete(oldest)
    }
    cache.set(cacheKey, { value: result, timestamp: Date.now() })

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result),
    }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 429) {
      const message = (error as Error).message
      return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ message, error: message }) }
    }
    console.error('Translate function error:', error)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    }
  }
}

// Translation works signed out; usage is only attributed when signed in.
function signedIn(event: Parameters<Handler>[0]): AuthContext | null {
  try { return verifyAuth(event) } catch { return null }
}

// Signed-out requests per address per UTC day (TRANSLATE_GUEST_DAILY_LIMIT, 100 unless set), in
// counters that expire on their own.
let guestIndex: Promise<string> | null = null
async function checkGuestLimit(address: string) {
  const counters = (await getDb()).collection<{ _id: string; requests: number; expiresAt: Date }>('translateGuestUsage')
  guestIndex ??= counters.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(error => { guestIndex = null; throw error })
  await guestIndex
  const now = new Date()
  const counter = await counters.findOneAndUpdate(
    { _id: `${address}:${now.toISOString().slice(0, 10)}` },
    { $inc: { requests: 1 }, $setOnInsert: { expiresAt: new Date(now.getTime() + 2 * 86400000) } },
    { upsert: true, returnDocument: 'after' },
  )
  const limit = Number(process.env.TRANSLATE_GUEST_DAILY_LIMIT) > 0 ? Number(process.env.TRANSLATE_GUEST_DAILY_LIMIT) : 100
  if ((counter?.requests ?? 0) > limit) {
    throw Object.assign(new Error('Create a free account to keep translating today.'), { statusCode: 429 })
  }
}

export { handler }

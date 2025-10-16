import type { Handler } from '@netlify/functions'

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
    const totalCharacters = sentenceInputs.reduce((sum, sentence) => sum + sentence.length, 0)

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

    const translate = async (segments: string[]) => {
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
    console.error('Translate function error:', error)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    }
  }
}

export { handler }

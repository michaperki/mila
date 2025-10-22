import type { Handler } from '@netlify/functions'

type RequestPayload = {
  sentence?: string
  tokens?: Array<{ text: string; start: number; end: number }>
}

type MorphResult = {
  token: string
  start: number
  end: number
  lemma: string
  pos?: string
  binyan?: string
  sense?: string
  confidence?: number
  morphemes?: Array<{ form: string; type: 'prefix' | 'stem' | 'suffix'; lemma?: string; gloss?: string }>
}

const HEBREW_NLP_ENDPOINT = process.env.HEBREW_NLP_ENDPOINT ?? 'https://hebrew-nlp.co.il/service/analyze'
const HEBREW_NLP_BASIC = process.env.HEBREW_NLP_BASIC

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  if (!HEBREW_NLP_BASIC) {
    return {
      statusCode: 501,
      body: JSON.stringify({ error: 'Morphology provider is not configured. Set HEBREW_NLP_BASIC.' }),
    }
  }

  let payload: RequestPayload

  try {
    payload = JSON.parse(event.body ?? '{}')
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON payload' }),
    }
  }

  if (!payload?.sentence) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing sentence' }),
    }
  }

  try {
    const response = await fetch(HEBREW_NLP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${HEBREW_NLP_BASIC}`,
      },
      body: JSON.stringify({
        sentence: payload.sentence,
        tokens: payload.tokens,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.warn('Hebrew NLP provider error', response.status, text)
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Remote morphology provider error' }),
      }
    }

    const data = (await response.json()) as { analyses?: MorphResult[] }
    return {
      statusCode: 200,
      body: JSON.stringify({ analyses: data.analyses ?? [] }),
    }
  } catch (error) {
    console.error('Hebrew NLP provider call failed', error)
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to contact morphology provider' }),
    }
  }
}

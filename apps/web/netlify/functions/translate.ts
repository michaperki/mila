import type { Handler } from '@netlify/functions'

type TranslateRequest = {
  sourceLang: string
  targetLang: string
  sentences: string[]
  tokens?: string[][]
}

type TranslateResponse = {
  sentenceTranslations: string[]
  tokenGlosses?: string[][]
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { Allow: 'POST' },
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    }
  }

  try {
    const payload = JSON.parse(event.body || '{}') as TranslateRequest

    if (!Array.isArray(payload.sentences) || payload.sentences.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing sentences' }),
      }
    }

    const sentenceTranslations = payload.sentences.map((sentence) => `${sentence} (translated)`)
    const tokenGlosses = payload.tokens?.map((sentenceTokens) =>
      sentenceTokens.map((token) => `${token} (gloss)`),
    )

    const response: TranslateResponse = {
      sentenceTranslations,
      tokenGlosses,
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    }
  } catch (error) {
    console.error('Translate function error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error' }),
    }
  }
}

export { handler }

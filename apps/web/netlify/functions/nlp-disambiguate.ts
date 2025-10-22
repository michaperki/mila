import type { Handler } from '@netlify/functions'

type TokenSpan = {
  text: string
  start: number
  end: number
}

type RequestPayload = {
  sentence?: string
  tokens?: TokenSpan[]
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
const OPENAI_API_BASE = process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  if (!OPENAI_API_KEY) {
    return {
      statusCode: 501,
      body: JSON.stringify({ error: 'LLM provider not configured. Set OPENAI_API_KEY.' }),
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

  if (!payload?.sentence || !Array.isArray(payload.tokens) || payload.tokens.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing sentence or tokens' }),
    }
  }

  const systemPrompt = `You are a Hebrew morphologist. Analyze the provided sentence and tokens.
Return ONLY valid JSON in the exact schema: [{"token":"","start":0,"end":0,"lemma":"","pos":"","binyan":"","sense_en":"","confidence":0,"morphemes":[{"form":"","type":"stem","lemma":"","gloss":""}],"alternatives":[{"lemma":"","pos":"","sense_en":"","confidence":0}]}].
Prefer not to split tokens unless the remaining stem is a known lemma or a clitic is required.
Confidence must be between 0 and 1.`

  const userContent = JSON.stringify({
    sentence: payload.sentence,
    tokens: payload.tokens,
  })

  try {
    const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('OpenAI error', response.status, text)
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'LLM provider error' }),
      }
    }

    const completion = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const raw = completion?.choices?.[0]?.message?.content ?? '[]'
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      console.error('Failed to parse LLM JSON', error, raw)
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Invalid LLM JSON response' }),
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify(parsed ?? []),
    }
  } catch (error) {
    console.error('OpenAI request failed', error)
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to contact LLM provider' }),
    }
  }
}

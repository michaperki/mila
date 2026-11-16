import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { sentenceWords } from './lib/sentence-words'

// Quick meanings for every word of one sentence, asked for as soon as the learner selects the
// sentence, so a tapped word shows its meaning at once while the full explanation
// (word-analysis) is still on its way (lib/sentence-words.ts asks and keeps them). With the
// sentence's English (`translation`), each word also says which of its words say it
// (`renders`): a Study card not yet prepared (card-words is how cards get it now).
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })

export const handler: Handler = async (event) => {
  const requestId = randomUUID()
  if (event.httpMethod !== 'POST') return reply(405, { message: 'Use POST.' })
  try {
    const auth = verifyAuth(event)
    let payload: { sentence?: unknown; words?: unknown; translation?: unknown }
    try { payload = JSON.parse(event.body || '{}') } catch { return reply(400, { message: 'Invalid request.' }) }
    const sentence = typeof payload.sentence === 'string' ? payload.sentence.trim() : ''
    const words = Array.isArray(payload.words) && payload.words.every(word => typeof word === 'string') ? payload.words as string[] : null
    const translation = typeof payload.translation === 'string' ? payload.translation.trim() : ''
    if (!sentence || sentence.length > 600 || !words?.length || words.length > 60 || translation.length > 600) return reply(400, { message: 'Choose a sentence.' })
    if (!process.env.ANTHROPIC_API_KEY) return reply(503, { message: 'Word meanings are not configured yet.', requestId })
    return reply(200, await sentenceWords({ sentence, words, translation }, auth, 'glosses'))
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    if (status === 429) return reply(429, { message: (error as Error).message, code: 'DAILY_LIMIT', requestId })
    if (status === 422) return reply(422, { message: 'No meanings for this sentence.', requestId })
    console.error('Sentence glosses failed', { requestId, name: (error as Error).name, status: error instanceof Anthropic.APIError ? error.status : undefined })
    return reply(503, { message: 'Word meanings are unavailable right now.', requestId })
  }
}

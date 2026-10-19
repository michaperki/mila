import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { checkDailySpend, recordCacheHit, recordClaude } from './lib/ai-usage'
import { cachedAnswer, rememberAnswer } from './lib/ai-cache'

// Quick meanings for every word of one sentence, asked for as soon as the learner selects the
// sentence, so a tapped word shows its meaning at once while the full explanation
// (word-analysis) is still on its way. Short answers only: one small, fast call per sentence.
const schema = {
  type: 'object', additionalProperties: false, required: ['meanings'],
  properties: {
    meanings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['n', 'meaning'],
        properties: {
          n: { type: 'integer', description: 'The word\'s number.' },
          meaning: { type: 'string', description: 'Its meaning in this sentence in 1 to 4 English words, including attached prefixes and suffixes ("and in the house", "his"). For a word that is part of an expression, its meaning within the expression.' },
        },
      },
    },
  },
} as const

const SYSTEM = 'You help an English-speaking learner read modern Hebrew. Given a sentence and its numbered words, give each word\'s meaning as used in this sentence, briefly and in plain English. The text may come from OCR; read a misrecognized word as the word that is most likely printed.'
// The cache name for this prompt and schema: bump the version when either changes.
const CACHE_KIND = 'sentence-glosses-v1'
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
const cache = new Map<string, string[]>()
let client: Anthropic | null = null

export const handler: Handler = async (event) => {
  const requestId = randomUUID()
  if (event.httpMethod !== 'POST') return reply(405, { message: 'Use POST.' })
  try {
    const auth = verifyAuth(event)
    let payload: { sentence?: unknown; words?: unknown }
    try { payload = JSON.parse(event.body || '{}') } catch { return reply(400, { message: 'Invalid request.' }) }
    const sentence = typeof payload.sentence === 'string' ? payload.sentence.trim() : ''
    const words = Array.isArray(payload.words) && payload.words.every(word => typeof word === 'string') ? payload.words as string[] : null
    if (!sentence || sentence.length > 600 || !words?.length || words.length > 60) return reply(400, { message: 'Choose a sentence.' })
    if (!process.env.ANTHROPIC_API_KEY) return reply(503, { message: 'Word meanings are not configured yet.', requestId })
    const key = `${sentence}\u0000${words.join(' ')}`
    const started = Date.now()
    const cached = cache.get(key) ?? await cachedAnswer<string[]>(CACHE_KIND, key)
    if (cached) {
      await recordCacheHit(auth.userId, 'glosses', Date.now() - started)
      return reply(200, { meanings: cached })
    }

    await checkDailySpend(auth)
    client ??= new Anthropic()
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 3000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: `Sentence: ${sentence}\nWords:\n${words.map((word, i) => `${i + 1}. ${word}`).join('\n')}` }],
    }, { timeout: 20000, maxRetries: 1 })
    await recordClaude(auth.userId, 'glosses', response, Date.now() - started)
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return reply(422, { message: 'No meanings for this sentence.', requestId })
    const text = response.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')
    const answer = (JSON.parse(text) as { meanings: { n: number; meaning: string }[] }).meanings
    // One meaning per word, in the words' order; a word the model skipped gets ''.
    const meanings = words.map((_, i) => answer.find(item => item.n === i + 1)?.meaning.trim() || '')
    if (cache.size >= 300) cache.delete(cache.keys().next().value!)
    cache.set(key, meanings)
    await rememberAnswer(CACHE_KIND, key, meanings)
    return reply(200, { meanings })
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    if (status === 429) return reply(429, { message: (error as Error).message, code: 'DAILY_LIMIT', requestId })
    console.error('Sentence glosses failed', { requestId, name: (error as Error).name, status: error instanceof Anthropic.APIError ? error.status : undefined })
    return reply(503, { message: 'Word meanings are unavailable right now.', requestId })
  }
}

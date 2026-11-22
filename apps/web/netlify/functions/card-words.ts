import type { Handler } from '@netlify/functions'
import { traced } from './lib/trace'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { getDb } from './lib/mongo'
import type { Gloss } from './lib/forms-writer'
import { bareWord, glossesWith, sentenceWords } from './lib/sentence-words'

// A Study card's word data, kept with it: for each word of its sentence, what it means there and
// which English words say it (glosses with `t`), as cards written since 2026-11-16 have it from
// the writer. For an older card, Study asks for it while building a round, before the card is
// shown (mobile lib/word-forms.ts prepareWords), so studying needs no request; and only, rarely,
// when a word of a card not yet prepared is held (`now`: the sentence shown, counted apart as
// card-words-now to see how rare that is). Once kept, it is never asked for again.
//
// POST { id, key, variant? }: every sentence of the card (its own, -1, and its new ones) still
// without it, or with `variant` only that one. Returns the sentences now with it.
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
type Sentence = { sentence?: string; translation?: string; mark?: string; glosses?: Gloss[]; at?: number }
type Card = Sentence & { key: string; variants?: Sentence[] }
export const prepared = (item: Sentence) => !!item.glosses?.some(gloss => 't' in gloss)

export const handler: Handler = traced('card-words', async (event) => {
  const requestId = randomUUID()
  if (event.httpMethod !== 'POST') return reply(405, { message: 'Use POST.' })
  try {
    const auth = verifyAuth(event)
    let payload: { id?: unknown; key?: unknown; variant?: unknown }
    try { payload = JSON.parse(event.body || '{}') } catch { return reply(400, { message: 'Invalid request.' }) }
    if (typeof payload.id !== 'string' || typeof payload.key !== 'string') return reply(400, { message: 'Missing card.' })
    const only = typeof payload.variant === 'number' ? payload.variant : undefined
    const vocab = (await getDb()).collection('vocab')
    const entry = await vocab.findOne<{ forms?: Card[] }>({ userId: auth.userId, id: payload.id }, { projection: { forms: 1 } })
    const card = entry?.forms?.find(item => item.key === payload.key)
    if (!card) return reply(404, { message: 'This card is no longer there.' })
    const sentences = [{ variant: -1, ...card }, ...(card.variants || []).map((item, variant) => ({ variant, ...item }))]
      // One sentence asked for is given as kept when it has it already (the phone's copy may be
      // older than the card); otherwise only those without it.
      .filter(item => (only === undefined ? !prepared(item) : item.variant === only) && item.sentence && item.translation)
    if (sentences.some(item => !prepared(item)) && !process.env.ANTHROPIC_API_KEY) return reply(503, { message: 'Word meanings are not configured yet.', requestId })
    const done = await Promise.all(sentences.map(async item => {
      if (prepared(item)) return { variant: item.variant, glosses: item.glosses! }
      const words = item.sentence!.split(/\s+/).filter(Boolean).map(bareWord)
      const answer = await sentenceWords({ sentence: item.sentence!, words, translation: item.translation }, auth, only === undefined ? 'card-words' : 'card-words-now')
      const glosses = glossesWith(item.sentence!, item.mark, item.glosses, answer)
      // Its own sentence, or a new one by its place and when it was written (so a sentence added
      // meanwhile can't take another's).
      const path = item.variant < 0 ? 'forms.$[card].glosses' : `forms.$[card].variants.${item.variant}.glosses`
      const filter = item.variant < 0 ? { 'card.key': card.key } : { 'card.key': card.key, [`card.variants.${item.variant}.at`]: item.at }
      await vocab.updateOne({ userId: auth.userId, id: payload.id }, { $set: { [path]: glosses } } as never, { arrayFilters: [filter] })
      return { variant: item.variant, glosses }
    }))
    return reply(200, { sentences: done })
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    if (status === 429) return reply(429, { message: (error as Error).message, code: 'DAILY_LIMIT', requestId })
    if (status === 422) return reply(422, { message: 'No meanings for this sentence.', requestId })
    console.error('Card words failed', { requestId, name: (error as Error).name, status: error instanceof Anthropic.APIError ? error.status : undefined })
    return reply(503, { message: 'Word meanings are unavailable right now.', requestId })
  }
})

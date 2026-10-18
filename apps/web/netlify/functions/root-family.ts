import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { recordCacheHit, recordClaude } from './lib/ai-usage'
import { cachedAnswer, rememberAnswer } from './lib/ai-cache'

// A root's family: the idea its letters carry and the everyday words built on it (כ־ת־ב: to
// write, to correspond, letter, writer, address …), for exploring from a saved word. The same
// for every learner, so it is cached by the root.
export type Family = {
  root: string
  idea: string
  words: { lemma: string; lemmaPlain: string; partOfSpeech: string; binyan: string; gender: string; meaning: string }[]
}

const schema = {
  type: 'object', additionalProperties: false, required: ['idea', 'words'],
  properties: {
    idea: { type: 'string', description: 'The idea the root carries, in 1 to 5 English words ("writing", "thinking, calculating"); empty if its words share none.' },
    words: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['lemma', 'lemmaPlain', 'partOfSpeech', 'binyan', 'gender', 'meaning'],
        properties: {
          lemma: { type: 'string', description: 'Dictionary form, fully vocalized: verbs as the infinitive with ל, adjectives masculine singular, nouns singular.' },
          lemmaPlain: { type: 'string', description: 'The same lemma without niqqud, in standard full spelling (כתיב מלא) as an Israeli newspaper prints it.' },
          partOfSpeech: { type: 'string', description: 'noun, verb, adjective, adverb, or phrase.' },
          binyan: { type: 'string', description: 'Verbs only: binyan in Latin letters (pa\'al, nif\'al, pi\'el, pu\'al, hif\'il, huf\'al, hitpa\'el); otherwise empty.' },
          gender: { type: 'string', description: 'Nouns only: "masculine" or "feminine"; otherwise empty.' },
          meaning: { type: 'string', description: 'Its common English senses, comma-separated, most common first; at most three. Verbs as "to …".' },
        },
      },
    },
  },
} as const

const SYSTEM = `You show an English-speaking learner of modern Hebrew the family of words built on one root. List the words of that root a learner meets in everyday modern Hebrew (conversation, news, signs, books), most common first: its verbs in each binyan that is in real use, then the nouns and adjectives built on it. Give at most 14, only real words in current use, each once, and never a word from a different root that merely looks similar. A root with several unrelated families (homonymous roots) gets the words of the family the learner's word belongs to. Grammar claims must be ones you are certain of; leave a field empty rather than guess.`

// The cache name for this prompt and schema: bump the version when either changes.
const CACHE_KIND = 'root-family-v1'
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
// The root's letters, without vowels or separators, joined with ־: כ־ת־ב.
const HEBREW_LETTER = /[א-ת]/g
export const rootOf = (value: string) => (value.match(HEBREW_LETTER) || []).join('־')
let client: Anthropic | null = null

export const handler: Handler = async (event) => {
  const requestId = randomUUID()
  if (event.httpMethod !== 'POST') return reply(405, { message: 'Use POST.' })
  try {
    const auth = verifyAuth(event)
    let payload: { root?: unknown; word?: unknown }
    try { payload = JSON.parse(event.body || '{}') } catch { return reply(400, { message: 'Invalid request.' }) }
    const root = typeof payload.root === 'string' ? rootOf(payload.root) : ''
    const letters = root.split('־').length
    if (!root || letters < 2 || letters > 5) return reply(400, { message: 'This word has no root to explore.' })
    // The learner's word only picks the family when a root has several; the answer is cached by the root.
    const word = typeof payload.word === 'string' ? payload.word.trim().slice(0, 60) : ''
    if (!process.env.ANTHROPIC_API_KEY) return reply(503, { message: 'Root families are not configured yet.', requestId })

    const started = Date.now()
    const cached = await cachedAnswer<Family>(CACHE_KIND, root)
    if (cached) {
      await recordCacheHit(auth.userId, 'root', Date.now() - started)
      return reply(200, cached)
    }

    client ??= new Anthropic()
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Root: ${root}${word ? `\nThe learner's word: ${word}` : ''}` }],
    }, { timeout: 30000, maxRetries: 1 })
    await recordClaude(auth.userId, 'root', response, Date.now() - started)
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return reply(422, { message: 'This root could not be explored.', requestId })
    const generated = JSON.parse(response.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')) as Omit<Family, 'root'>
    const family: Family = {
      root, idea: generated.idea.trim(),
      words: generated.words.filter(item => item.lemma.trim() && item.meaning.trim()).slice(0, 14)
        .map(item => ({ ...item, lemma: item.lemma.trim(), lemmaPlain: item.lemmaPlain.trim(), meaning: item.meaning.trim() })),
    }
    if (!family.words.length) return reply(422, { message: 'This root could not be explored.', requestId })
    await rememberAnswer(CACHE_KIND, root, family)
    return reply(200, family)
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    console.error('Root family failed', { requestId, name: (error as Error).name, status: error instanceof Anthropic.APIError ? error.status : undefined })
    return reply(503, { message: 'Root families are unavailable right now.', requestId })
  }
}

import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'

// Explains one tapped Hebrew word *in its sentence*: contextual meaning, prefix/suffix
// breakdown, lemma, root, binyan. Word-by-word machine translation can't do this
// (בחשבון in "מבחן בחשבון" is "in math", not "in the calculator").
export type WordAnalysis = {
  word: string
  vocalized: string
  meaning: string
  parts: { text: string; meaning: string }[]
  lemma: string
  lemmaMeaning: string
  root: string
  partOfSpeech: string
  binyan: string
  form: string
  note: string
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['word', 'vocalized', 'meaning', 'parts', 'lemma', 'lemmaMeaning', 'root', 'partOfSpeech', 'binyan', 'form', 'note'],
  properties: {
    word: { type: 'string', description: 'The word exactly as given.' },
    vocalized: { type: 'string', description: 'The word with full niqqud as read in this sentence.' },
    meaning: { type: 'string', description: 'Short English meaning of this word in this sentence, including prefixes (e.g. "in math").' },
    parts: {
      type: 'array',
      description: 'Morphological pieces in reading order: attached prefixes (ו, ה, ב, כ, ל, מ, ש), the stem, any pronoun suffix. One item if the word has no affixes.',
      items: { type: 'object', additionalProperties: false, required: ['text', 'meaning'], properties: { text: { type: 'string' }, meaning: { type: 'string' } } },
    },
    lemma: { type: 'string', description: 'Dictionary form, vocalized (masculine singular; verbs as the infinitive or 3rd person past).' },
    lemmaMeaning: { type: 'string', description: 'General English senses of the lemma, comma-separated.' },
    root: { type: 'string', description: 'Root letters joined with ־ (e.g. ח־ש־ב), or empty if none applies.' },
    partOfSpeech: { type: 'string', description: 'noun, verb, adjective, adverb, preposition, pronoun, number, name, or phrase.' },
    binyan: { type: 'string', description: 'Verbs only: binyan in Latin letters (pa\'al, nif\'al, pi\'el, pu\'al, hif\'il, huf\'al, hitpa\'el); otherwise empty.' },
    form: { type: 'string', description: 'Concise grammatical form, e.g. "past, 1st person singular" or "masculine singular, construct"; empty if trivial.' },
    note: { type: 'string', description: 'One short sentence a learner would find useful, or empty.' },
  },
} as const

const SYSTEM = `You are a Hebrew tutor inside a reading app for English-speaking learners. The learner tapped one word in a sentence they photographed. Analyze that word as it is used in that sentence. Text comes from OCR and may have small recognition errors or missing niqqud; read it the way a fluent reader would. Keep every English field short. If the tapped text is not Hebrew, return it unchanged with your best short meaning and empty grammar fields.`

const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
const cache = new Map<string, WordAnalysis>()
let client: Anthropic | null = null

export const handler: Handler = async (event) => {
  const requestId = randomUUID()
  if (event.httpMethod !== 'POST') return reply(405, { message: 'Use POST.' })
  try {
    verifyAuth(event)
    let payload: { word?: unknown; sentence?: unknown }
    try { payload = JSON.parse(event.body || '{}') } catch { return reply(400, { message: 'Invalid word request.' }) }
    const word = typeof payload.word === 'string' ? payload.word.trim() : ''
    const sentence = typeof payload.sentence === 'string' ? payload.sentence.trim() : ''
    if (!word || word.length > 40 || sentence.length > 600) return reply(400, { message: 'Choose a single word to explain.' })
    if (!process.env.ANTHROPIC_API_KEY) return reply(503, { message: 'Word explanations are not configured yet.', code: 'ANALYSIS_CONFIG', requestId })

    const key = `${word}\u0000${sentence}`
    const cached = cache.get(key)
    if (cached) return reply(200, cached)

    client ??= new Anthropic()
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      // A tap should feel instant; this is a short, well-specified lookup.
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: `Sentence: ${sentence || word}\nTapped word: ${word}` }],
    }, { timeout: 15000, maxRetries: 1 })

    if (response.stop_reason === 'refusal') return reply(422, { message: 'This word could not be explained.', code: 'ANALYSIS_REFUSED', requestId })
    const text = response.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')
    const analysis = JSON.parse(text) as WordAnalysis
    if (cache.size >= 500) cache.delete(cache.keys().next().value!)
    cache.set(key, analysis)
    return reply(200, analysis)
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    // Log the classification only; the learner's text stays out of logs.
    console.error('Word analysis failed', { requestId, name: (error as Error).name, status: error instanceof Anthropic.APIError ? error.status : undefined })
    return reply(503, { message: 'Word explanation is unavailable right now.', code: 'ANALYSIS_UNAVAILABLE', requestId })
  }
}

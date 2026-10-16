import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { getDb } from './lib/mongo'
import { recordClaude } from './lib/ai-usage'

// Writes one stage of a saved word's forms (e.g. the past tense of לִפְתֹּחַ), each with its own
// short example sentence, and adds them to the vocab entry as practice cards. Stages are
// generated when they unlock, so a word only costs what the learner actually reaches.
// The stage/slot lists mirror apps/mobile/src/lib/forms.ts.
type Slot = { slot: string; means: string }
const VERB: Record<string, Slot[]> = {
  infinitive: [{ slot: 'inf', means: 'infinitive with ל' }],
  present: [
    { slot: 'm.sg', means: 'masculine singular' }, { slot: 'f.sg', means: 'feminine singular' },
    { slot: 'm.pl', means: 'masculine plural' }, { slot: 'f.pl', means: 'feminine plural' },
  ],
  past: [
    { slot: '1sg', means: 'I' }, { slot: '2sg.m', means: 'you (masculine singular)' }, { slot: '2sg.f', means: 'you (feminine singular)' },
    { slot: '3sg.m', means: 'he' }, { slot: '3sg.f', means: 'she' }, { slot: '1pl', means: 'we' },
    { slot: '2pl.m', means: 'you (masculine plural)' }, { slot: '2pl.f', means: 'you (feminine plural)' }, { slot: '3pl', means: 'they' },
  ],
  future: [
    { slot: '1sg', means: 'I' }, { slot: '2sg.m', means: 'you (masculine singular)' }, { slot: '2sg.f', means: 'you (feminine singular)' },
    { slot: '3sg.m', means: 'he' }, { slot: '3sg.f', means: 'she' }, { slot: '1pl', means: 'we' },
    { slot: '2pl', means: 'you (plural, the everyday form)' }, { slot: '3pl', means: 'they (the everyday form)' },
  ],
  imperative: [
    { slot: 'm.sg', means: 'to one man' }, { slot: 'f.sg', means: 'to one woman' }, { slot: 'pl', means: 'to several people' },
  ],
  noun: [{ slot: 'noun', means: 'the verbal noun (שם פעולה) of this verb' }],
}
const STAGES: Record<string, Record<string, Slot[]>> = {
  verb: VERB,
  adjective: {
    base: [{ slot: 'm.sg', means: 'masculine singular' }],
    inflected: [{ slot: 'f.sg', means: 'feminine singular' }, { slot: 'm.pl', means: 'masculine plural' }, { slot: 'f.pl', means: 'feminine plural' }],
  },
  noun: {
    singular: [{ slot: 'sg', means: 'singular' }],
    plural: [{ slot: 'pl', means: 'plural' }],
  },
  other: { base: [{ slot: 'base', means: 'the word or expression itself' }] },
}
export const kindOf = (partOfSpeech?: string) =>
  partOfSpeech === 'verb' || partOfSpeech === 'adjective' || partOfSpeech === 'noun' ? partOfSpeech : 'other'

const schema = {
  type: 'object', additionalProperties: false, required: ['forms'],
  properties: {
    forms: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['slot', 'form', 'english', 'sentence', 'inSentence', 'translation'],
        properties: {
          slot: { type: 'string' },
          form: { type: 'string', description: 'The form, fully vocalized.' },
          english: { type: 'string', description: 'Short English for this form alone, e.g. "they opened", "to open", "open! (to one woman)", "beautiful (f. pl.)".' },
          sentence: { type: 'string', description: 'A short, natural, everyday Hebrew sentence (5 to 12 words, no niqqud) that uses exactly this form.' },
          inSentence: { type: 'string', description: 'The form exactly as written in the sentence, with any attached prefix (e.g. ושפתחנו).' },
          translation: { type: 'string', description: 'Natural English translation of the sentence.' },
        },
      },
    },
  },
} as const

const SYSTEM = `You write practice material for an English-speaking learner of modern Hebrew who is learning one word form by form. For each requested form, give the correct modern Hebrew form and one example sentence that uses exactly that form.

Sentences must differ from each other and from the sentences already used for this word: vary who acts, the setting, the objects and the sentence shape, so no two read as the same sentence with the person changed. Keep the rest of each sentence simple, common vocabulary, so the target form is the only hard part. Use the word in its common meaning; do not force a rare sense.

Forms must be correct standard modern Hebrew. Leave out a form that is not in real use (for example a verbal noun the verb doesn't have) rather than inventing one. If the learner met the word in a sentence and that sentence uses one of the requested forms, use the learner's sentence for that form, copied exactly.`

const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
let client: Anthropic | null = null

type Generated = { slot: string; form: string; english: string; sentence: string; inSentence: string; translation: string }
type Entry = { lemma: string; gloss: string; partOfSpeech?: string; binyan?: string; forms?: { stage: string; sentence: string }[]; encounters?: { surface: string; context: string }[] }

export const handler: Handler = async (event) => {
  const requestId = randomUUID()
  if (event.httpMethod !== 'POST') return reply(405, { message: 'Use POST.' })
  try {
    const auth = verifyAuth(event)
    let payload: { id?: unknown; stage?: unknown }
    try { payload = JSON.parse(event.body || '{}') } catch { return reply(400, { message: 'Invalid request.' }) }
    if (typeof payload.id !== 'string' || typeof payload.stage !== 'string') return reply(400, { message: 'Missing word or stage.' })
    const { id, stage } = payload as { id: string; stage: string }
    const vocab = (await getDb()).collection('vocab')
    const entry = await vocab.findOne<Entry>({ userId: auth.userId, id })
    if (!entry) return reply(404, { message: 'This word is no longer saved.' })
    const slots = STAGES[kindOf(entry.partOfSpeech)][stage]
    if (!slots) return reply(400, { message: 'Unknown stage for this word.' })
    const existing = (entry.forms || []).filter(form => form.stage === stage)
    if (existing.length) return reply(200, { forms: existing })
    if (!process.env.ANTHROPIC_API_KEY) return reply(503, { message: 'Word practice is not configured yet.', requestId })

    const used = (entry.forms || []).map(form => form.sentence).slice(-30)
    const met = (entry.encounters || []).slice(-5).map(item => `${item.surface} in: ${item.context}`)
    const prompt = [
      `Word: ${entry.lemma} (${entry.partOfSpeech || 'word'}${entry.binyan ? `, ${entry.binyan}` : ''}) — ${entry.gloss}`,
      `Forms to write (${stage}):`, ...slots.map(item => `- slot "${item.slot}": ${item.means}`),
      ...(used.length ? ['Sentences already used for this word (do not repeat or imitate):', ...used.map(item => `- ${item}`)] : []),
      ...(met.length ? ['Where the learner met this word:', ...met.map(item => `- ${item}`)] : []),
    ].join('\n')

    client ??= new Anthropic()
    const started = Date.now()
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }, { timeout: 40000, maxRetries: 1 })
    await recordClaude(auth.userId, 'forms', response, Date.now() - started)
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return reply(422, { message: 'These forms could not be written.', requestId })
    const text = response.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')
    const generated = (JSON.parse(text) as { forms: Generated[] }).forms
    const order = slots.map(item => item.slot)
    const forms = order.flatMap(slot => {
      const item = generated.find(candidate => candidate.slot === slot && candidate.form.trim() && candidate.sentence.trim())
      return item ? [{
        key: `${stage}:${slot}`, stage, slot, he: item.form.trim(), en: item.english.trim(),
        sentence: item.sentence.trim(), mark: item.inSentence.trim(), translation: item.translation.trim(),
      }] : []
    })
    if (!forms.length) return reply(422, { message: 'These forms could not be written.', requestId })
    // Two requests for the same stage (a double tap, two screens) must not add it twice.
    await vocab.updateOne({ userId: auth.userId, id, 'forms.stage': { $ne: stage } }, { $push: { forms: { $each: forms } }, $set: { updatedAt: Date.now() } } as never)
    const saved = await vocab.findOne<Entry>({ userId: auth.userId, id })
    return reply(200, { forms: (saved?.forms || forms).filter(form => form.stage === stage) })
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    console.error('Word forms failed', { requestId, name: (error as Error).name, status: error instanceof Anthropic.APIError ? error.status : undefined })
    return reply(503, { message: 'Word practice is unavailable right now.', requestId })
  }
}

import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { recordCacheHit, recordClaude } from './lib/ai-usage'
import { cachedAnswer, rememberAnswer } from './lib/ai-cache'

// A word's whole table of forms to look at: a verb's infinitive, present, past, future,
// imperative and verbal noun, an adjective's four forms, a noun's singular, plural and construct
// forms. Unlike practice cards (word-forms.ts) there are no sentences, so the table is one cheap
// request, and it is the same for every learner, so it is cached by the word and the meaning it
// is written in. The groups and their labels are defined here and sent with the table.
type Row = { slot: string; label: string; means: string }
type Group = { key: string; label: string; rows: Row[] }
const persons = (plural: Row[]): Row[] => [
  { slot: '1sg', label: 'I', means: 'I' },
  { slot: '2sg.m', label: 'you (m.)', means: 'you, masculine singular' },
  { slot: '2sg.f', label: 'you (f.)', means: 'you, feminine singular' },
  { slot: '3sg.m', label: 'he', means: 'he' },
  { slot: '3sg.f', label: 'she', means: 'she' },
  { slot: '1pl', label: 'we', means: 'we' },
  ...plural,
]
const TABLES: Record<string, Group[]> = {
  verb: [
    { key: 'infinitive', label: 'Infinitive', rows: [{ slot: 'inf', label: 'to …', means: 'the infinitive' }] },
    { key: 'present', label: 'Present', rows: [
      { slot: 'm.sg', label: 'm. singular', means: 'masculine singular' }, { slot: 'f.sg', label: 'f. singular', means: 'feminine singular' },
      { slot: 'm.pl', label: 'm. plural', means: 'masculine plural' }, { slot: 'f.pl', label: 'f. plural', means: 'feminine plural' },
    ] },
    { key: 'past', label: 'Past', rows: persons([
      { slot: '2pl.m', label: 'you (pl. m.)', means: 'you, masculine plural' }, { slot: '2pl.f', label: 'you (pl. f.)', means: 'you, feminine plural' },
      { slot: '3pl', label: 'they', means: 'they' },
    ]) },
    { key: 'future', label: 'Future', rows: persons([
      { slot: '2pl', label: 'you (pl.)', means: 'you, plural (the everyday form)' }, { slot: '3pl', label: 'they', means: 'they (the everyday form)' },
    ]) },
    { key: 'imperative', label: 'Imperative', rows: [
      { slot: 'm.sg', label: 'to a man', means: 'to one man' }, { slot: 'f.sg', label: 'to a woman', means: 'to one woman' },
      { slot: 'pl', label: 'to several', means: 'to several people' },
    ] },
    { key: 'noun', label: 'Verbal noun', rows: [{ slot: 'noun', label: 'verbal noun', means: 'the verbal noun (שם פעולה)' }] },
  ],
  adjective: [
    { key: 'forms', label: 'Forms', rows: [
      { slot: 'm.sg', label: 'm. singular', means: 'masculine singular' }, { slot: 'f.sg', label: 'f. singular', means: 'feminine singular' },
      { slot: 'm.pl', label: 'm. plural', means: 'masculine plural' }, { slot: 'f.pl', label: 'f. plural', means: 'feminine plural' },
    ] },
  ],
  noun: [
    { key: 'number', label: 'Singular and plural', rows: [
      { slot: 'sg', label: 'singular', means: 'singular' }, { slot: 'pl', label: 'plural', means: 'plural' },
    ] },
    { key: 'construct', label: 'Construct (סמיכות)', rows: [
      { slot: 'sg', label: 'singular', means: 'construct state singular, as in "the X of …"' },
      { slot: 'pl', label: 'plural', means: 'construct state plural' },
    ] },
    { key: 'mine', label: 'With "my"', rows: [
      { slot: 'sg', label: 'my (one)', means: 'with the 1st person singular possessive suffix, singular (my X)' },
      { slot: 'pl', label: 'my (several)', means: 'with the 1st person singular possessive suffix, plural (my Xs)' },
    ] },
  ],
}
export const kindOf = (partOfSpeech?: string) => (partOfSpeech === 'verb' || partOfSpeech === 'adjective' || partOfSpeech === 'noun' ? partOfSpeech : '')

const schema = {
  type: 'object', additionalProperties: false, required: ['forms'],
  properties: {
    forms: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['group', 'slot', 'form', 'english'],
        properties: {
          group: { type: 'string' },
          slot: { type: 'string' },
          form: { type: 'string', description: 'The form, fully vocalized; empty if this form is not in real use.' },
          english: { type: 'string', description: 'Short English for this form alone, e.g. "they opened", "to open", "open! (to one woman)", "beautiful (f. pl.)", "my books".' },
        },
      },
    },
  },
} as const

const SYSTEM = `You write the table of forms of one modern Hebrew word for an English-speaking learner to look up. Give the correct standard modern Hebrew form for each requested slot, fully vocalized as an Israeli dictionary or grammar book prints it. A form that is not in real use (an imperative or verbal noun a verb doesn't have, a plural a noun doesn't have) is left empty rather than invented. The forms are one word, not different meanings: every form's "english" uses the main meaning you are given, changing only for person, tense, number and gender ("he guesses", "they guessed", "guess! (to one woman)"), never to a synonym.`

// The cache name for this prompt and schema: bump the version when either changes.
const CACHE_KIND = 'word-table-v1'
export type Table = { groups: { key: string; label: string; rows: { slot: string; label: string; he: string; en: string }[] }[] }
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
let client: Anthropic | null = null

export const handler: Handler = async (event) => {
  const requestId = randomUUID()
  if (event.httpMethod !== 'POST') return reply(405, { message: 'Use POST.' })
  try {
    const auth = verifyAuth(event)
    let payload: Record<string, unknown>
    try { payload = JSON.parse(event.body || '{}') } catch { return reply(400, { message: 'Invalid request.' }) }
    const lemma = text(payload.lemma, 60)
    const kind = kindOf(text(payload.partOfSpeech, 20))
    const binyan = text(payload.binyan, 20)
    const meaning = text(payload.meaning, 120)
    if (!lemma || !kind) return reply(400, { message: 'This word has no table of forms.' })
    if (!process.env.ANTHROPIC_API_KEY) return reply(503, { message: 'Tables of forms are not configured yet.', requestId })

    const key = [lemma, kind, binyan, meaning].join('\u0000')
    const started = Date.now()
    const cached = await cachedAnswer<Table>(CACHE_KIND, key)
    if (cached) {
      await recordCacheHit(auth.userId, 'table', Date.now() - started)
      return reply(200, cached)
    }

    const groups = TABLES[kind]
    const prompt = [
      `Word: ${lemma} (${kind}${binyan ? `, ${binyan}` : ''})`,
      ...(meaning ? [`Main meaning, the same for every form: ${meaning}`] : []),
      'Forms to write:',
      ...groups.flatMap(group => group.rows.map(row => `- group "${group.key}", slot "${row.slot}": ${group.label}, ${row.means}`)),
    ].join('\n')
    client ??= new Anthropic()
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 6000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    }, { timeout: 40000, maxRetries: 1 })
    await recordClaude(auth.userId, 'table', response, Date.now() - started)
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return reply(422, { message: 'This table could not be written.', requestId })
    const generated = (JSON.parse(response.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')) as { forms: { group: string; slot: string; form: string; english: string }[] }).forms
    // In the table's own order; a form left empty (not in use) is left out, and so is a group with none.
    const table: Table = {
      groups: groups.flatMap(group => {
        const rows = group.rows.flatMap(row => {
          const item = generated.find(candidate => candidate.group === group.key && candidate.slot === row.slot && candidate.form.trim())
          return item ? [{ slot: row.slot, label: row.label, he: item.form.trim(), en: item.english.trim() }] : []
        })
        return rows.length ? [{ key: group.key, label: group.label, rows }] : []
      }),
    }
    if (!table.groups.length) return reply(422, { message: 'This table could not be written.', requestId })
    await rememberAnswer(CACHE_KIND, key, table)
    return reply(200, table)
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    console.error('Word table failed', { requestId, name: (error as Error).name, status: error instanceof Anthropic.APIError ? error.status : undefined })
    return reply(503, { message: 'Tables of forms are unavailable right now.', requestId })
  }
}

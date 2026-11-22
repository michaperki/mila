import type { Handler } from '@netlify/functions'
import { traced } from './lib/trace'
import { tracedModel } from './lib/trace-ai'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { getDb } from './lib/mongo'
import { checkDailySpend, recordClaude } from './lib/ai-usage'
import { type Ask, type Entry, slotsOf, Unwritable, type Variant, writeForms, type WrittenForm } from './lib/forms-writer'
import { checkCues } from './lib/forms-review'
import { isPersonal, learnerProfile, PERSONAL_WRITER, type Profile, type ProfileEntry, profileBlock, supportOfCard } from './lib/profile'
import type { LearnerEvent } from './lib/learner'

// Writes one stage of a saved word's practice cards and adds them to the vocab entry
// (lib/forms-writer.ts writes them), then has their cues checked on their own (lib/forms-review.ts
// checkCues: who each person is where the English doesn't say, the sentences left as they are),
// which scripts/eval-forms.mjs found to catch most cues the writer missed for a quarter of what
// writing costs; if the check fails, the cards are kept as written. Stages are written when they open (by progress or because
// the learner chose them), so a word only costs what the learner reaches.
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
let client: Anthropic | null = null

// Which writer writes a word's cards. Half the words (chosen by the word, so all of a word's
// stages come from one writer) are written for the learner: told what their practice and reading
// show (lib/profile.ts), with room for one new word a card; the rest as before, so the two can be
// compared (scripts/personalize.mjs outcomes). Every card says which wrote it and what its other
// words were to the learner then. PERSONALIZED_CARDS=off writes every word as before, =all every
// word for the learner. If the profile can't be read or the cards can't be written for the
// learner, they are written as before.
// `fresh: true` asks for new sentences for a stage already written: written for the learner, each
// the same form and meaning as its card, and kept on the card as a variant beside its sentence
// (WrittenForm.variants), so its results and its first sentence stay. For the cards `keys` (those
// Study found would be helped by one, mobile lib/forms.ts wantsSentence), else all the stage's;
// `why` is kept with each. A card has at most MAX_VARIANTS, one written at most every REST, and a
// learner's day at most VARIATION_CALLS requests for them (about $0.25), whatever asks.
const STRETCH = true
const MAX_VARIANTS = 3
const REST = 20 * 3_600_000
const VARIATION_CALLS = 16
const DAY = 86_400_000
async function profileOf(db: Awaited<ReturnType<typeof getDb>>, userId: string): Promise<Profile> {
  const [entries, events] = await Promise.all([
    db.collection('vocab').find({ userId }).project<ProfileEntry>({
      _id: 0, id: 1, lemma: 1, lemmaPlain: 1, gloss: 1, partOfSpeech: 1, createdAt: 1, known: 1, results: 1, primed: 1, last: 1, checkpoints: 1,
      'encounters.surface': 1, 'encounters.at': 1, 'forms.key': 1, 'forms.stage': 1, 'forms.slot': 1, 'forms.he': 1, 'forms.results': 1, 'forms.primed': 1, 'forms.last': 1,
    }).toArray(),
    db.collection('studyEvents').find({ userId, at: { $gt: Date.now() - 90 * DAY }, type: { $in: ['answer', 'lookup', 'explained'] } }).project<LearnerEvent>({ _id: 0, userId: 0 }).toArray(),
  ])
  return learnerProfile(entries, events)
}

export const handler: Handler = traced('word-forms', async (event) => {
  const requestId = randomUUID()
  if (event.httpMethod !== 'POST') return reply(405, { message: 'Use POST.' })
  try {
    const auth = verifyAuth(event)
    let payload: { id?: unknown; stage?: unknown; fresh?: unknown; keys?: unknown; why?: unknown }
    try { payload = JSON.parse(event.body || '{}') } catch { return reply(400, { message: 'Invalid request.' }) }
    if (typeof payload.id !== 'string' || typeof payload.stage !== 'string') return reply(400, { message: 'Missing word or stage.' })
    const { id, stage } = payload as { id: string; stage: string }
    const fresh = payload.fresh === true
    const db = await getDb()
    const vocab = db.collection('vocab')
    const entry = await vocab.findOne<Entry>({ userId: auth.userId, id })
    if (!entry) return reply(404, { message: 'This word is no longer saved.' })
    const slots = slotsOf(entry, stage)
    if (!slots) return reply(400, { message: 'Unknown stage for this word.' })
    const existing = (entry.forms || []).filter(form => form.stage === stage) as unknown as WrittenForm[]
    const keys = Array.isArray(payload.keys) ? payload.keys.filter((key): key is string => typeof key === 'string') : null
    const why = typeof payload.why === 'string' ? payload.why.slice(0, 40) : undefined
    const now = Date.now()
    const wanting = existing.filter(form => (!keys || keys.includes(form.key)) && (form.variants?.length ?? 0) < MAX_VARIANTS
      && !(form.variants || []).some(item => now - item.at < REST))
    if (fresh ? !existing.length || !wanting.length : existing.length) return reply(200, { forms: existing })
    if (fresh) {
      const day = new Date(now); day.setUTCHours(0, 0, 0, 0)
      const calls = await db.collection('aiUsage').countDocuments({ userId: auth.userId, feature: 'variation', at: { $gte: day } })
      if (calls >= VARIATION_CALLS) return reply(200, { forms: existing, rested: true })
    }
    if (!process.env.ANTHROPIC_API_KEY) return reply(503, { message: 'Word practice is not configured yet.', requestId })

    await checkDailySpend(auth)
    client ??= new Anthropic()
    const ask: Ask = async ({ system, prompt, schema }) => {
      const started = Date.now()
      const params = {
        model: 'claude-opus-5-5',
        max_tokens: 8000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt }],
      }
      // What goes in: the word (dictionary form, meanings, part of speech, constructions), the stage's
      // forms to write and, for the personal writer, what the learner knows (lib/profile.ts).
      const response = await tracedModel(fresh ? 'variation' : 'forms', fresh ? 'new sentences for a word being learned' : 'cards for a stage of a word about to be studied',
        ['word and its meanings', 'forms to write', ...(prompt.includes('About this learner') ? ['learner profile: words known and looked up'] : [])], params,
        () => client!.beta.messages.create(params as never, { timeout: 40000, maxRetries: 1 }) as Promise<Anthropic.Beta.Messages.BetaMessage>)
      await recordClaude(auth.userId, fresh ? 'variation' : 'forms', response, Date.now() - started)
      return response
    }
    const profile = process.env.PERSONALIZED_CARDS === 'off' ? null : await profileOf(db, auth.userId).catch(() => null)
    if (fresh) {
      if (!profile) return reply(503, { message: 'New sentences are unavailable right now.', requestId })
      const again = wanting.map(form => ({ slot: form.slot, he: form.he, en: form.en }))
      const written = await writeForms(entry, stage, ask, profileBlock(profile, entry, stage, { stretch: STRETCH }), again)
      const checked = await checkCues(entry, stage, written, ask).then(result => result.forms, () => written)
      const at = Date.now()
      for (const form of checked) {
        const variant: Variant = {
          he: form.he, en: form.en, sentence: form.sentence, mark: form.mark, said: form.said, translation: form.translation, enMark: form.enMark,
          cue: form.cue, cueAfter: form.cueAfter, cues: form.cues, usage: form.usage, glosses: form.glosses, ...(form.distractors ? { distractors: form.distractors, ...(form.distractorsFor ? { distractorsFor: form.distractorsFor } : {}) } : {}),
          writer: PERSONAL_WRITER, support: supportOfCard(form.glosses, profile, form.sentence), at, ...(why ? { why } : {}),
        }
        // Never past the limit, even with two requests at once.
        await vocab.updateOne({ userId: auth.userId, id }, { $push: { 'forms.$[card].variants': variant }, $set: { updatedAt: at } } as never,
          { arrayFilters: [{ 'card.key': form.key, [`card.variants.${MAX_VARIANTS - 1}`]: { $exists: false } }] })
      }
      const saved = await vocab.findOne<Entry>({ userId: auth.userId, id })
      return reply(200, { forms: (saved?.forms || existing).filter(form => form.stage === stage) })
    }
    const personal = !!profile && isPersonal(id)
    const forLearner = personal
      ? await writeForms(entry, stage, ask, profileBlock(profile!, entry, stage, { stretch: STRETCH })).catch(error => {
        if (error instanceof Unwritable || error instanceof SyntaxError) return null
        throw error
      })
      : null
    const writer = forLearner ? PERSONAL_WRITER : 'base'
    const written = forLearner ?? await writeForms(entry, stage, ask)
    const tag = (form: WrittenForm): WrittenForm => ({ ...form, writer, ...(profile ? { support: supportOfCard(form.glosses, profile, form.sentence) } : {}) })
    const forms = (await checkCues(entry, stage, written, ask).then(checked => checked.forms, () => written)).map(tag)
    // Two requests for the same stage (a double tap, two screens) must not add it twice.
    await vocab.updateOne({ userId: auth.userId, id, 'forms.stage': { $ne: stage } }, { $push: { forms: { $each: forms } }, $set: { updatedAt: Date.now() } } as never)
    const saved = await vocab.findOne<Entry>({ userId: auth.userId, id })
    return reply(200, { forms: (saved?.forms || forms).filter(form => form.stage === stage) })
  } catch (error) {
    if (error instanceof Unwritable || error instanceof SyntaxError) return reply(422, { message: 'These forms could not be written.', requestId })
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    if (status === 429) return reply(429, { message: (error as Error).message, code: 'DAILY_LIMIT', requestId })
    console.error('Word forms failed', { requestId, name: (error as Error).name, status: error instanceof Anthropic.APIError ? error.status : undefined })
    return reply(503, { message: 'Word practice is unavailable right now.', requestId })
  }
})

import type { Handler } from '@netlify/functions'
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
// (WrittenForm.variants), so its results and its first sentence stay. Once per card: a card that
// has one isn't written again.
const STRETCH = true
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

export const handler: Handler = async (event) => {
  const requestId = randomUUID()
  if (event.httpMethod !== 'POST') return reply(405, { message: 'Use POST.' })
  try {
    const auth = verifyAuth(event)
    let payload: { id?: unknown; stage?: unknown; fresh?: unknown }
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
    // New sentences are asked for once a card has none from the writer told about the learner.
    const wanting = existing.filter(form => !form.variants?.some(item => item.writer === PERSONAL_WRITER))
    if (fresh ? !existing.length || !wanting.length : existing.length) return reply(200, { forms: existing })
    if (!process.env.ANTHROPIC_API_KEY) return reply(503, { message: 'Word practice is not configured yet.', requestId })

    await checkDailySpend(auth)
    client ??= new Anthropic()
    const ask: Ask = async ({ system, prompt, schema }) => {
      const started = Date.now()
      const response = await client!.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 8000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt }],
      } as never, { timeout: 40000, maxRetries: 1 })
      await recordClaude(auth.userId, 'forms', response, Date.now() - started)
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
          cue: form.cue, cueAfter: form.cueAfter, cues: form.cues, usage: form.usage, glosses: form.glosses, ...(form.distractors ? { distractors: form.distractors } : {}),
          writer: PERSONAL_WRITER, support: supportOfCard(form.glosses, profile, form.sentence), at,
        }
        await vocab.updateOne({ userId: auth.userId, id }, { $push: { 'forms.$[card].variants': variant }, $set: { updatedAt: at } } as never,
          { arrayFilters: [{ 'card.key': form.key, 'card.variants.writer': { $ne: PERSONAL_WRITER } }] })
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
}

import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { getDb } from './lib/mongo'
import { checkDailySpend, recordClaude } from './lib/ai-usage'
import { type Ask, type Entry, slotsOf, Unwritable, writeForms } from './lib/forms-writer'
import { checkCues } from './lib/forms-review'

// Writes one stage of a saved word's practice cards and adds them to the vocab entry
// (lib/forms-writer.ts writes them), then has their cues checked on their own (lib/forms-review.ts
// checkCues: who each person is where the English doesn't say, the sentences left as they are),
// which scripts/eval-forms.mjs found to catch most cues the writer missed for a quarter of what
// writing costs; if the check fails, the cards are kept as written. Stages are written when they open (by progress or because
// the learner chose them), so a word only costs what the learner reaches.
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
let client: Anthropic | null = null

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
    const slots = slotsOf(entry, stage)
    if (!slots) return reply(400, { message: 'Unknown stage for this word.' })
    const existing = (entry.forms || []).filter(form => form.stage === stage)
    if (existing.length) return reply(200, { forms: existing })
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
    const written = await writeForms(entry, stage, ask)
    const forms = await checkCues(entry, stage, written, ask).then(checked => checked.forms, () => written)
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

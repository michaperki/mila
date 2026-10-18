import { getDb } from './mongo'

// Every paid provider call is recorded here, one document per call, so Account can show what
// the app is spending. Costs use list prices (USD) at the time of the call, before free tiers
// and discounts; the provider's billing console stays the authoritative total.
// Prices: platform.claude.com/docs/en/about-claude/pricing, cloud.google.com/vision/pricing,
// cloud.google.com/translate/pricing (checked 2026-10-16), elevenlabs.io/pricing/api,
// ai.google.dev/gemini-api/docs/pricing (checked 2026-10-17).
export type Feature = 'page' | 'word' | 'glosses' | 'forms' | 'table' | 'root' | 'ocr' | 'translate' | 'speech'

// USD per million tokens. Cache writes are the 5-minute rate.
const CLAUDE: Record<string, { input: number; cacheWrite: number; cacheRead: number; output: number }> = {
  'claude-opus-5-5': { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 },
  'claude-opus-5': { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
  'claude-opus-4-8': { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
  'claude-sonnet-5-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 },
  'claude-sonnet-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 },
  'claude-haiku-4-5': { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 },
}
const VISION_PER_IMAGE = 1.5 / 1000
const TRANSLATE_PER_CHARACTER = 20 / 1_000_000
// Eleven v3: $0.08 per 1,000 characters.
const ELEVENLABS_PER_CHARACTER = 0.08 / 1000
// Gemini 3.8 Flash TTS, USD per million tokens: text in, audio out (25 tokens a second).
// Google doubles both on 2027-01-01.
export function geminiSpeechCost(inputTokens: number, outputTokens: number, at = new Date()) {
  const [input, output] = at < new Date('2027-01-01T00:00:00Z') ? [0.5, 9] : [1, 18]
  return (inputTokens * input + outputTokens * output) / 1_000_000
}

type ClaudeUsage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null }

// A server-side fallback can answer with another model; price whichever model actually ran.
// An unknown model id (a dated snapshot, a new model) is priced by its family prefix, or as Opus 5.5.
export function claudeCost(model: string, usage: ClaudeUsage) {
  const price = CLAUDE[model] ?? Object.entries(CLAUDE).find(([id]) => model.startsWith(id))?.[1] ?? CLAUDE['claude-opus-5-5']
  return (usage.input_tokens * price.input + (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite
    + (usage.cache_read_input_tokens ?? 0) * price.cacheRead + usage.output_tokens * price.output) / 1_000_000
}

// `cached`: answered from the AI cache (lib/ai-cache.ts) at no cost; counted apart from paid calls.
type Entry = { userId: string; feature: Feature; provider: 'anthropic' | 'google' | 'elevenlabs' | 'cache'; model: string; cost: number; ms: number
  cached?: boolean; inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number; characters?: number; images?: number }

// Recording must never fail the request it describes.
async function record(entry: Entry) {
  try {
    const usage = (await getDb()).collection('aiUsage')
    indexReady ??= usage.createIndex({ userId: 1, at: 1 }).catch(error => { indexReady = null; throw error })
    await indexReady
    await usage.insertOne({ ...entry, at: new Date() })
  } catch (error) {
    console.error('Usage record failed', { feature: entry.feature, name: (error as Error).name })
  }
}
let indexReady: Promise<string> | null = null

export async function recordClaude(userId: string, feature: Feature, response: { model?: string; usage?: ClaudeUsage }, ms: number) {
  const { model = 'unknown', usage } = response
  if (!usage) return
  await record({
    userId, feature, provider: 'anthropic', model, cost: claudeCost(model, usage), ms,
    inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0, cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  })
}
export const recordCacheHit = (userId: string, feature: Feature, ms: number) =>
  record({ userId, feature, provider: 'cache', model: 'cache', cost: 0, ms, cached: true })
export const recordVision = (userId: string, ms: number) =>
  record({ userId, feature: 'ocr', provider: 'google', model: 'vision-document-text', images: 1, cost: VISION_PER_IMAGE, ms })
export const recordTranslation = (userId: string, characters: number, ms: number) =>
  record({ userId, feature: 'translate', provider: 'google', model: 'translate-v2', characters, cost: characters * TRANSLATE_PER_CHARACTER, ms })
export const recordElevenLabs = (userId: string, model: string, characters: number, ms: number) =>
  record({ userId, feature: 'speech', provider: 'elevenlabs', model, characters, cost: characters * ELEVENLABS_PER_CHARACTER, ms })
export const recordGeminiSpeech = (userId: string, model: string, inputTokens: number, outputTokens: number, ms: number) =>
  record({ userId, feature: 'speech', provider: 'google', model, inputTokens, outputTokens, cost: geminiSpeechCost(inputTokens, outputTokens), ms })

// This calendar month (UTC) for one user, by feature.
export async function monthSummary(userId: string, now = new Date()) {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const rows = await (await getDb()).collection('aiUsage').aggregate<{ _id: Feature; requests: number; cacheHits: number; cost: number; inputTokens: number; outputTokens: number }>([
    { $match: { userId, at: { $gte: since } } },
    { $group: { _id: '$feature', requests: { $sum: { $cond: ['$cached', 0, 1] } }, cacheHits: { $sum: { $cond: ['$cached', 1, 0] } }, cost: { $sum: '$cost' }, inputTokens: { $sum: { $ifNull: ['$inputTokens', 0] } }, outputTokens: { $sum: { $ifNull: ['$outputTokens', 0] } } } },
    { $sort: { cost: -1 } },
  ]).toArray()
  const features = rows.map(({ _id, ...row }) => ({ feature: _id, ...row }))
  return { since: since.toISOString(), cost: features.reduce((sum, row) => sum + row.cost, 0), requests: features.reduce((sum, row) => sum + row.requests, 0), features }
}

import { describe, expect, it, vi } from 'vitest'
const aggregate = vi.fn()
vi.mock('../netlify/functions/lib/mongo', () => ({ getDb: async () => ({ collection: () => ({ aggregate }) }) }))
import { claudeCost, geminiSpeechCost, monthSummary } from '../netlify/functions/lib/ai-usage'

describe('AI usage', () => {
  it('prices Claude calls by the model that actually ran, including cache tokens', () => {
    // Opus 5.5: $4 input, $5 cache write, $0.20 cache read, $20 output per million tokens.
    expect(claudeCost('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(4)
    expect(claudeCost('claude-opus-5-5', { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 2000, cache_read_input_tokens: 10_000 })).toBeCloseTo(0.004 + 0.01 + 0.01 + 0.002)
    expect(claudeCost('claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(12)
    // A dated snapshot is priced by its family; an unknown model as Opus 5.5.
    expect(claudeCost('claude-haiku-4-5-20251001', { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(1)
    expect(claudeCost('something-new', { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(4)
  })
  it('prices Gemini speech by tokens, doubling from 2027', () => {
    // $0.50 text in, $9 audio out per million tokens; $1 and $18 from 2027-01-01.
    expect(geminiSpeechCost(1_000_000, 1_000_000, new Date('2026-12-31T23:00:00Z'))).toBeCloseTo(9.5)
    expect(geminiSpeechCost(1_000_000, 1_000_000, new Date('2027-01-01T00:00:00Z'))).toBeCloseTo(19)
  })
  it('sums this calendar month by feature', async () => {
    aggregate.mockReturnValue({ toArray: async () => [{ _id: 'page', requests: 3, cost: 0.3, inputTokens: 9000, outputTokens: 3000 }, { _id: 'ocr', requests: 10, cost: 0.015, inputTokens: 0, outputTokens: 0 }] })
    const summary = await monthSummary('user', new Date('2026-10-16T12:00:00Z'))
    expect(summary.since).toBe('2026-10-01T00:00:00.000Z')
    expect(summary.cost).toBeCloseTo(0.315)
    expect(summary.requests).toBe(13)
    expect(summary.features[0]).toEqual({ feature: 'page', requests: 3, cost: 0.3, inputTokens: 9000, outputTokens: 3000 })
    expect(aggregate.mock.calls[0][0][0].$match).toEqual({ userId: 'user', at: { $gte: new Date('2026-10-01T00:00:00Z') } })
  })
})

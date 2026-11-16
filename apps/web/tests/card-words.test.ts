import { beforeEach, describe, expect, it, vi } from 'vitest'
const create = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status = 500 }
  const Anthropic = Object.assign(function Anthropic() { return { beta: { messages: { create } } } }, { APIError })
  return { default: Anthropic }
})
const findOne = vi.fn()
const updateOne = vi.fn()
vi.mock('../netlify/functions/lib/mongo', () => ({ getDb: async () => ({ collection: () => ({ findOne, updateOne }) }) }))
vi.mock('../netlify/functions/lib/auth', () => ({ verifyAuth: () => ({ userId: 'user' }) }))
const recordClaude = vi.fn()
vi.mock('../netlify/functions/lib/ai-usage', () => ({ recordClaude: (...args: unknown[]) => recordClaude(...args), recordCacheHit: vi.fn(), checkDailySpend: vi.fn() }))
vi.mock('../netlify/functions/lib/ai-cache', () => ({ cachedAnswer: vi.fn(), rememberAnswer: vi.fn() }))
import { handler } from '../netlify/functions/card-words'
import { glossesWith } from '../netlify/functions/lib/sentence-words'

const invoke = async (body: unknown) => {
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify(body) } as any, {} as any, () => {}) as any
  return { status: response.statusCode, ...JSON.parse(response.body) }
}
const answer = { meanings: [{ n: 1, meaning: 'she', inTranslation: 'She' }, { n: 2, meaning: 'whispered', inTranslation: 'whispered' }, { n: 3, meaning: 'quietly', inTranslation: 'quietly' }] }
beforeEach(() => {
  vi.clearAllMocks(); process.env.ANTHROPIC_API_KEY = 'test-only'
  create.mockResolvedValue({ model: 'claude-opus-5-5', usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(answer) }] })
})
const card = { key: 'past:3sg.f', sentence: 'היא לחשה בשקט', translation: 'She whispered quietly.', mark: 'לחשה',
  variants: [{ sentence: 'היא לחשה לו', translation: 'She whispered to him.', mark: 'לחשה', at: 5, glosses: [{ i: 0, lemma: 'היא', en: 'she', t: 'She' }] }] }

describe('card words', () => {
  it('prepares each sentence of a card still without its word data, keeps it on the card, and counts it as prepared ahead', async () => {
    findOne.mockResolvedValue({ forms: [card] })
    const result = await invoke({ id: 'native-x', key: 'past:3sg.f' })
    expect(result.sentences).toEqual([{ variant: -1, glosses: [{ i: 0, lemma: '', en: 'she', t: 'She' }, { i: 2, lemma: '', en: 'quietly', t: 'quietly' }] }])
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0].messages[0].content).toContain('English translation: She whispered quietly.')
    expect(updateOne.mock.calls[0][1]).toEqual({ $set: { 'forms.$[card].glosses': result.sentences[0].glosses } })
    expect(updateOne.mock.calls[0][2]).toEqual({ arrayFilters: [{ 'card.key': 'past:3sg.f' }] })
    expect(recordClaude.mock.calls[0][1]).toBe('card-words')
  })
  it('asked for one sentence while studying, does only that one and counts it apart', async () => {
    findOne.mockResolvedValue({ forms: [{ ...card, variants: [{ ...card.variants[0], glosses: [{ i: 0, lemma: 'היא', en: 'she' }] }] }] })
    const result = await invoke({ id: 'native-x', key: 'past:3sg.f', variant: 0 })
    expect(result.sentences.map((item: { variant: number }) => item.variant)).toEqual([0])
    expect(updateOne.mock.calls[0][2]).toEqual({ arrayFilters: [{ 'card.key': 'past:3sg.f', 'card.variants.0.at': 5 }] })
    expect(recordClaude.mock.calls[0][1]).toBe('card-words-now')
  })
  it('asks nothing for a card already prepared, and says when the card is gone', async () => {
    findOne.mockResolvedValue({ forms: [{ ...card, glosses: [{ i: 0, lemma: 'היא', en: 'she', t: 'She' }], variants: [] }] })
    expect((await invoke({ id: 'native-x', key: 'past:3sg.f' })).sentences).toEqual([])
    expect(create).not.toHaveBeenCalled()
    // Asked for the one sentence shown, it gives what is kept, still without a request.
    expect((await invoke({ id: 'native-x', key: 'past:3sg.f', variant: -1 })).sentences).toEqual([{ variant: -1, glosses: [{ i: 0, lemma: 'היא', en: 'she', t: 'She' }] }])
    expect(create).not.toHaveBeenCalled()
    findOne.mockResolvedValue({ forms: [] })
    expect((await invoke({ id: 'native-x', key: 'past:3sg.f' })).status).toBe(404)
  })
  it('adds the English words to glosses a sentence already has, keeping their dictionary forms', () => {
    expect(glossesWith('היא לחשה לו', 'לחשה', [{ i: 0, lemma: 'היא', en: 'she' }], { meanings: [], renders: ['She', '', 'to him'] })).toEqual([{ i: 0, lemma: 'היא', en: 'she', t: 'She' }])
  })
})

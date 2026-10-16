import { beforeEach, describe, expect, it, vi } from 'vitest'
const create = vi.fn()
const findOne = vi.fn()
const updateOne = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status = 500 }
  const Anthropic = Object.assign(function Anthropic() { return { beta: { messages: { create } } } }, { APIError })
  return { default: Anthropic }
})
vi.mock('../netlify/functions/lib/auth', () => ({ verifyAuth: () => ({ userId: 'user' }) }))
vi.mock('../netlify/functions/lib/mongo', () => ({ getDb: async () => ({ collection: () => ({ findOne, updateOne }) }) }))
vi.mock('../netlify/functions/lib/ai-usage', () => ({ recordClaude: vi.fn() }))
import { handler } from '../netlify/functions/word-forms'

const entry = { lemma: 'לִפְתֹּחַ', gloss: 'to open', partOfSpeech: 'verb', binyan: "pa'al", forms: [{ stage: 'meanings', sentence: 'אני רוצה לפתוח חלון' }], encounters: [{ surface: 'פתח', context: 'הוא פתח את הדלת' }] }
const invoke = async (body: unknown) => {
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify(body) } as any, {} as any, () => {}) as any
  return { status: response.statusCode, ...JSON.parse(response.body) }
}
const generated = (forms: unknown[]) => ({ model: 'claude-opus-5-5', usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ forms }) }] })
beforeEach(() => {
  vi.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = 'test-only'
  updateOne.mockResolvedValue({ matchedCount: 1 })
})

describe('word forms', () => {
  it('writes a stage in slot order, drops unknown slots, and sends earlier sentences and encounters', async () => {
    findOne.mockResolvedValueOnce(entry).mockResolvedValueOnce(null)
    create.mockResolvedValue(generated([
      { slot: '3sg.m', form: 'פָּתַח', english: 'he opened', sentence: 'הוא פתח את הדלת', inSentence: 'פתח', translation: 'He opened the door', inTranslation: 'opened' },
      { slot: '1sg', form: 'פָּתַחְתִּי', english: 'I opened', sentence: 'פתחתי חשבון בבנק', inSentence: 'פתחתי', translation: 'I opened a bank account', inTranslation: 'I opened' },
      { slot: 'made-up', form: 'x', english: 'x', sentence: 'x', inSentence: 'x', translation: 'x', inTranslation: 'x' },
    ]))
    const result = await invoke({ id: 'native-x', stage: 'past' })
    expect(result.status).toBe(200)
    expect(result.forms.map((form: any) => form.key)).toEqual(['past:1sg', 'past:3sg.m'])
    const prompt = create.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('slot "2pl.f"')
    expect(prompt).toContain('אני רוצה לפתוח חלון')
    expect(prompt).toContain('הוא פתח את הדלת')
    const [filter, update] = updateOne.mock.calls[0]
    expect(filter).toEqual({ userId: 'user', id: 'native-x', 'forms.stage': { $ne: 'past' } })
    expect(update.$push.forms.$each[0]).toMatchObject({ key: 'past:1sg', stage: 'past', slot: '1sg', he: 'פָּתַחְתִּי', mark: 'פתחתי', enMark: 'I opened' })
    expect(prompt).toContain('do not reuse these sentences')
  })
  it('returns a stage that already exists without calling the model', async () => {
    findOne.mockResolvedValueOnce(entry)
    const result = await invoke({ id: 'native-x', stage: 'meanings' })
    expect(result.forms).toHaveLength(1)
    expect(create).not.toHaveBeenCalled()
  })
  it('rejects stages the word does not have', async () => {
    findOne.mockResolvedValueOnce({ ...entry, partOfSpeech: 'adverb' })
    expect((await invoke({ id: 'native-x', stage: 'past' })).status).toBe(400)
    findOne.mockResolvedValueOnce(null)
    expect((await invoke({ id: 'gone', stage: 'past' })).status).toBe(404)
  })
  it('asks for a word\'s meanings as its first stage, one card per meaning', async () => {
    findOne.mockResolvedValueOnce({ ...entry, forms: [] }).mockResolvedValueOnce(null)
    create.mockResolvedValue(generated([
      { slot: 'sense1', form: 'לְהַדְבִּיק', english: 'to stick', sentence: 'הוא הדביק בול על המכתב', inSentence: 'הדביק', translation: 'He stuck a stamp on the letter', inTranslation: 'stuck' },
      { slot: 'sense2', form: 'לְהַדְבִּיק', english: 'to catch up with', sentence: 'רצתי כדי להדביק אותה', inSentence: 'להדביק', translation: 'I ran to catch up with her', inTranslation: 'catch up with' },
    ]))
    const result = await invoke({ id: 'native-x', stage: 'meanings' })
    expect(result.forms.map((form: any) => form.key)).toEqual(['meanings:sense1', 'meanings:sense2'])
    expect(create.mock.calls[0][0].messages[0].content).toContain('Write its meanings')
  })
})

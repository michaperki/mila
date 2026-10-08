import { beforeEach, describe, expect, it, vi } from 'vitest'
const create = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status = 500 }
  const Anthropic = Object.assign(function Anthropic() { return { beta: { messages: { create } } } }, { APIError })
  return { default: Anthropic }
})
vi.mock('../netlify/functions/lib/auth', () => ({ verifyAuth: vi.fn() }))
import { verifyAuth } from '../netlify/functions/lib/auth'
import { handler } from '../netlify/functions/word-analysis'

const analysis = { word: 'בחשבון', vocalized: 'בַּחֶשְׁבּוֹן', meaning: 'in math', parts: [{ text: 'בַּ', meaning: 'in (the)' }, { text: 'חֶשְׁבּוֹן', meaning: 'arithmetic' }], lemma: 'חֶשְׁבּוֹן', lemmaMeaning: 'arithmetic, calculation, account, bill', root: 'ח־ש־ב', partOfSpeech: 'noun', binyan: '', form: 'masculine singular', note: '' }
const invoke = async (body: unknown) => {
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify(body) } as any, {} as any, () => {}) as any
  return { status: response.statusCode, ...JSON.parse(response.body) }
}
beforeEach(() => {
  vi.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = 'test-only'
  vi.mocked(verifyAuth).mockReturnValue({ userId: 'user' })
  create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(analysis) }] })
})
describe('word analysis endpoint', () => {
  it('requires sign-in before calling the model', async () => {
    vi.mocked(verifyAuth).mockImplementationOnce(() => { throw Object.assign(new Error('Unauthorized'), { statusCode: 401 }) })
    expect((await invoke({ word: 'בחשבון', sentence: 'מבחן בחשבון' })).status).toBe(401)
    expect(create).not.toHaveBeenCalled()
  })
  it('sends the sentence with the word and returns the structured analysis', async () => {
    const result = await invoke({ word: 'בחשבון', sentence: 'מחר יש לי מבחן בחשבון.' })
    expect(result.status).toBe(200); expect(result.meaning).toBe('in math')
    expect(create.mock.calls[0][0].messages[0].content).toContain('מחר יש לי מבחן בחשבון.')
  })
  it('caches repeated taps on the same word in the same sentence', async () => {
    await invoke({ word: 'מבחן', sentence: 'מבחן בחשבון' }); await invoke({ word: 'מבחן', sentence: 'מבחן בחשבון' })
    expect(create).toHaveBeenCalledTimes(1)
  })
  it('reports missing configuration so the app can fall back to plain translation', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const result = await invoke({ word: 'שלום', sentence: '' })
    expect(result.status).toBe(503); expect(result.code).toBe('ANALYSIS_CONFIG')
  })
  it('rejects oversized input and refusals without leaking details', async () => {
    expect((await invoke({ word: 'א'.repeat(41) })).status).toBe(400)
    create.mockResolvedValueOnce({ stop_reason: 'refusal', content: [] })
    expect((await invoke({ word: 'אחר', sentence: 'משפט אחר' })).status).toBe(422)
    create.mockRejectedValueOnce(new Error('provider details'))
    const failed = await invoke({ word: 'עוד', sentence: 'עוד משפט' })
    expect(failed.status).toBe(503); expect(JSON.stringify(failed)).not.toContain('provider details')
  })
})

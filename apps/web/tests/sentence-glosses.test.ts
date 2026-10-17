import { beforeEach, describe, expect, it, vi } from 'vitest'
const create = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status = 500 }
  const Anthropic = Object.assign(function Anthropic() { return { beta: { messages: { create } } } }, { APIError })
  return { default: Anthropic }
})
vi.mock('../netlify/functions/lib/auth', () => ({ verifyAuth: () => ({ userId: 'user' }) }))
vi.mock('../netlify/functions/lib/ai-usage', () => ({ recordClaude: vi.fn(), recordCacheHit: vi.fn() }))
vi.mock('../netlify/functions/lib/ai-cache', () => ({ cachedAnswer: vi.fn(), rememberAnswer: vi.fn() }))
import { cachedAnswer } from '../netlify/functions/lib/ai-cache'
import { handler } from '../netlify/functions/sentence-glosses'

const invoke = async (body: unknown) => {
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify(body) } as any, {} as any, () => {}) as any
  return { status: response.statusCode, ...JSON.parse(response.body) }
}
beforeEach(() => { vi.clearAllMocks(); process.env.ANTHROPIC_API_KEY = 'test-only' })

describe('sentence glosses', () => {
  it('returns one meaning per word in order, blank for a skipped word, and caches the sentence', async () => {
    create.mockResolvedValue({ model: 'claude-opus-5-5', usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ meanings: [{ n: 3, meaning: 'the door' }, { n: 1, meaning: 'he opened' }] }) }] })
    const body = { sentence: 'הוא פתח את הדלת', words: ['הוא', 'פתח', 'הדלת'] }
    const first = await invoke({ ...body, words: ['פתח', 'את', 'הדלת'] })
    expect(first.meanings).toEqual(['he opened', '', 'the door'])
    expect(create.mock.calls[0][0].messages[0].content).toContain('2. את')
    await invoke({ ...body, words: ['פתח', 'את', 'הדלת'] })
    expect(create).toHaveBeenCalledTimes(1)
  })
  it('answers a sentence asked before from the shared cache', async () => {
    vi.mocked(cachedAnswer).mockResolvedValueOnce(['she', 'wrote'])
    expect((await invoke({ sentence: 'היא כתבה', words: ['היא', 'כתבה'] })).meanings).toEqual(['she', 'wrote'])
    expect(create).not.toHaveBeenCalled()
  })
  it('rejects requests without words', async () => {
    expect((await invoke({ sentence: 'שלום', words: [] })).status).toBe(400)
  })
})

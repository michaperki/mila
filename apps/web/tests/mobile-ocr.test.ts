import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../netlify/functions/lib/auth', () => ({ verifyAuth: vi.fn() }))
vi.mock('../netlify/functions/lib/mongo', () => ({ getDb: vi.fn() }))
import { verifyAuth } from '../netlify/functions/lib/auth'
import { getDb } from '../netlify/functions/lib/mongo'
import { handler } from '../netlify/functions/mobile-ocr'
const counter = vi.fn()
const invoke = async (body: unknown) => {
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify(body) } as any, {} as any, () => {}) as any
  return { status: response.statusCode, ...JSON.parse(response.body) }
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn())
  process.env.GOOGLE_VISION_API_KEY = 'test-only'
  vi.mocked(verifyAuth).mockReturnValue({ userId: 'user' })
  counter.mockResolvedValue({ requests: 1 })
  vi.mocked(getDb).mockResolvedValue({ collection: () => ({ createIndex: vi.fn().mockResolvedValue('expiry'), findOneAndUpdate: counter }) } as any)
})
afterEach(() => vi.unstubAllGlobals())
describe('native OCR endpoint', () => {
  it('rejects unauthenticated requests before using the paid provider', async () => {
    vi.mocked(verifyAuth).mockImplementationOnce(() => { throw Object.assign(new Error('Unauthorized'), { statusCode: 401 }) })
    expect((await invoke({ image: 'aGVsbG8=' })).status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects oversized or malformed images', async () => {
    expect((await invoke({ image: 'a'.repeat(2000001) })).status).toBe(400)
    expect((await invoke({ image: 'https://example.com/photo' })).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('enforces a shared request budget before calling Google', async () => {
    counter.mockResolvedValueOnce({ requests: 201 })
    expect((await invoke({ image: 'aGVsbG8=' })).status).toBe(429)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('returns Hebrew text without storing images', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ responses: [{ fullTextAnnotation: { text: 'שלום עולם\n' } }] })))
    const result = await invoke({ image: 'aGVsbG8=' })
    expect(result.text).toBe('שלום עולם')
    expect(result.status).toBe(200)
    expect(JSON.stringify(counter.mock.calls)).not.toContain('aGVsbG8=')
  })
  it('does not expose provider error details to clients', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: { code: 403, message: 'private provider details' } }), { status: 403 }))
    const result = await invoke({ image: 'aGVsbG8=' })
    expect(result.status).toBe(503); expect(result.code).toBe('OCR_PROVIDER')
    expect(JSON.stringify(result)).not.toContain('private provider details')
  })
})

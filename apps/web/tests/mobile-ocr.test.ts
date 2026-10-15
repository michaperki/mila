import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../netlify/functions/lib/auth', () => ({ verifyAuth: vi.fn() }))
vi.mock('../netlify/functions/lib/mongo', () => ({ getDb: vi.fn() }))
vi.mock('../netlify/functions/lib/page-read', () => ({ readPage: vi.fn() }))
import { readPage } from '../netlify/functions/lib/page-read'
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
  process.env.ANTHROPIC_API_KEY = 'test-only'
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
    expect((await invoke({ image: 'a'.repeat(4000001) })).status).toBe(400)
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
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).requests[0].features).toEqual([{ type: 'DOCUMENT_TEXT_DETECTION' }])
    expect(JSON.stringify(counter.mock.calls)).not.toContain('aGVsbG8=')
  })
  it('does not expose provider error details to clients', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: { code: 403, message: 'private provider details' } }), { status: 403 }))
    const result = await invoke({ image: 'aGVsbG8=' })
    expect(result.status).toBe(503); expect(result.code).toBe('OCR_PROVIDER')
    expect(JSON.stringify(result)).not.toContain('private provider details')
  })
  it('live preview gets OCR only; a committed read adds the page model', async () => {
    const ocr = () => new Response(JSON.stringify({ responses: [{ fullTextAnnotation: { text: 'הארי פוטר\n33\nמר דרסלי' } }] }))
    vi.mocked(fetch).mockImplementation(async () => ocr())
    const page = { blocks: [{ kind: 'paragraph', sentences: [{ he: 'מר דרסלי', en: 'Mr. Dursley' }] }], startsMidSentence: false, endsMidSentence: true, continuesPrevious: false, omitted: ['הארי פוטר', '33'] }
    vi.mocked(readPage).mockResolvedValue(page as any)
    const live = await invoke({ image: 'aGVsbG8=' })
    expect(live.page).toBeUndefined(); expect(readPage).not.toHaveBeenCalled()
    const read = await invoke({ image: 'aGVsbG8=', mode: 'read', previous: 'בפחד' })
    expect(read.page).toEqual(page)
    expect(vi.mocked(readPage).mock.calls[0][0]).toMatchObject({ image: 'aGVsbG8=', ocr: 'הארי פוטר\n33\nמר דרסלי', previous: 'בפחד' })
    // Page reads have their own daily budget on top of the OCR windows.
    expect(counter.mock.calls.some(call => String(call[0]._id).startsWith('user:read:'))).toBe(true)
  })
  it('falls back to OCR text when the page model fails or is not configured', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ responses: [{ fullTextAnnotation: { text: 'שלום' } }] })))
    vi.mocked(readPage).mockRejectedValueOnce(Object.assign(new Error('provider details'), { code: 'READ_TRUNCATED' }))
    const failed = await invoke({ image: 'aGVsbG8=', mode: 'read' })
    expect(failed).toMatchObject({ status: 200, text: 'שלום', readError: 'READ_TRUNCATED' })
    expect(JSON.stringify(failed)).not.toContain('provider details')
    delete process.env.ANTHROPIC_API_KEY
    vi.mocked(readPage).mockClear()
    expect((await invoke({ image: 'aGVsbG8=', mode: 'read' })).text).toBe('שלום')
    expect(readPage).not.toHaveBeenCalled()
  })
})

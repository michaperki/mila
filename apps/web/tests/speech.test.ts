import { beforeEach, describe, expect, it, vi } from 'vitest'
const findOne = vi.fn()
const updateOne = vi.fn()
vi.mock('../netlify/functions/lib/auth', () => ({ verifyAuth: () => ({ userId: 'user' }) }))
vi.mock('../netlify/functions/lib/mongo', () => ({ getDb: async () => ({ collection: () => ({ findOne, updateOne }) }) }))
vi.mock('../netlify/functions/lib/ai-usage', () => ({ recordElevenLabs: vi.fn(), recordGeminiSpeech: vi.fn() }))
import { handler } from '../netlify/functions/speech'
import { recordElevenLabs, recordGeminiSpeech } from '../netlify/functions/lib/ai-usage'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)
const invoke = async (body: unknown) => {
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify(body) } as any, {} as any, () => {}) as any
  return { status: response.statusCode, ...JSON.parse(response.body) }
}
const geminiAnswer = (data?: string) => ({ ok: true, json: async () => ({
  candidates: [data ? { content: { parts: [{ inlineData: { mimeType: 'audio/wav', data } }] } } : { finishReason: 'OTHER' }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 50 },
}) })
beforeEach(() => {
  vi.clearAllMocks()
  process.env.ELEVENLABS_API_KEY = 'test-only'
  process.env.GEMINI_API_KEY = 'test-only'
  findOne.mockResolvedValue(null)
  updateOne.mockResolvedValue({})
})

describe('speech', () => {
  it('reads with Sarah by default, records the characters, and keeps the clip', async () => {
    fetchMock.mockResolvedValue({ ok: true, arrayBuffer: async () => new TextEncoder().encode('mp3').buffer })
    const result = await invoke({ text: ' מה עלה על דעתו? ' })
    expect(result).toMatchObject({ status: 200, mime: 'audio/mpeg', audio: Buffer.from('mp3').toString('base64') })
    expect(fetchMock.mock.calls[0][0]).toContain('/text-to-speech/EXAVITQu4vr4xnSDxMaL')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ text: 'מה עלה על דעתו?', model_id: 'eleven_v3', language_code: 'he' })
    expect(recordElevenLabs).toHaveBeenCalledWith('user', 'eleven_v3', 15, expect.any(Number))
    expect(updateOne.mock.calls[0][2]).toEqual({ upsert: true })
  })
  it('answers from the cache without calling a provider', async () => {
    findOne.mockResolvedValue({ audio: { buffer: Buffer.from('saved') }, mime: 'audio/wav' })
    const result = await invoke({ text: 'שלום', voice: 'charon' })
    expect(result).toMatchObject({ status: 200, mime: 'audio/wav', audio: Buffer.from('saved').toString('base64') })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('retries Charon once when Gemini returns no audio, and records both calls', async () => {
    fetchMock.mockResolvedValueOnce(geminiAnswer()).mockResolvedValueOnce(geminiAnswer(Buffer.from('RIFFdata').toString('base64')))
    const result = await invoke({ text: 'שלום', voice: 'charon' })
    expect(result.status).toBe(200)
    expect(Buffer.from(result.audio, 'base64').toString()).toBe('RIFFdata')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).contents).toEqual([{ parts: [{ text: 'שלום' }] }])
    expect(recordGeminiSpeech).toHaveBeenCalledTimes(2)
    expect(recordGeminiSpeech).toHaveBeenCalledWith('user', 'gemini-3.8-flash-tts', 10, 50, expect.any(Number))
  })
  it('refuses empty or overlong text', async () => {
    expect((await invoke({ text: '  ' })).status).toBe(400)
    expect((await invoke({ text: 'א'.repeat(601) })).status).toBe(400)
  })
  it('says when a key is missing', async () => {
    delete process.env.ELEVENLABS_API_KEY
    expect(await invoke({ text: 'שלום' })).toMatchObject({ status: 503, message: 'Listening is not configured yet.' })
  })
})

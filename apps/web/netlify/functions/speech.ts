import type { Handler } from '@netlify/functions'
import { createHash, randomUUID } from 'node:crypto'
import { Binary } from 'mongodb'
import { verifyAuth } from './lib/auth'
import { getDb } from './lib/mongo'
import { recordElevenLabs, recordGeminiSpeech } from './lib/ai-usage'

// Hebrew read aloud in the voice chosen in Account (Sarah, the default, or Charon). The app sends
// one sentence or word at a time and plays the clips in order, so each answer stays small and
// starts quickly. Clips are kept in the `speech` collection by voice and exact text: the same
// sentence is only paid for once, for every learner. Picked in a listening test of real Mila
// sentences (2026-10-17) over OpenAI and the phone's built-in voice.
export const VOICES = {
  sarah: { provider: 'elevenlabs', model: 'eleven_v3', id: 'EXAVITQu4vr4xnSDxMaL' },
  charon: { provider: 'gemini', model: 'gemini-3.8-flash-tts', id: 'Charon' },
} as const
export type Voice = keyof typeof VOICES
export const MAX_CHARACTERS = 600

const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
const failure = (message: string, statusCode = 502) => Object.assign(new Error(message), { statusCode })

type Clip = { audio: Buffer; mime: string }

export const handler: Handler = async (event) => {
  const requestId = randomUUID()
  if (event.httpMethod !== 'POST') return reply(405, { message: 'Use POST.' })
  try {
    const auth = verifyAuth(event)
    let payload: { text?: unknown; voice?: unknown }
    try { payload = JSON.parse(event.body || '{}') } catch { return reply(400, { message: 'Invalid request.' }) }
    const text = typeof payload.text === 'string' ? payload.text.trim() : ''
    const voice: Voice = payload.voice === 'charon' ? 'charon' : 'sarah'
    if (!text) return reply(400, { message: 'Nothing to read.' })
    if (text.length > MAX_CHARACTERS) return reply(400, { message: 'This is too long to read in one go.' })

    const spec = VOICES[voice]
    const key = createHash('sha256').update(`${spec.model}|${spec.id}|${text}`).digest('hex')
    const clips = (await getDb()).collection<{ _id: string; audio: Binary; mime: string; voice: Voice; at: Date }>('speech')
    const cached = await clips.findOne({ _id: key })
    if (cached) return reply(200, { audio: Buffer.from(cached.audio.buffer).toString('base64'), mime: cached.mime })

    const started = Date.now()
    const clip = spec.provider === 'elevenlabs'
      ? await elevenLabs(text, spec.id, spec.model, auth.userId, started)
      : await gemini(text, spec.id, spec.model, auth.userId, started)
    await clips.updateOne({ _id: key }, { $setOnInsert: { audio: new Binary(clip.audio), mime: clip.mime, voice, at: new Date() } }, { upsert: true })
      .catch(error => console.error('Speech cache write failed', { requestId, name: (error as Error).name }))
    return reply(200, { audio: clip.audio.toString('base64'), mime: clip.mime })
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    if (status === 503) return reply(503, { message: (error as Error).message, requestId })
    console.error('Speech failed', { requestId, name: (error as Error).name, message: (error as Error).message.slice(0, 300) })
    return reply(502, { message: 'Listening is unavailable right now.', requestId })
  }
}

async function elevenLabs(text: string, voice: string, model: string, userId: string, started: number): Promise<Clip> {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw failure('Listening is not configured yet.', 503)
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'xi-api-key': key },
    body: JSON.stringify({ text, model_id: model, language_code: 'he' }),
  })
  if (!response.ok) throw failure(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 200)}`)
  const audio = Buffer.from(await response.arrayBuffer())
  await recordElevenLabs(userId, model, text.length, Date.now() - started)
  return { audio, mime: 'audio/mpeg' }
}

// Gemini reads any instructions in the text aloud, so it gets the bare text. Now and then it
// answers with no audio (finishReason OTHER); one retry covers that.
async function gemini(text: string, voice: string, model: string, userId: string, started: number): Promise<Clip> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw failure('Listening is not configured yet.', 503)
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }),
    })
    if (!response.ok) throw failure(`Gemini ${response.status}: ${(await response.text()).slice(0, 200)}`)
    const data = await response.json() as { candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }
    const usage = data.usageMetadata
    if (usage) await recordGeminiSpeech(userId, model, usage.promptTokenCount ?? 0, usage.candidatesTokenCount ?? 0, Date.now() - started)
    const inline = data.candidates?.[0]?.content?.parts?.find(part => part.inlineData)?.inlineData
    if (!inline) continue
    const raw = Buffer.from(inline.data, 'base64')
    return { audio: raw.subarray(0, 4).toString() === 'RIFF' ? raw : wav(raw, 24000), mime: 'audio/wav' }
  }
  throw failure('Gemini returned no audio')
}

// Raw 16-bit mono PCM (older Gemini models) wrapped in a WAV header.
function wav(pcm: Buffer, rate: number) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12)
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

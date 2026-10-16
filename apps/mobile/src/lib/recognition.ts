import * as Crypto from 'expo-crypto'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { ApiError, request } from './api'
import { cleanOcr, segmentText } from './ocr-cleanup'
import { segmentsFromPage, tailOf, usableTail, type PageRead, type PageTail } from './page'
import type { CapturedImage, ReadingSegment, Recognition, WordAnalysis } from './types'
const translations = new Map<string, string>()
// Google can return HTML entities even when requesting plain text.
const decode = (value: string) => value.replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const remember = (text: string, value: string) => {
  if (translations.size >= 200) translations.delete(translations.keys().next().value!)
  translations.set(text, value)
}
// `token` attributes the cost to the signed-in user (Account → AI usage); translation works without it.
export async function translateMany(texts: string[], signal?: AbortSignal, token?: string) {
  const missing = [...new Set(texts.filter(text => !translations.has(text)))]
  if (missing.length) {
    const result = await request<{ sentenceTranslations: string[] }>('translate', { token, body: { sourceLang: 'he', targetLang: 'en', sentences: missing }, signal })
    if (result.sentenceTranslations?.length !== missing.length) throw new Error('No translation was returned. Please try again.')
    missing.forEach((text, i) => remember(text, decode(result.sentenceTranslations[i])))
  }
  return texts.map(text => translations.get(text)!)
}
export async function translate(text: string, signal?: AbortSignal, token?: string) { return (await translateMany([text], signal, token))[0] }

// Each segment is translated on its own so the English lines up with the Hebrew and a
// merged title or list number can't bleed into the neighbouring sentence.
export async function readText(raw: string, options: { trimPageFurniture?: boolean; signal?: AbortSignal; capturedAt?: number; token?: string } = {}): Promise<Recognition> {
  const capturedAt = options.capturedAt ?? Date.now()
  const pieces = cleanOcr(raw, options)
  if (!pieces.length) return { text: '', translation: '', capturedAt, segments: [], raw }
  const english = await translateMany(pieces.map(piece => piece.text), options.signal, options.token)
  const segments: ReadingSegment[] = pieces.map((piece, i) => ({ he: piece.text, en: english[i], ...(piece.heading ? { heading: true } : {}), ...(piece.marker ? { marker: piece.marker } : {}) }))
  return {
    text: pieces.map(segmentText).join('\n'),
    translation: segments.map(segment => (segment.marker ? `${segment.marker}. ${segment.en}` : segment.en)).join('\n'),
    // The untouched OCR text is kept for field reports (see Feedback).
    capturedAt, segments, raw,
  }
}

// Small vowelized book print needs detail: at 1400px / JPEG 0.65 Vision dropped letters
// and dagesh dots. Stay under the endpoint's 4,000,000-character base64 limit.
const MAX_SIDE = 2048
const MAX_BASE64 = 3_900_000
let lastTail: PageTail | null = null

// `read: true` is for a page the learner chose to read (shutter, photo, "Read this passage"):
// the server has a vision model correct and structure it, which takes several seconds.
// Live preview leaves it off and gets plain OCR plus local cleanup.
export async function recognizeImage(image: CapturedImage, token: string, options: { signal?: AbortSignal; read?: boolean } = {}): Promise<Recognition> {
  const { signal, read = false } = options
  const capturedAt = Date.now()
  const context = ImageManipulator.manipulate(image.uri)
  if (Math.max(image.width, image.height) > MAX_SIDE) context.resize(image.width >= image.height ? { width: MAX_SIDE } : { height: MAX_SIDE })
  const rendered = await context.renderAsync()
  let jpeg = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true })
  if ((jpeg.base64?.length ?? 0) > MAX_BASE64) jpeg = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.55, base64: true })
  if (signal?.aborted) throw new Error('Canceled')
  const previous = read ? usableTail(lastTail) : undefined
  const result = await request<{ text: string; page?: PageRead; readError?: string }>('mobile-ocr', {
    token, signal, timeoutMs: read ? 58000 : 20000,
    body: { image: jpeg.base64, ...(read ? { mode: 'read', ...(previous ? { previous } : {}) } : {}) },
  })
  // The id is the document this capture is saved under, so opening it twice can't duplicate it.
  const meta = { id: Crypto.randomUUID(), image, ...(result.readError ? { readError: result.readError } : {}) }
  if (result.page?.blocks.length) {
    const segments = segmentsFromPage(result.page, previous)
    lastTail = tailOf(result.page, segments)
    return {
      text: segments.map(segment => segment.he).join('\n'), translation: segments.map(segment => segment.en).join('\n'),
      capturedAt, segments, raw: result.text, source: 'page', omitted: result.page.omitted, ...meta,
    }
  }
  if (read) lastTail = null
  return { ...(await readText(result.text, { signal, capturedAt, token })), ...meta }
}

const analyses = new Map<string, WordAnalysis>()
// Explains a word in its sentence. When the explainer is unavailable (not configured,
// offline, refused) this degrades to a plain word translation rather than failing the tap.
export async function explainWord(word: string, sentence: string, token: string | undefined, signal?: AbortSignal): Promise<{ analysis?: WordAnalysis; gloss: string }> {
  const key = `${word}\u0000${sentence}`
  const cached = analyses.get(key)
  if (cached) return { analysis: cached, gloss: cached.meaning }
  if (!token) return { gloss: await translate(word, signal) }
  try {
    const analysis = await request<WordAnalysis>('word-analysis', { token, body: { word, sentence }, signal })
    if (analyses.size >= 200) analyses.delete(analyses.keys().next().value!)
    analyses.set(key, analysis)
    return { analysis, gloss: analysis.meaning }
  } catch (failure) {
    if (signal?.aborted || (failure instanceof ApiError && failure.status === 401)) throw failure
    return { gloss: await translate(word, signal, token) }
  }
}

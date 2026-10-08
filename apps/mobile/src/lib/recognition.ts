import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { ApiError, request } from './api'
import { cleanOcr, segmentText } from './ocr-cleanup'
import type { ReadingSegment, Recognition, WordAnalysis } from './types'
const translations = new Map<string, string>()
// Google can return HTML entities even when requesting plain text.
const decode = (value: string) => value.replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const remember = (text: string, value: string) => {
  if (translations.size >= 200) translations.delete(translations.keys().next().value!)
  translations.set(text, value)
}
export async function translateMany(texts: string[], signal?: AbortSignal) {
  const missing = [...new Set(texts.filter(text => !translations.has(text)))]
  if (missing.length) {
    const result = await request<{ sentenceTranslations: string[] }>('translate', { body: { sourceLang: 'he', targetLang: 'en', sentences: missing }, signal })
    if (result.sentenceTranslations?.length !== missing.length) throw new Error('No translation was returned. Please try again.')
    missing.forEach((text, i) => remember(text, decode(result.sentenceTranslations[i])))
  }
  return texts.map(text => translations.get(text)!)
}
export async function translate(text: string, signal?: AbortSignal) { return (await translateMany([text], signal))[0] }

// Each segment is translated on its own so the English lines up with the Hebrew and a
// merged title or list number can't bleed into the neighbouring sentence.
export async function readText(raw: string, options: { trimPageFurniture?: boolean; signal?: AbortSignal; capturedAt?: number } = {}): Promise<Recognition> {
  const capturedAt = options.capturedAt ?? Date.now()
  const pieces = cleanOcr(raw, options)
  if (!pieces.length) return { text: '', translation: '', capturedAt, segments: [], raw }
  const english = await translateMany(pieces.map(piece => piece.text), options.signal)
  const segments: ReadingSegment[] = pieces.map((piece, i) => ({ he: piece.text, en: english[i], ...(piece.heading ? { heading: true } : {}), ...(piece.marker ? { marker: piece.marker } : {}) }))
  return {
    text: pieces.map(segmentText).join('\n'),
    translation: segments.map(segment => (segment.marker ? `${segment.marker}. ${segment.en}` : segment.en)).join('\n'),
    // The untouched OCR text is kept for field reports (see Feedback).
    capturedAt, segments, raw,
  }
}

export async function recognizeImage(uri: string, width: number, height: number, token: string, signal?: AbortSignal): Promise<Recognition> {
  const capturedAt = Date.now()
  const context = ImageManipulator.manipulate(uri)
  if (Math.max(width, height) > 1400) context.resize(width >= height ? { width: 1400 } : { height: 1400 })
  const rendered = await context.renderAsync()
  const image = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.65, base64: true })
  if (signal?.aborted) throw new Error('Canceled')
  const result = await request<{ text: string }>('mobile-ocr', { token, body: { image: image.base64 }, signal })
  return readText(result.text, { signal, capturedAt })
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
    return { gloss: await translate(word, signal) }
  }
}

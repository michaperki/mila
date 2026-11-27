import * as Crypto from 'expo-crypto'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { ApiError, request } from './api'
import { type Act, onPhone } from './trace'
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
      capturedAt, segments, raw: result.text, source: 'page', omitted: result.page.omitted, ...(result.page.title?.trim() ? { title: result.page.title.trim() } : {}), ...meta,
    }
  }
  if (read) lastTail = null
  return { ...(await readText(result.text, { signal, capturedAt, token })), ...meta }
}

const analyses = new Map<string, WordAnalysis>()
const explaining = new Map<string, Promise<{ analysis?: WordAnalysis; gloss: string }>>()
// Explains a word in its sentence. When the explainer is unavailable (not configured,
// offline, refused) this degrades to a plain word translation rather than failing the tap.
// A second call while the first is on its way (Save pressed before the explanation arrived)
// shares that request rather than asking again.
// `act`: the action it is for, in a debug capture (lib/trace.ts), which also records an answer
// from memory or from a request already on its way.
export function explainWord(word: string, sentence: string, token: string | undefined, act?: Act): Promise<{ analysis?: WordAnalysis; gloss: string }> {
  const key = `${word}\u0000${sentence}`
  const cached = analyses.get(key)
  if (cached) { onPhone(act, 'explanation', 'phone memory: explained before in this sentence'); return Promise.resolve({ analysis: cached, gloss: cached.meaning }) }
  let pending = explaining.get(key)
  if (pending) {
    const start = Date.now()
    return pending.then(result => { onPhone(act, 'explanation', 'shared a request already on its way', start); return result })
  }
  pending = explain(word, sentence, token, key, act).finally(() => explaining.delete(key))
  explaining.set(key, pending)
  return pending
}
async function explain(word: string, sentence: string, token: string | undefined, key: string, act?: Act) {
  if (!token) return { gloss: await translate(word) }
  try {
    const analysis = await request<WordAnalysis>('word-analysis', { token, body: { word, sentence }, act })
    if (analyses.size >= 200) analyses.delete(analyses.keys().next().value!)
    analyses.set(key, analysis)
    return { analysis, gloss: analysis.meaning }
  } catch (failure) {
    if (failure instanceof ApiError && failure.status === 401) throw failure
    return { gloss: await translate(word, undefined, token) }
  }
}

// The reader's sentence words (2026-11-27): each word's quick meaning, its reading (vowelled as said
// in this sentence, for saying it before or without its explanation) and, given the sentence's
// English, the words of it that say the word (`renders`, for marking them). Asked once per
// sentence and kept; a failure gives null, and is asked again the next time.
export type SentenceWords = { meanings: string[]; renders: string[]; readings: string[] }
const readerWords = new Map<string, Promise<SentenceWords | null>>()
const readerDone = new Set<string>()
export function sentenceWords(sentence: string, words: string[], token: string, { translation, act }: { translation?: string; act?: Act } = {}): Promise<SentenceWords | null> {
  const key = `${sentence}\u0000${words.join(' ')}\u0000${translation ?? ''}`
  const pending = readerWords.get(key)
  if (pending) {
    const start = Date.now(), done = readerDone.has(key)
    return pending.then(answer => { onPhone(act, 'quick meanings', done ? 'phone memory: asked before' : 'shared a request already on its way', start); return answer })
  }
  const asked = request<{ meanings: string[]; renders?: string[]; readings?: string[] }>('sentence-glosses', { token, body: { sentence, words, readings: true, ...(translation ? { translation } : {}) }, act })
    .then(result => {
      readerDone.add(key)
      const each = (list?: string[]) => words.map((_, i) => list?.[i] ?? '')
      return { meanings: each(result.meanings), renders: each(result.renders), readings: each(result.readings) }
    }, () => { readerWords.delete(key); return null })
  if (readerWords.size >= 100) readerWords.delete(readerWords.keys().next().value!)
  readerWords.set(key, asked)
  return asked
}

const quick = new Map<string, Promise<string[]>>()
// A short meaning for every word of a sentence, fetched when the sentence is selected so a
// tapped word can show its meaning before the full explanation arrives. Failures give [].
const quickDone = new Set<string>()
export function quickMeanings(sentence: string, words: string[], token: string, act?: Act): Promise<string[]> {
  const key = `${sentence}\u0000${words.join(' ')}`
  let pending = quick.get(key)
  if (pending) {
    const start = Date.now(), done = quickDone.has(key)
    return pending.then(meanings => { onPhone(act, 'quick meanings', done ? 'phone memory: asked before' : 'shared a request already on its way', start); return meanings })
  }
  if (!pending) {
    pending = request<{ meanings: string[] }>('sentence-glosses', { token, body: { sentence, words }, act })
      .then(result => { quickDone.add(key); return result.meanings }, () => { quick.delete(key); return [] })
    if (quick.size >= 100) quick.delete(quick.keys().next().value!)
    quick.set(key, pending)
  }
  return pending
}


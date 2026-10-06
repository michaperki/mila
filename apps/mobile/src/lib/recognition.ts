import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { request } from './api'
import type { Recognition } from './types'
const translations = new Map<string, string>()
export async function translate(text: string, signal?: AbortSignal) {
  const cached = translations.get(text)
  if (cached) return cached
  const result = await request<{ sentenceTranslations: string[] }>('translate', { body: { sourceLang: 'he', targetLang: 'en', sentences: [text] }, signal })
  const translated = result.sentenceTranslations?.[0]
  if (!translated) throw new Error('No translation was returned. Please try again.')
  // Google can return HTML entities even when requesting plain text.
  const decoded = translated.replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  if (translations.size >= 100) translations.delete(translations.keys().next().value!)
  translations.set(text, decoded)
  return decoded
}
export async function recognizeImage(uri: string, width: number, height: number, token: string, signal?: AbortSignal): Promise<Recognition> {
  const capturedAt = Date.now()
  const context = ImageManipulator.manipulate(uri)
  if (Math.max(width, height) > 1400) context.resize(width >= height ? { width: 1400 } : { height: 1400 })
  const rendered = await context.renderAsync()
  const image = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.65, base64: true })
  if (signal?.aborted) throw new Error('Canceled')
  const result = await request<{ text: string }>('mobile-ocr', { token, body: { image: image.base64 }, signal })
  if (!result.text.trim()) return { text: '', translation: '', capturedAt }
  return { text: result.text, translation: await translate(result.text, signal), capturedAt }
}

import { segmentText, titleFrom } from './ocr-cleanup.ts'
import type { Recognition, ReadingSegment, TextDoc } from './types'
const tokensOf = (text: string) => text.trim().split(/\s+/).filter(Boolean).map((surface, idx) => ({ idx, surface }))
export function segmentsOf(value: Recognition): ReadingSegment[] {
  return value.segments?.length ? value.segments : [{ he: value.text, en: value.translation }]
}
const LAYOUT = ['paragraph', 'joined', 'cutStart', 'cutEnd'] as const
const layoutOf = (from: Partial<Record<(typeof LAYOUT)[number], boolean>>) => Object.fromEntries(LAYOUT.filter(key => from[key]).map(key => [key, true]))
// One chunk per segment keeps Hebrew/English pairs aligned in the saved document. Page reads
// also keep their paragraph breaks and page-edge flags so a reopened page reads the same.
export function documentFromRecognition(value: Recognition, id: string): TextDoc {
  const segments = segmentsOf(value)
  const page = value.source === 'page'
  return { id, source: 'ocr', title: titleFrom(value.text), createdAt: value.capturedAt, ...(page ? { layout: 'page' as const } : {}),
    chunks: segments.map((segment, i) => {
      const text = segmentText({ text: segment.he, marker: segment.marker })
      return { id: `${id}-${i}`, type: segment.heading ? 'phrase' : 'sentence', text, translation: segment.marker ? `${segment.marker}. ${segment.en}` : segment.en, tokens: tokensOf(text), ...(page ? layoutOf(segment) : {}) }
    }),
  }
}
export function textFromDocument(doc: TextDoc): Recognition {
  const page = doc.layout === 'page'
  const segments = doc.chunks.map(chunk => ({ he: chunk.text, en: chunk.translation || '', ...(chunk.type === 'phrase' ? { heading: true } : {}), ...(page ? layoutOf(chunk) : {}) }))
  return { text: segments.map(s => s.he).join('\n'), translation: segments.map(s => s.en).join('\n'), capturedAt: doc.createdAt, segments, id: doc.id, library: 'saved', ...(page ? { source: 'page' as const } : {}) }
}

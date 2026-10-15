import type { ReadingSegment } from './types'

// Mirrors `PageRead` in apps/web/netlify/functions/lib/page-read.ts.
export type PageRead = {
  blocks: { kind: 'heading' | 'paragraph'; sentences: { he: string; en: string }[] }[]
  startsMidSentence: boolean
  endsMidSentence: boolean
  continuesPrevious: boolean
  omitted: string[]
}

// Pages are photographed one after another, so a sentence cut off at the bottom of one
// page is finished at the top of the next. The cut-off fragment is remembered briefly and
// sent with the next page read; the model says whether that page really continues it.
export type PageTail = { he: string; at: number }
const TAIL_TTL = 20 * 60 * 1000
export const usableTail = (tail: PageTail | null, now = Date.now()) => (tail && now - tail.at < TAIL_TTL ? tail.he : undefined)

export function segmentsFromPage(page: PageRead, previous?: string): ReadingSegment[] {
  const segments: ReadingSegment[] = []
  page.blocks.forEach(block => block.sentences.forEach((sentence, i) => segments.push({
    he: sentence.he, en: sentence.en,
    ...(block.kind === 'heading' ? { heading: true } : {}),
    ...(i === 0 ? { paragraph: true } : {}),
  })))
  if (!segments.length) return segments
  const first = segments[0]
  // The model already translated the joined sentence; show it whole.
  if (page.continuesPrevious && previous) Object.assign(first, { he: `${previous} ${first.he}`, joined: true })
  else if (page.startsMidSentence) first.cutStart = true
  if (page.endsMidSentence) segments[segments.length - 1].cutEnd = true
  return segments
}

// The fragment to carry to the next page, or null when the page ends cleanly.
export function tailOf(page: PageRead, segments: ReadingSegment[], now = Date.now()): PageTail | null {
  const last = segments[segments.length - 1]
  return page.endsMidSentence && last ? { he: last.he, at: now } : null
}

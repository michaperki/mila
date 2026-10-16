import { stripNiqqud } from './ocr-cleanup.ts'
import type { Review, VocabEntry } from './types'

// Lightweight spaced repetition for saved words. A word is New until its first review,
// Learning while its interval is under three weeks, then Mastered.
// Again: back into this session. Hard: tomorrow. Got it: 1 day → 3 days → ×2.5 each time.
export type Rating = 'again' | 'hard' | 'good'
export type Status = 'new' | 'learning' | 'mastered'
const DAY = 24 * 60 * 60 * 1000
const MASTERED_DAYS = 21

export function grade(review: Review | undefined, rating: Rating, now = Date.now()): Review {
  const interval = review?.interval ?? 0
  const base = { reps: (review?.reps ?? 0) + 1, lapses: review?.lapses ?? 0, last: now }
  if (rating === 'again') return { ...base, lapses: base.lapses + 1, interval: 0, due: now }
  const next = rating === 'hard' ? 1 : interval < 1 ? 1 : interval < 3 ? 3 : Math.round(interval * 2.5)
  return { ...base, interval: next, due: now + next * DAY }
}

// How long a rating puts the card away, for the grading buttons: "now", "1 day", "3 days".
export function waitOf(review: Review | undefined, rating: Rating): string {
  if (rating === 'again') return 'now'
  const days = grade(review, rating, 0).interval
  return days === 1 ? '1 day' : days < 60 ? `${days} days` : `${Math.round(days / 30)} months`
}

export const statusOf = (entry: VocabEntry): Status =>
  !entry.review ? 'new' : entry.review.interval >= MASTERED_DAYS ? 'mastered' : 'learning'

// Due by the end of today, so "due today" doesn't depend on the hour you open the app.
const endOfDay = (now: number) => { const date = new Date(now); date.setHours(23, 59, 59, 999); return date.getTime() }
export const isDue = (entry: VocabEntry, now = Date.now()) => !entry.review || entry.review.due <= endOfDay(now)

// Today's practice: reviews first (most overdue first), then new words, oldest saved first.
export function practiceQueue(entries: VocabEntry[], now = Date.now(), limit = 20): VocabEntry[] {
  const due = entries.filter(entry => isDue(entry, now))
  const reviews = due.filter(entry => entry.review).sort((a, b) => a.review!.due - b.review!.due)
  const fresh = due.filter(entry => !entry.review).sort((a, b) => a.createdAt - b.createdAt)
  return [...reviews, ...fresh].slice(0, limit)
}

export function countsOf(entries: VocabEntry[], now = Date.now()) {
  return {
    saved: entries.length,
    due: entries.filter(entry => isDue(entry, now)).length,
    learning: entries.filter(entry => statusOf(entry) === 'learning').length,
    mastered: entries.filter(entry => statusOf(entry) === 'mastered').length,
  }
}

// Search matches Hebrew with or without vowels, and the English meanings.
export function matches(entry: VocabEntry, query: string) {
  const needle = stripNiqqud(query.trim().toLowerCase())
  if (!needle) return true
  return [entry.lemma, entry.surface, entry.vocalized, entry.gloss, entry.senses, ...(entry.encounters || []).flatMap(item => [item.surface, item.meaning])]
    .some(field => !!field && stripNiqqud(field.toLowerCase()).includes(needle))
}

import { stripNiqqud } from './ocr-cleanup.ts'
import type { Review, VocabEntry } from './types'

// Spaced repetition for one practice card (a form of a saved word, see forms.ts).
// Again: back into this session. Hard: tomorrow. Got it: 1 day → 3 days → ×2.5 each time.
export type Rating = 'again' | 'hard' | 'good'
const DAY = 24 * 60 * 60 * 1000

export function grade(review: Review | undefined, rating: Rating, now = Date.now()): Review {
  const interval = review?.interval ?? 0
  const base = { reps: (review?.reps ?? 0) + 1, lapses: review?.lapses ?? 0, last: now, first: review?.first ?? now }
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

// Due by the end of today, so "due today" doesn't depend on the hour you open the app.
export const endOfDay = (now: number) => { const date = new Date(now); date.setHours(23, 59, 59, 999); return date.getTime() }

// Search matches Hebrew with or without vowels, and the English meanings.
export function matches(entry: VocabEntry, query: string) {
  const needle = stripNiqqud(query.trim().toLowerCase())
  if (!needle) return true
  return [entry.lemma, entry.surface, entry.vocalized, entry.gloss, entry.senses,
    ...(entry.encounters || []).flatMap(item => [item.surface, item.meaning]), ...(entry.forms || []).flatMap(form => [form.he, form.en])]
    .some(field => !!field && stripNiqqud(field.toLowerCase()).includes(needle))
}

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countsOf, grade, isDue, matches, practiceQueue, statusOf } from '../src/lib/review.ts'

const DAY = 24 * 60 * 60 * 1000
const now = new Date(2026, 9, 15, 10).getTime()
const word = (id: string, extra: object = {}) => ({ id, lemma: id, gloss: 'x', createdAt: 0, ...extra })

test('intervals grow on Got it, reset on Again, and Hard means tomorrow', () => {
  let review = grade(undefined, 'good', now)
  assert.equal(review.interval, 1); assert.equal(review.due, now + DAY)
  review = grade(review, 'good', now); assert.equal(review.interval, 3)
  review = grade(review, 'good', now); assert.equal(review.interval, 8)
  review = grade(review, 'good', now); assert.equal(review.interval, 20)
  assert.equal(grade(review, 'hard', now).interval, 1)
  const again = grade(review, 'again', now)
  assert.equal(again.interval, 0); assert.equal(again.due, now); assert.equal(again.lapses, 1); assert.equal(again.reps, 5)
})

test('status, due today and the practice queue order', () => {
  const fresh = word('new', { createdAt: 5 })
  const older = word('older', { createdAt: 1 })
  const overdue = word('overdue', { review: { due: now - 2 * DAY, interval: 3, reps: 2, lapses: 0 } })
  const tonight = word('tonight', { review: { due: now + 5 * 60 * 60 * 1000, interval: 1, reps: 1, lapses: 0 } })
  const later = word('later', { review: { due: now + 9 * DAY, interval: 30, reps: 6, lapses: 0 } })
  assert.deepEqual([fresh, overdue, later].map(statusOf), ['new', 'learning', 'mastered'])
  assert.equal(isDue(tonight, now), true); assert.equal(isDue(later, now), false)
  assert.deepEqual(practiceQueue([fresh, later, tonight, older, overdue], now).map(entry => entry.id), ['overdue', 'tonight', 'older', 'new'])
  assert.deepEqual(countsOf([fresh, later, tonight, overdue], now), { saved: 4, due: 3, learning: 2, mastered: 1 })
})

test('search ignores vowels and looks at English meanings', () => {
  const entry = word('לְמַעֲשֶׂה', { gloss: 'in fact', senses: 'actually' })
  assert.equal(matches(entry, 'למעשה'), true)
  assert.equal(matches(entry, 'Actual'), true)
  assert.equal(matches(entry, 'house'), false)
  assert.equal(matches(entry, ' '), true)
})

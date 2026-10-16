import { test } from 'node:test'
import assert from 'node:assert/strict'
import { grade, matches, waitOf } from '../src/lib/review.ts'

const DAY = 24 * 60 * 60 * 1000
const now = new Date(2026, 9, 15, 10).getTime()

test('intervals grow on Got it, reset on Again, and Hard means tomorrow', () => {
  let review = grade(undefined, 'good', now)
  assert.equal(review.interval, 1); assert.equal(review.due, now + DAY); assert.equal(review.first, now)
  review = grade(review, 'good', now + DAY); assert.equal(review.interval, 3); assert.equal(review.first, now)
  review = grade(review, 'good', now); assert.equal(review.interval, 8)
  review = grade(review, 'good', now); assert.equal(review.interval, 20)
  assert.equal(grade(review, 'hard', now).interval, 1)
  const again = grade(review, 'again', now)
  assert.equal(again.interval, 0); assert.equal(again.due, now); assert.equal(again.lapses, 1); assert.equal(again.reps, 5)
})

test('search ignores vowels and looks at English meanings and forms', () => {
  const entry = { id: 'x', lemma: 'לְמַעֲשֶׂה', gloss: 'in fact', createdAt: 0, senses: 'actually' }
  assert.equal(matches(entry, 'למעשה'), true)
  assert.equal(matches(entry, 'Actual'), true)
  assert.equal(matches(entry, 'house'), false)
  assert.equal(matches(entry, ' '), true)
  const verb = { id: 'v', lemma: 'לִפְתֹּחַ', gloss: 'to open', createdAt: 0, forms: [{ key: 'past:3pl', stage: 'past', slot: '3pl', he: 'פָּתְחוּ', en: 'they opened', sentence: '', mark: '', translation: '' }] }
  assert.equal(matches(verb, 'פתחו'), true)
  assert.equal(matches(verb, 'they opened'), true)
})

test('grading buttons show how long each rating puts a card away', () => {
  assert.equal(waitOf(undefined, 'again'), 'now')
  assert.equal(waitOf(undefined, 'good'), '1 day')
  assert.equal(waitOf({ due: 0, interval: 1, reps: 1, lapses: 0 }, 'good'), '3 days')
  assert.equal(waitOf({ due: 0, interval: 3, reps: 2, lapses: 0 }, 'good'), '8 days')
  assert.equal(waitOf({ due: 0, interval: 30, reps: 5, lapses: 0 }, 'hard'), '1 day')
  assert.equal(waitOf({ due: 0, interval: 30, reps: 5, lapses: 0 }, 'good'), '3 months')
})

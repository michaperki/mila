import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumeRound, roundProgress, roundToSave } from '../src/lib/rounds.ts'
import type { Card } from '../src/lib/forms.ts'
import type { FormCard, VocabEntry } from '../src/lib/types'

const form = (key: string) => ({ key, stage: 'present', he: 'x', en: 'x', sentence: 'x', translation: 'x', mark: 'x' }) as unknown as FormCard
const entry = (id: string, keys: string[] = []) => ({ id, lemma: id, gloss: id, forms: keys.map(form) }) as unknown as VocabEntry
const a = entry('a', ['a1']), b = entry('b'), c = entry('c', ['c1'])
const deck: Card[] = [
  { entry: b, form: null },
  { entry: a, form: null, why: 'new' },
  { entry: a, form: a.forms![0], sequence: true },
  { entry: c, form: null, checkpoint: 'present' },
  { entry: c, form: c.forms![0] },
]

test('keeps only the round in front of the learner, counted from its first card', () => {
  const saved = roundToSave('me', deck, 1, 3, true, { 0: true, 1: false, 3: true }, { 1: { results: [] } }, 5)
  assert.equal(saved.cards.length, 4)
  assert.deepEqual(saved.cards[1], { id: 'a', form: 'a1', sequence: true })
  assert.deepEqual(saved.cards[2], { id: 'c', checkpoint: 'present' })
  assert.equal(saved.position, 2)
  assert.deepEqual(saved.answers, { 0: false, 2: true })
  assert.deepEqual(saved.before, { 0: { results: [] } })
})

test('opens on the same card and side, its cards following the latest words', () => {
  const saved = roundToSave('me', deck, 0, 2, true, { 0: true, 2: false }, {})
  const newer = { ...a, gloss: 'newer' }
  const resumed = resumeRound(saved, [newer, b, c])!
  assert.equal(resumed.position, 2)
  assert.equal(resumed.flipped, true)
  assert.equal(resumed.deck[1].entry.gloss, 'newer')
  assert.equal(resumed.deck[2].form?.key, 'a1')
  assert.equal(resumed.deck[3].checkpoint, 'present')
  assert.deepEqual(resumed.answers, { 0: true, 2: false })
})

test('leaves out cards whose word or form has gone, moving answers with their cards', () => {
  const saved = roundToSave('me', deck, 0, 2, true, { 0: true, 3: false }, {})
  // Word a deleted: the round goes on from the next card still there, on its question side.
  const resumed = resumeRound(saved, [b, c])!
  assert.equal(resumed.deck.length, 3)
  assert.equal(resumed.position, 1)
  assert.equal(resumed.flipped, false)
  assert.deepEqual(resumed.answers, { 0: true, 1: false })
  // c's form card gone with its form.
  assert.equal(resumeRound(saved, [a, b, entry('c')])!.deck.length, 4)
})

test('nothing to resume when nothing is left from where it stopped', () => {
  assert.equal(resumeRound(null, [a]), null)
  assert.equal(resumeRound(roundToSave('me', deck, 0, 4, false, {}, {}), [a, b]), null)
  assert.equal(resumeRound(roundToSave('me', [], 0, 0, false, {}, {}), [a]), null)
})

test('says where a saved round is', () => {
  assert.deepEqual(roundProgress(roundToSave('me', deck, 0, 2, false, {}, {})), { at: 3, of: 5 })
  assert.equal(roundProgress(null), null)
})

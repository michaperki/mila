import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesDoc, previewOf, progressOf, sortDocs, titleOf } from '../src/lib/library.ts'
import type { TextDoc } from '../src/lib/types'

const doc = (id: string, extra: Partial<TextDoc> = {}): TextDoc => ({
  id, source: 'ocr', createdAt: 1,
  chunks: ['שָׁלוֹם לְכֻלָּם', 'מה שלומך', 'להתראות', 'תודה'].map((text, i) => ({ id: `${id}-${i}`, type: 'sentence', text, tokens: [], translation: ['Hello everyone', 'How are you', 'Goodbye', 'Thanks'][i] })),
  ...extra,
})

test('a passage is titled by its name, then its page title, then its first line', () => {
  assert.equal(titleOf(doc('a', { name: 'Chapter 1', title: 'A greeting' })), 'Chapter 1')
  assert.equal(titleOf(doc('a', { title: 'A greeting' })), 'A greeting')
  assert.equal(titleOf(doc('a')), 'שָׁלוֹם לְכֻלָּם')
  // The preview is in the other language from the title.
  assert.equal(previewOf(doc('a', { title: 'A greeting' })), 'שָׁלוֹם לְכֻלָּם')
  assert.equal(previewOf(doc('a', { title: 'שלום לכולם' })), 'Hello everyone')
})

test('progress is the furthest sentence read; recent sorts by last opened', () => {
  assert.equal(progressOf(doc('a')), null)
  assert.equal(progressOf(doc('a', { lastSegment: 0, furthestSegment: 1 })), 0.5)
  const older = doc('old', { createdAt: 1, openedAt: 50 }); const newer = doc('new', { createdAt: 10 })
  assert.deepEqual(sortDocs([newer, older], 'recent').map(item => item.id), ['old', 'new'])
  assert.deepEqual(sortDocs([older, newer], 'added').map(item => item.id), ['new', 'old'])
})

test('search covers both languages and ignores vowels', () => {
  assert.ok(matchesDoc(doc('a'), 'שלום'))
  assert.ok(matchesDoc(doc('a'), 'goodbye'))
  assert.ok(matchesDoc(doc('a', { name: 'Kafka' }), 'kaf'))
  assert.ok(!matchesDoc(doc('a'), 'banana'))
})

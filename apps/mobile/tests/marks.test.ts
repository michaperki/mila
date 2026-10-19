import { test } from 'node:test'
import assert from 'node:assert/strict'
import { englishPieces, hebrewPieces, matchInOrder, prefixOf } from '../src/lib/marks.ts'

const marked = (pieces: { text: string; marked: boolean }[]) => pieces.filter(piece => piece.marked).map(piece => piece.text)

test('every word of an expression is marked, even where other words come between', () => {
  assert.deepEqual(marked(hebrewPieces('אנחנו עוברים דרך הפארק.', 'עוברים דרך')), ['עוברים', 'דרך'])
  assert.deepEqual(marked(hebrewPieces('הוא מעמיד את עצמו פנים כאילו הכול בסדר', 'מעמיד פנים')), ['מעמיד', 'פנים'])
  // One word, with vowels in the sentence, punctuation and an attached prefix the mark leaves out.
  assert.deepEqual(marked(hebrewPieces('וּפָתַחְנוּ, את הדלת', 'פתחנו')), ['וּפָתַחְנוּ,'])
  // Not every occurrence: only the words of this target, in order.
  assert.deepEqual(marked(hebrewPieces('דרך ארוכה, ואז עברנו דרך העיר', 'עברנו דרך')), ['עברנו', 'דרך'])
  // A mark not found leaves the sentence unmarked; a partial one marks what it can, in order.
  assert.deepEqual(marked(hebrewPieces('שלום לכולם', 'להתראות')), [])
  assert.deepEqual(matchInOrder(['a', 'x', 'b'], ['a c'], (w, m) => w === m), [0])
})

test('the shortest stretch that holds the whole target wins', () => {
  assert.deepEqual(matchInOrder(['a', 'b', 'a', 'b'], ['a b'], (w, m) => w === m), [0, 1])
  assert.deepEqual(matchInOrder(['a', 'x', 'a', 'b'], ['a b'], (w, m) => w === m), [2, 3])
})

test('English marks are matched by word, case-insensitively, spaces left unmarked', () => {
  const pieces = englishPieces('We go through the park.', 'go through')
  assert.deepEqual(marked(pieces), ['go', 'through'])
  assert.equal(pieces.find(piece => piece.text === ' ')?.marked, false)
  assert.deepEqual(marked(englishPieces('He was pretending all along', 'Pretending')), ['pretending'])
})

test('a quiz blank keeps the attached prefix', () => {
  assert.equal(prefixOf('ושפתחנו', 'פָּתַחְנוּ'), 'וש')
  assert.equal(prefixOf('פתחנו', 'פתחנו'), '')
})

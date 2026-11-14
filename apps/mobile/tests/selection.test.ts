import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rangeOf, rowEnd, wordAt } from '../src/lib/selection.ts'

// Two right-to-left rows: words 0–2 on the first, 3–4 on the second.
const rects = new Map([
  [0, { x: 200, y: 0, width: 60, height: 30 }],
  [1, { x: 120, y: 0, width: 70, height: 30 }],
  [2, { x: 40, y: 0, width: 70, height: 30 }],
  [3, { x: 190, y: 32, width: 70, height: 30 }],
  [4, { x: 100, y: 32, width: 80, height: 30 }],
])

test('finds the word under the finger, or the nearest on the same row', () => {
  assert.equal(wordAt(rects, 150, 10), 1)
  assert.equal(wordAt(rects, 112, 10), 2) // gap, nearer the left word
  assert.equal(wordAt(rects, 10, 45), 4) // past the end of the second row
  assert.equal(wordAt(rects, 230, 31), 0) // between rows, still the top row's word
  assert.equal(wordAt(new Map(), 0, 0), undefined)
})

test('the English goes after the last word on the row a sentence ends on', () => {
  const all = [0, 1, 2, 3, 4]
  assert.equal(rowEnd(rects, all, 1), 2) // ends mid-row: the row's other word stays above it
  assert.equal(rowEnd(rects, all, 2), 2)
  assert.equal(rowEnd(rects, all, 3), 4)
  assert.equal(rowEnd(new Map([...rects, [2, { ...rects.get(2)!, y: 3 }]]), all, 1), 2) // a little lower, same row
  assert.equal(rowEnd(new Map(), all, 1), 1)
})

test('range runs either way from the start word and is capped', () => {
  assert.deepEqual(rangeOf(3, 1), { from: 1, to: 3 })
  assert.deepEqual(rangeOf(1, 3), { from: 1, to: 3 })
  assert.deepEqual(rangeOf(0, 20), { from: 0, to: 7 })
  assert.deepEqual(rangeOf(20, 0), { from: 13, to: 20 })
})

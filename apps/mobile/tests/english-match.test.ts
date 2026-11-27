import { test } from 'node:test'
import assert from 'node:assert/strict'
import { englishMatch } from '../src/lib/english-match.ts'

const marked = (text: string, renders: string[]) => englishMatch(text, renders).filter(piece => piece.marked).map(piece => piece.text)

test('a tapped word’s English is marked only where it stands once, as whole words', () => {
  assert.deepEqual(marked('He spoke quietly to him.', ['quietly']), ['quietly'])
  assert.deepEqual(marked('He spoke quietly to him.', ['to him']), ['to him'])
  // Twice in the sentence: which one is meant isn't known, so neither is marked.
  assert.deepEqual(marked('The boy saw the dog and the dog ran.', ['the dog']), [])
  // Inside another word only ("he" in "the"), or not in the translation: nothing.
  assert.deepEqual(marked('Then the rain came.', ['he']), [])
  assert.deepEqual(marked('Then the rain came.', ['storm']), [])
  assert.deepEqual(marked('Then the rain came.', ['']), [])
  // A phrase dragged across: each word's English, in order, never overlapping.
  assert.deepEqual(marked('She went through the city quickly.', ['went through', 'through', 'quickly']), ['went through', 'quickly'])
})

test('the pieces put back together are the translation as it was', () => {
  const text = '3. It was cold, so we stayed home.'
  assert.equal(englishMatch(text, ['stayed home']).map(piece => piece.text).join(''), text)
  assert.equal(englishMatch(text, []).map(piece => piece.text).join(''), text)
  assert.equal(englishMatch('', ['x']).map(piece => piece.text).join(''), '')
})

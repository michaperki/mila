import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextRate, rateLabel, speechPieces } from '../src/lib/speech-text.ts'

test('reads one sentence at a time', () => {
  assert.deepEqual(speechPieces('מה עלה על דעתו? זו בטח היתה מין טעות אופטית.\nדרסלי מיצמץ.'), ['מה עלה על דעתו?', 'זו בטח היתה מין טעות אופטית.', 'דרסלי מיצמץ.'])
  assert.deepEqual(speechPieces(['שלום.', '  ', '1.', 'להתראות']), ['שלום.', '1.', 'להתראות'])
  assert.deepEqual(speechPieces(' – '), [])
})
test('breaks a long sentence at a comma, then at a space', () => {
  const words = Array.from({ length: 40 }, () => 'מילה').join(' ')
  assert.deepEqual(speechPieces('אחת, שתיים שלוש', 9), ['אחת,', 'שתיים', 'שלוש'])
  for (const piece of speechPieces(words, 50)) assert.ok(piece.length <= 50 && !piece.startsWith(' '))
  assert.equal(speechPieces(words, 50).join(' '), words)
  assert.deepEqual(speechPieces('אבגדהוזחטיכלמנ', 5), ['אבגדה', 'וזחטי', 'כלמנ'])
})
test('cycles the speed chip', () => {
  assert.equal(nextRate(1), 0.5); assert.equal(nextRate(0.5), 0.25); assert.equal(nextRate(0.25), 1)
  assert.equal(rateLabel(0.5), '½×')
})

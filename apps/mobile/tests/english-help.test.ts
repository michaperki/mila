import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alignment, englishTokens, helpFor, targetPlaces } from '../src/lib/english-help.ts'

const sentence = 'היא לָחֲשָׁה לו בשקט, כי הוא ישן.'
const english = 'She whispered to him quietly (f.), because he was asleep.'
const renders = [
  { place: 0, t: 'She' }, { place: 1, t: 'whispered' }, { place: 2, t: 'to him' }, { place: 3, t: 'quietly' },
  { place: 4, t: 'because' }, { place: 5, t: 'he' }, { place: 6, t: 'was asleep' },
]
const tokens = englishTokens(english)
const aligned = alignment(tokens, renders)
const target = targetPlaces(sentence, 'לחשה')
const at = (word: string) => tokens.findIndex(token => token.text.replace(/[,.()]/g, '') === word)

test('an English word held gives the Hebrew that says it, as the sentence writes it', () => {
  assert.deepEqual(helpFor(at('quietly'), aligned, sentence, target), { kind: 'hebrew', places: [3], hebrew: 'בשקט' })
  assert.deepEqual(helpFor(at('him'), aligned, sentence, target), { kind: 'hebrew', places: [2], hebrew: 'לו' })
  assert.deepEqual(helpFor(at('asleep'), aligned, sentence, target), { kind: 'hebrew', places: [6], hebrew: 'ישן' })
})

test('never the card\'s own word, and says so when English has a word Hebrew doesn\'t', () => {
  assert.deepEqual([...target], [1])
  assert.deepEqual(helpFor(at('whispered'), aligned, sentence, target), { kind: 'target' })
  assert.deepEqual(helpFor(at('f'), aligned, sentence, target), { kind: 'none' })
  const noCopula = alignment(englishTokens('He was asleep.'), [{ place: 0, t: 'He' }, { place: 1, t: 'asleep' }])
  assert.deepEqual(helpFor(1, noCopula, 'הוא ישן', new Set()), { kind: 'none' })
})

test('a word that comes twice is matched in order, and a cue in brackets is never matched', () => {
  const twice = alignment(englishTokens('He saw that he was late.'), [{ place: 0, t: 'He' }, { place: 2, t: 'he' }])
  assert.deepEqual([...twice.entries()], [[0, [0]], [3, [2]]])
  const cue = alignment(englishTokens('You (f.) saw you.'), [{ place: 0, t: 'f.' }])
  assert.equal(cue.size, 0)
})

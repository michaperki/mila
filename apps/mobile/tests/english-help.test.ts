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

test('an English word left over says not found when some Hebrew word wasn\'t found as written', () => {
  const tokens = englishTokens('The girl loves to pet the neighbors\' cat.')
  const paraphrased = alignment(tokens, [{ place: 0, t: 'The girl' }, { place: 3, t: 'the kitty' }])
  // "the cat" is found, with the neighbors' between: the Hebrew's own way of saying it.
  assert.deepEqual(helpFor(7, alignment(tokens, [{ place: 4, t: 'the cat' }]), 'הילדה אוהבת ללטף את החתול של השכנים', new Set([2])), { kind: 'hebrew', places: [4], hebrew: 'החתול' })
  assert.equal(paraphrased.unplaced, 1)
  assert.deepEqual(helpFor(7, paraphrased, 'הילדה אוהבת ללטף את החתול של השכנים', new Set([2])), { kind: 'unknown' })
})

test('an English phrase with words between its own still finds its Hebrew word', () => {
  const tokens = englishTokens('They would only come when they needed money.')
  const aligned = alignment(tokens, [{ place: 0, t: 'would come' }, { place: 1, t: 'only' }, { place: 2, t: 'when they needed' }, { place: 3, t: 'money' }])
  assert.equal(aligned.unplaced, 0)
  assert.deepEqual(helpFor(3, aligned, 'יבואו רק כשצריך כסף', new Set()), { kind: 'hebrew', places: [0], hebrew: 'יבואו' })
  assert.deepEqual(helpFor(2, aligned, 'יבואו רק כשצריך כסף', new Set()), { kind: 'hebrew', places: [1], hebrew: 'רק' })
})

test('a word that comes twice is matched in order, and a cue in brackets is never matched', () => {
  const twice = alignment(englishTokens('He saw that he was late.'), [{ place: 0, t: 'He' }, { place: 2, t: 'he' }])
  assert.deepEqual([...twice.entries()], [[0, [0]], [3, [2]]])
  const cue = alignment(englishTokens('You (f.) saw you.'), [{ place: 0, t: 'f.' }])
  assert.equal(cue.size, 0)
  // A person cue between the words of one Hebrew word's English doesn't keep them apart.
  const person = alignment(englishTokens('Yesterday you 👩 were tired.'), [{ place: 0, t: 'Yesterday' }, { place: 1, t: 'you were' }, { place: 2, t: 'tired' }])
  assert.deepEqual([...person.entries()], [[0, [0]], [1, [1]], [3, [1]], [4, [2]]])
})

test('a card\'s sentences take their word data once prepared, and only those without it need preparing', async () => {
  const { hasWords, needsWords, withSentenceWords } = await import('../src/lib/english-help.ts')
  const card = { key: 'k', sentence: 'היא לחשה', translation: 'She whispered.', variants: [{ sentence: 'היא לחשה לו', translation: 'She whispered to him.', glosses: [{ i: 0, lemma: 'היא', en: 'she', t: 'She' }] }] }
  assert.equal(needsWords(card), true)
  assert.equal(hasWords(card.variants[0]), true)
  const entry = withSentenceWords({ id: 'x', forms: [card, { key: 'other' }] }, 'k', [{ variant: -1, glosses: [{ i: 0, lemma: '', en: 'she', t: 'She' }] }])
  assert.equal(needsWords(entry.forms[0]), false)
  assert.deepEqual(entry.forms[0].variants, card.variants)
  assert.deepEqual(entry.forms[1], { key: 'other' })
  assert.equal(withSentenceWords(entry, 'missing', [{ variant: -1, glosses: [] }]), entry)
})

test('words English puts in another order, or shares, are still found (the parking problem)', () => {
  const sentence = 'אין פתרון פשוט לבעיית החניה בשכונה'
  const tokens = englishTokens('There\'s no simple solution to the parking problem in the neighborhood.')
  const aligned = alignment(tokens, [{ place: 0, t: 'There\'s no' }, { place: 2, t: 'simple' }, { place: 3, t: 'to the problem' }, { place: 4, t: 'the parking' }, { place: 5, t: 'in the neighborhood' }])
  assert.equal(aligned.unplaced, 0)
  const target = targetPlaces(sentence, 'פתרון')
  assert.deepEqual(helpFor(6, aligned, sentence, target), { kind: 'hebrew', places: [4], hebrew: 'החניה' })
  assert.deepEqual(helpFor(5, aligned, sentence, target), { kind: 'hebrew', places: [3, 4], hebrew: 'לבעיית החניה' })
})

test('contractions and possessives are found by their pieces, a word of its own first', () => {
  const sentence = 'אנחנו משוכנעות בהחלטה שלנו ולא נשנה את דעתנו'
  const tokens = englishTokens('We\'re convinced of our decision and we won\'t change our minds.')
  const aligned = alignment(tokens, [{ place: 0, t: 'We' }, { place: 2, t: 'of decision' }, { place: 3, t: 'our' }, { place: 4, t: 'and won\'t' }, { place: 5, t: 'we change' }, { place: 7, t: 'our minds' }])
  const help = (i: number) => helpFor(i, aligned, sentence, new Set([1]))
  assert.equal(help(0).kind === 'hebrew' && help(0).hebrew, 'אנחנו')
  assert.equal(help(8).kind === 'hebrew' && help(8).hebrew, 'נשנה')
  const doctor = englishTokens('The doctor\'s secretary made me an appointment.')
  const placed = alignment(doctor, [{ place: 1, t: '\'s' }, { place: 2, t: 'The doctor' }, { place: 3, t: 'made' }])
  assert.equal(placed.unplaced, 0)
  assert.deepEqual(helpFor(1, placed, 'המזכירה של הרופא קבעה', new Set([0])), { kind: 'hebrew', places: [1, 2], hebrew: 'של הרופא' })
})

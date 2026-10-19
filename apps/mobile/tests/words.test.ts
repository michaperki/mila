import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encountersOf, expressionsWith, headOf, lemmaKey, matches, savedByLemma, savedBySurface, savedKey, savedKeysOf, savedTapsOf, tapKey, vocabId } from '../src/lib/words.ts'

const encounter = (surface: string, context: string, at: number) => ({ surface, meaning: 'm', context, at })

test('encounters come newest first; an older entry has its one context as an encounter', () => {
  const entry = { id: 'a', lemma: 'לְהַדְבִּיק', gloss: 'to stick', createdAt: 1, encounters: [encounter('הדביק', 'one', 1), encounter('מדביקה', 'two', 2)] }
  assert.deepEqual(encountersOf(entry).map(item => item.surface), ['מדביקה', 'הדביק'])
  const older = { id: 'b', lemma: 'לְמַעֲשֶׂה', gloss: 'in fact', createdAt: 5, surface: 'למעשה', context: 'למעשה זה עבד' }
  assert.equal(encountersOf(older)[0].context, 'למעשה זה עבד')
  assert.equal(encountersOf(older)[0].meaning, 'in fact')
  assert.deepEqual(encountersOf({ id: 'c', lemma: 'x', gloss: 'y', createdAt: 1 }), [])
})

test('a word counts as saved per sentence', () => {
  const keys = savedKeysOf([{ id: 'a', lemma: 'x', gloss: 'y', createdAt: 1, encounters: [encounter('x', 'one', 1)] }])
  assert.equal(keys.has(savedKey('a', 'one')), true)
  assert.equal(keys.has(savedKey('a', 'two')), false)
})

test('a saved word is found from the tap alone: what was tapped and its sentence', () => {
  const taps = savedTapsOf([{ id: 'a', lemma: 'לְהַדְבִּיק', gloss: 'to stick', createdAt: 1, encounters: [encounter('הדביק', 'one', 1)] }])
  assert.equal(taps.get(tapKey('הדביק', 'one'))?.id, 'a')
  assert.equal(taps.get(tapKey('הדביק', 'two')), undefined)
  assert.equal(taps.get(tapKey('לְהַדְבִּיק', 'one')), undefined)
})

test('identifies a word by its plain dictionary form, whatever vowels it was given', () => {
  assert.equal(lemmaKey('לִכְתּוֹב'), 'לכתוב')
  assert.equal(vocabId('לִכְתּוֹב'), vocabId('לכתוב'))
  assert.equal(lemmaKey('בֵּית־סֵפֶר'), 'בית ספר')
  assert.equal(lemmaKey(' בית  ספר, '), 'בית ספר')
  assert.equal(lemmaKey("צ'יפס"), 'צ׳יפס')
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

test('an expression and the word it is built on find each other', () => {
  const word = { id: 'w', lemma: 'לַעֲבֹר', lemmaPlain: 'לעבור', gloss: 'to pass', createdAt: 0, partOfSpeech: 'verb' }
  const expression = { id: 'e', lemma: 'לַעֲבֹר דֶּרֶךְ', gloss: 'to go through', createdAt: 0, partOfSpeech: 'expression', head: { lemma: 'לַעֲבֹר', lemmaPlain: 'לעבור', partOfSpeech: 'verb' } }
  const other = { id: 'o', lemma: 'לִכְתֹּב', gloss: 'to write', createdAt: 0, partOfSpeech: 'verb' }
  assert.deepEqual(expressionsWith([word, expression, other], word).map(item => item.id), ['e'])
  assert.equal(headOf([word, expression, other], expression)?.id, 'w')
  assert.equal(headOf([expression, other], expression), undefined)
})

test('a saved word is found in any sentence: by its dictionary form, or before that by a form saved', () => {
  const entry = { id: vocabId('לצעוק'), lemma: 'לִצְעֹק', lemmaPlain: 'לצעוק', gloss: 'to shout', createdAt: 1, frequency: 1,
    encounters: [{ surface: 'צעק', meaning: 'he yelled', context: 'הוא צעק עליה', at: 1 }] }
  assert.equal(savedByLemma([entry]).get(lemmaKey('לִצְעוֹק'))?.id, entry.id)
  assert.equal(savedBySurface([entry]).get(lemmaKey('צעק'))?.id, entry.id)
  assert.equal(savedBySurface([entry]).get(lemmaKey('וצעק')), undefined)
})

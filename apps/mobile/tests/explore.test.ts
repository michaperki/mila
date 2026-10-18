import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entryFrom, familyGroups, type FamilyWord, hasRoot, hasTable, rootOf, savedAs, tableMeaning } from '../src/lib/explore.ts'
import type { FormCard, VocabEntry } from '../src/lib/types'

const entry = (extra: Partial<VocabEntry> = {}): VocabEntry => ({ id: 'native-x', lemma: 'לִכְתֹּב', gloss: 'to write, to compose', createdAt: 1, ...extra })
const word = (lemma: string, partOfSpeech: string, extra: Partial<FamilyWord> = {}): FamilyWord =>
  ({ lemma, lemmaPlain: lemma, partOfSpeech, binyan: '', gender: '', meaning: lemma, ...extra })

test('a root is its letters joined with a maqaf, however it was written', () => {
  assert.equal(rootOf('כ־ת־ב'), 'כ־ת־ב')
  assert.equal(rootOf('כ-ת-ב'), 'כ־ת־ב')
  assert.equal(rootOf('כתב'), 'כ־ת־ב')
  assert.equal(rootOf('כּ.תּ.ב'), 'כ־ת־ב')
  assert.equal(rootOf(''), '')
})

test('only a word with a real root can be explored, and only verbs, adjectives and nouns have tables', () => {
  assert.ok(hasRoot(entry({ root: 'כ־ת־ב' })))
  assert.ok(!hasRoot(entry({ root: '' })))
  assert.ok(!hasRoot(entry({ root: 'כ' })))
  assert.ok(!hasRoot(entry()))
  assert.ok(hasTable(entry({ partOfSpeech: 'verb' })))
  assert.ok(hasTable(entry({ partOfSpeech: 'noun' })))
  assert.ok(!hasTable(entry({ partOfSpeech: 'phrase' })))
  assert.ok(!hasTable(entry()))
})

test('a table is written in the word\'s first meaning card, else the first sense of its gloss', () => {
  assert.equal(tableMeaning(entry()), 'to write')
  const sense = { key: 'meanings:sense1', stage: 'meanings', slot: 'sense1', he: 'לִכְתֹּב', en: 'to write, to compose', sentence: '', mark: '', translation: '' } satisfies FormCard
  assert.equal(tableMeaning(entry({ forms: [sense] })), 'to write, to compose')
})

test('a family is grouped verbs, nouns, adjectives, then the rest, keeping its order', () => {
  const groups = familyGroups([word('מכתב', 'noun'), word('לכתוב', 'verb'), word('כתוב', 'adjective'), word('להתכתב', 'verb'), word('בכתב', 'adverb')])
  assert.deepEqual(groups.map(group => [group.label, group.words.map(item => item.lemma)]), [
    ['Verbs', ['לכתוב', 'להתכתב']], ['Nouns', ['מכתב']], ['Adjectives', ['כתוב']], ['Other words', ['בכתב']],
  ])
  assert.deepEqual(familyGroups([word('מכתב', 'noun')]).map(group => group.label), ['Nouns'])
})

test('a family word is matched to a saved word by its plain spelling, whatever its vowels', () => {
  const saved = [entry({ id: 'a', lemma: 'מִכְתָּב', lemmaPlain: 'מכתב' }), entry({ id: 'b', lemma: 'לִכְתֹּב' })]
  assert.equal(savedAs(saved, word('מִכְתָּב', 'noun', { lemmaPlain: 'מכתב' }))?.id, 'a')
  assert.equal(savedAs(saved, word('לִכְתֹּב', 'verb', { lemmaPlain: '' }))?.id, 'b')
  assert.equal(savedAs(saved, word('כָּתוּב', 'adjective', { lemmaPlain: 'כתוב' })), undefined)
})

test('a family word saved keeps its grammar and root, and leaves out what it lacks', () => {
  const saved = entryFrom(word('מִכְתָּב', 'noun', { lemmaPlain: 'מכתב', gender: 'masculine', meaning: 'letter' }), 'כ־ת־ב', 'native-id')
  assert.equal(saved.id, 'native-id')
  assert.equal(saved.gloss, 'letter')
  assert.equal(saved.root, 'כ־ת־ב')
  assert.equal(saved.gender, 'masculine')
  assert.equal(saved.partOfSpeech, 'noun')
  assert.ok(!('binyan' in saved))
  assert.equal(saved.encounters, undefined)
})

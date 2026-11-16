import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hintEvent, hintFor } from '../src/lib/hints.ts'
import type { VocabEntry } from '../src/lib/types.ts'

const target = { id: 'native-צעק', lemma: 'לִצְעֹק', lemmaPlain: 'לצעוק' }
const joy = { id: 'native-שמחה', lemma: 'שִׂמְחָה', lemmaPlain: 'שמחה', gloss: 'joy', encounters: [{ surface: 'בשמחה', context: 'x' }] } as unknown as VocabEntry
const shout = { ...target, gloss: 'to shout', encounters: [{ surface: 'וצעק', context: 'y' }] } as unknown as VocabEntry
const saved = { byLemma: new Map([['שמחה', joy], ['לצעוק', shout]]), bySurface: new Map([['בשמחה', joy], ['וצעק', shout]]) }
const form = { glosses: [{ i: 0, lemma: 'הוּא', en: 'he' }, { i: 2, lemma: 'לצעוק', en: 'shouted' }] }

test('a hint comes from the card, then a saved word, and never gives the target away', () => {
  assert.deepEqual(hintFor(form, target, 'הוא', 0, saved), { at: 0, word: 'הוא', en: 'he', lemma: 'הוּא', from: 'card' })
  assert.deepEqual(hintFor({}, target, 'בשמחה', 3, saved), { at: 3, word: 'בשמחה', en: 'joy', lemma: 'שמחה', from: 'saved' })
  assert.equal(hintFor(form, target, 'צעק', 2, saved), 'own')
  assert.equal(hintFor({}, target, 'וצעק', 5, saved), 'own')
  assert.equal(hintFor({}, target, 'מחר', 4, saved), null)
})

test('a hint is logged as a lookup on the card\'s question side', () => {
  assert.deepEqual(hintEvent({ at: 3, word: 'בשמחה', en: 'joy', lemma: 'שמחה', from: 'saved' }, { key: 'native-צעק:past:3sg', position: 7 }, true),
    { key: 'native-צעק:past:3sg', position: 7, word: 'בשמחה', place: 3, hint: true, own: false, saved: true, front: 'he', glossed: false, from: 'saved', lemma: 'שמחה' })
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encountersOf, savedKey, savedKeysOf } from '../src/lib/words.ts'

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

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORIES, LEVELS as SERVER_LEVELS, REGISTERS as SERVER_REGISTERS, levelOf as serverLevelOf } from '../../web/netlify/functions/lib/taxonomy.ts'
import { CATEGORY_LABELS, inTheme, LEVELS, levelOf, organisationLine, REGISTERS, themeCounts, themesOf } from '../src/lib/taxonomy.ts'

test('the phone knows the server\'s taxonomy, by the same names', () => {
  assert.deepEqual(Object.keys(CATEGORY_LABELS), Object.keys(CATEGORIES))
  for (const [id, label] of Object.entries(CATEGORY_LABELS)) assert.equal(label, CATEGORIES[id as keyof typeof CATEGORIES].label)
  assert.deepEqual([...LEVELS], [...SERVER_LEVELS])
  assert.deepEqual([...REGISTERS], Object.keys(SERVER_REGISTERS))
  for (const rank of [1, 1000, 1001, 3000, 9999, 10001]) assert.equal(levelOf({ rank }), serverLevelOf(rank))
})

test('level comes from frequency, else from an import', () => {
  assert.equal(levelOf({ rank: 2000, level: 'rare' }), 'common')
  assert.equal(levelOf({ level: 'rare' }), 'rare')
  assert.equal(levelOf({ level: 'weird' }), undefined)
})

test('themes are counted, most words first, with the words not yet organised apart', () => {
  const words = [
    { categories: ['speech', 'feelings'], taxonomy: 'v1' }, { categories: ['speech'], taxonomy: 'v1' },
    { categories: [], taxonomy: 'v1' }, {}, { categories: ['someday'], taxonomy: 'v9' },
  ]
  assert.deepEqual(themeCounts(words), { themes: [{ theme: 'speech', count: 2 }, { theme: 'feelings', count: 1 }], unsorted: 1 })
  assert.deepEqual(words.filter(word => inTheme(word, 'unsorted')).length, 1)
  assert.equal(words.filter(word => inTheme(word, 'speech')).length, 2)
  assert.deepEqual(themesOf({ categories: ['someday', 'mind'] }), ['mind'])
  assert.equal(organisationLine({ categories: ['speech', 'feelings'], register: 'literary', rank: 5000 }), 'Speech and sounds · Feelings · literary · less common')
})

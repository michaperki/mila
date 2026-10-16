import { test } from 'node:test'
import assert from 'node:assert/strict'
import { answer, choicesFor, drillOf, missingStages, practiceQueue, spread, stageState, statusOf, unlockedStages } from '../src/lib/forms.ts'
import type { FormCard, VocabEntry } from '../src/lib/types.ts'

const DAY = 24 * 60 * 60 * 1000
const now = new Date(2026, 9, 16, 10).getTime()
const form = (key: string, extra: Partial<FormCard> = {}): FormCard => {
  const [stage, slot] = key.split(':')
  return { key, stage, slot, he: key, en: key, sentence: '', mark: key, translation: '', ...extra }
}
const solid = { goodDays: ['2026-10-14', '2026-10-15'], correct: 2, review: { due: now + 3 * DAY, interval: 3, reps: 2, lapses: 0, first: now - 2 * DAY } }
const verb = (forms: FormCard[], extra: Partial<VocabEntry> = {}): VocabEntry => ({ id: 'open', lemma: 'לִפְתֹּחַ', gloss: 'to open', createdAt: 1, partOfSpeech: 'verb', forms, ...extra })

test('a stage opens when every form before it is solid, or when the learner marks it known', () => {
  const start = verb([form('infinitive:inf')])
  assert.deepEqual(unlockedStages(start).map(stage => stage.key), ['infinitive'])
  assert.deepEqual(missingStages(verb([])), ['infinitive'])
  const infinitiveDone = verb([form('infinitive:inf', solid)])
  assert.deepEqual(unlockedStages(infinitiveDone).map(stage => stage.key), ['infinitive', 'present'])
  assert.deepEqual(missingStages(infinitiveDone), ['present'])
  // One solid present form isn't enough; all of them must be.
  const halfPresent = verb([form('infinitive:inf', solid), form('present:m.sg', solid), form('present:f.sg', { goodDays: ['2026-10-16'] })])
  assert.equal(stageState(halfPresent, 'present'), 'learning')
  assert.equal(stageState(halfPresent, 'past'), 'locked')
  const skipped = verb(halfPresent.forms!, { known: ['present'] })
  assert.equal(stageState(skipped, 'present'), 'known')
  assert.equal(stageState(skipped, 'past'), 'learning')
  assert.equal(statusOf(verb([form('infinitive:inf')])), 'new')
  assert.equal(statusOf(halfPresent), 'learning')
})

test('a form is solid after Got it on two different days; Hard counts as right but not toward that', () => {
  let card = form('past:3pl')
  card = { ...card, ...answer(card, 'good', now) }
  card = { ...card, ...answer(card, 'good', now + 60_000) }
  assert.deepEqual(card.goodDays, ['2026-10-16'])
  card = { ...card, ...answer(card, 'hard', now + DAY) }
  assert.equal(card.correct, 3); assert.equal(card.goodDays!.length, 1)
  card = { ...card, ...answer(card, 'good', now + 2 * DAY) }
  assert.equal(card.goodDays!.length, 2)
  assert.equal(drillOf(form('past:1sg')), 'read')
  assert.equal(drillOf(card), 'choose')
})

test('the queue takes reviews first, then new cards in turns between words, capped per day', () => {
  const due = { review: { due: now - DAY, interval: 1, reps: 1, lapses: 0, first: now - 2 * DAY } }
  const a = verb([form('infinitive:inf', solid), form('present:m.sg', due), form('present:f.sg'), form('present:m.pl')], { id: 'a', createdAt: 1 })
  const b = verb([form('infinitive:inf')], { id: 'b', createdAt: 2 })
  const queue = practiceQueue([b, a], now)
  assert.deepEqual(queue.map(card => `${card.entry.id} ${card.form.key}`), ['a present:m.sg', 'b infinitive:inf', 'a present:f.sg', 'a present:m.pl'])
  // Two new cards already started today leave room for one more with a cap of three.
  const started = { review: { due: now + DAY, interval: 1, reps: 1, lapses: 0, first: now - 60_000 } }
  const c = verb([form('infinitive:inf', started), form('noun:x', started)], { id: 'c', partOfSpeech: 'noun', forms: [form('singular:sg', started), form('plural:pl', started)] })
  assert.equal(practiceQueue([a, b, c], now, 3).filter(card => !card.form.review).length, 1)
})

test('cards of one word are kept apart when something else can go between', () => {
  const x = verb([], { id: 'x' }); const y = verb([], { id: 'y' })
  const cards = [{ entry: x, form: form('p:1') }, { entry: x, form: form('p:2') }, { entry: y, form: form('p:3') }]
  assert.deepEqual(spread(cards).map(card => card.form.key), ['p:1', 'p:3', 'p:2'])
})

test('choices are the word\'s own forms, same stage first, in a stable order', () => {
  const entry = verb([form('past:1sg', { he: 'פָּתַחְתִּי' }), form('past:1pl', { he: 'פָּתַחְנוּ' }), form('past:3pl', { he: 'פָּתְחוּ' }), form('present:m.sg', { he: 'פּוֹתֵחַ' }), form('past:2pl.m', { he: 'פְּתַחְתֶּם' })])
  const target = entry.forms![2]
  const options = choicesFor(entry, target, 'seed')!
  assert.equal(options.length, 4)
  assert.ok(options.includes('פָּתְחוּ'))
  assert.ok(!options.includes('פּוֹתֵחַ'))
  assert.deepEqual(choicesFor(entry, target, 'seed'), options)
  assert.equal(choicesFor(verb([form('infinitive:inf'), form('present:m.sg')]), form('infinitive:inf'), 's'), null)
})

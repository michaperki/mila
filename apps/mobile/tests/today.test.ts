import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayOf } from '../src/lib/forms.ts'
import { minutesFor, parseLastRead, readyStages, studiedDays, weekDots } from '../src/lib/today.ts'
import type { FormCard, VocabEntry } from '../src/lib/types'

const DAY = 86_400_000
const now = new Date(2026, 9, 18, 12).getTime()
const form = (key: string, extra: Partial<FormCard> = {}): FormCard => {
  const [stage, slot] = key.split(':')
  return { key, stage, slot, he: key, en: key, sentence: '', mark: key, translation: '', ...extra }
}
const verb = (forms: FormCard[], extra: Partial<VocabEntry> = {}): VocabEntry => ({ id: 'open', lemma: 'לִפְתֹּחַ', gloss: 'to open', createdAt: 1, partOfSpeech: 'verb', forms, ...extra })
const solid = (key: string) => form(key, { review: { due: now + 9 * DAY, interval: 9, reps: 3, lapses: 0, last: now - 2 * DAY }, correct: 3, goodDays: ['2026-10-10', '2026-10-12'] })

test('the week shows days studied on this phone and in the saved words, today last', () => {
  const entries = [verb([form('meanings:sense1', { review: { due: now, interval: 1, reps: 1, lapses: 0, last: now - DAY } })])]
  const dots = weekDots(studiedDays(entries, [dayOf(now - 3 * DAY)]), now)
  assert.equal(dots.length, 7)
  assert.deepEqual(dots.map(dot => dot.studied), [false, false, false, true, false, true, false])
  assert.ok(dots[6].today)
  assert.equal(dots[6].letter, 'S')
})

test('a stage counts as ready when progress opened it and nothing in it has been studied', () => {
  // A verb starts with meanings and present; past opens once both are solid.
  const learning = verb([solid('meanings:sense1'), solid('present:m.sg'), solid('present:f.sg'), solid('present:m.pl'), solid('present:f.pl')])
  assert.deepEqual(readyStages([learning]).map(item => item.label), ['Past'])
  const started = verb([...learning.forms!, form('past:1sg', { review: { due: now, interval: 1, reps: 1, lapses: 0 } })])
  assert.deepEqual(readyStages([started]), [])
  assert.deepEqual(readyStages([verb([form('meanings:sense1')])]), [])
  // A stage marked known isn't offered, and marking it known opens the next.
  assert.deepEqual(readyStages([{ ...learning, known: ['past'] }]).map(item => item.label), ['Future'])
})

test('due cards take about ten seconds each; a bad saved position is ignored', () => {
  assert.equal(minutesFor(1), 1)
  assert.equal(minutesFor(30), 5)
  assert.equal(parseLastRead('{"id":"a","segment":3,"title":"t","at":1}')?.segment, 3)
  assert.equal(parseLastRead(''), null)
  assert.equal(parseLastRead('{"id":"a"}'), null)
})

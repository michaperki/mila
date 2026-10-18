import { test } from 'node:test'
import assert from 'node:assert/strict'
import { answer, cardKey, choicesFor, countsOf, deckOf, isKnownWord, missingStages, newCards, quizOf, spread, stageState, statusOf, unlockedStages } from '../src/lib/forms.ts'
import type { FormCard, VocabEntry } from '../src/lib/types.ts'

const DAY = 24 * 60 * 60 * 1000
const now = new Date(2026, 9, 16, 10).getTime()
const form = (key: string, extra: Partial<FormCard> = {}): FormCard => {
  const [stage, slot] = key.split(':')
  return { key, stage, slot, he: key, en: key, sentence: '', mark: key, translation: '', ...extra }
}
const solid = { goodDays: ['2026-10-14', '2026-10-15'], correct: 2, review: { due: now + 3 * DAY, interval: 3, reps: 2, lapses: 0, first: now - 2 * DAY } }
const verb = (forms: FormCard[], extra: Partial<VocabEntry> = {}): VocabEntry => ({ id: 'open', lemma: 'לִפְתֹּחַ', gloss: 'to open', createdAt: 1, partOfSpeech: 'verb', forms, ...extra })

test('a verb opens with its meanings and present together; past waits until both are done', () => {
  assert.deepEqual(unlockedStages(verb([form('meanings:sense1')])).map(stage => stage.key), ['meanings', 'present'])
  assert.deepEqual(missingStages(verb([])), ['meanings', 'present'])
  const present = [form('present:m.sg', solid), form('present:f.sg', { goodDays: ['2026-10-16'] })]
  const halfway = verb([form('meanings:sense1', solid), ...present])
  assert.equal(stageState(halfway, 'present'), 'learning')
  assert.equal(stageState(halfway, 'past'), 'locked')
  // Marking present known opens past only once the meanings are done too.
  assert.equal(stageState(verb([form('meanings:sense1'), ...present], { known: ['present'] }), 'past'), 'locked')
  const skipped = verb(halfway.forms!, { known: ['present'] })
  assert.equal(stageState(skipped, 'present'), 'known')
  assert.equal(stageState(skipped, 'past'), 'learning')
  assert.deepEqual(missingStages(skipped), ['past'])
  assert.equal(statusOf(verb([form('meanings:sense1')])), 'new')
  assert.equal(statusOf(halfway), 'learning')
})

test('meanings come before the present tense, and present waits until the meanings exist', () => {
  const entry = verb([form('present:m.sg'), form('meanings:sense2'), form('meanings:sense1')])
  assert.deepEqual(newCards(entry).map(card => card.key), ['meanings:sense2', 'meanings:sense1', 'present:m.sg'])
  assert.deepEqual(newCards(verb([form('present:m.sg')])), [])
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
})

test('the deck: word cards and open forms, due first, then new (oldest word first), then the rest', () => {
  const due = { review: { due: now - DAY, interval: 1, reps: 1, lapses: 0, first: now - 2 * DAY } }
  const a = verb([form('meanings:sense1', solid), form('present:m.sg', due), form('present:f.sg')], { id: 'a', createdAt: 1, review: { due: now + 2 * DAY, interval: 3, reps: 2, lapses: 0 } })
  const b = verb([form('meanings:sense1')], { id: 'b', createdAt: 2 })
  const keys = (cards: ReturnType<typeof deckOf>) => cards.map(cardKey)
  // a's due present card; new cards, oldest word first (b's word card goes between a's two);
  // then the rest by due date: a's word card (in two days) before its meaning (in three).
  const smart = keys(deckOf([b, a], { include: 'both', order: 'smart' }, now))
  assert.deepEqual(smart, ['a:present:m.sg', 'b:word', 'a:present:f.sg', 'b:meanings:sense1', 'a:word', 'a:meanings:sense1'])
  assert.deepEqual(keys(deckOf([a, b], { include: 'words', order: 'smart' }, now)), ['b:word', 'a:word'])
  assert.ok(keys(deckOf([a, b], { include: 'sentences', order: 'smart' }, now)).every(key => !key.endsWith(':word')))
  // Shuffled: the same cards, and the same order for the same seed.
  const shuffled = keys(deckOf([a, b], { include: 'both', order: 'shuffle' }, now, 'seed'))
  assert.deepEqual([...shuffled].sort(), [...smart].sort())
  assert.deepEqual(keys(deckOf([a, b], { include: 'both', order: 'shuffle' }, now, 'seed')), shuffled)
  // Due today counts word cards and form cards.
  assert.equal(countsOf([a, b, verb([], { id: 'c', review: { due: now, interval: 1, reps: 1, lapses: 0 } })], now).due, 2)
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
  assert.equal(choicesFor(verb([form('meanings:sense1'), form('present:m.sg')]), form('meanings:sense1'), 's'), null)
})

test('studying ahead keeps the schedule on Got it; Hard brings it to tomorrow, Again resets it', () => {
  const later = { review: { due: now + 5 * DAY, interval: 3, reps: 2, lapses: 0, last: now - 3 * DAY } }
  const ahead = answer(form('present:m.sg', later), 'good', now)
  assert.equal(ahead.review!.due, now + 5 * DAY); assert.equal(ahead.review!.interval, 3); assert.equal(ahead.review!.last, now)
  assert.equal(answer(form('present:m.sg', later), 'hard', now).review!.due, now + DAY)
  assert.equal(answer(form('present:m.sg', later), 'again', now).review!.due, now)
  // A word card is answered with the entry's own review.
  assert.equal(answer({ review: undefined }, 'good', now).review!.interval, 1)
})

test('word and meanings cards are quizzed with the learner\'s other saved words', () => {
  const open = verb([form('meanings:sense1', { he: 'לִפְתֹּחַ' })])
  const others = [
    verb([], { id: 'close', lemma: 'לִסְגֹּר', gloss: 'to close, to shut' }),
    verb([], { id: 'write', lemma: 'לִכְתֹּב', gloss: 'to write' }),
    verb([], { id: 'book', lemma: 'סֵפֶר', gloss: 'book', partOfSpeech: 'noun' }),
    verb([], { id: 'idiom', lemma: 'בְּעֶצֶם', gloss: 'actually', partOfSpeech: 'phrase' }),
  ]
  const all = [open, ...others]
  // A word card in Hebrew asks for its meaning (first senses only); in English, for the word.
  const english = quizOf(all, { entry: open, form: null }, true, 'seed')!
  assert.equal(english.answer, 'to open')
  assert.deepEqual([...english.options].sort(), ['book', 'to close', 'to open', 'to write'])
  const hebrew = quizOf(all, { entry: open, form: null }, false, 'seed')!
  assert.equal(hebrew.answer, 'לִפְתֹּחַ')
  assert.ok(!hebrew.options.includes('בְּעֶצֶם'))
  assert.deepEqual(quizOf(all, { entry: open, form: null }, false, 'seed'), hebrew)
  // A meanings card chooses the word for its sentence.
  assert.equal(quizOf(all, { entry: open, form: open.forms![0] }, true, 'seed')!.answer, 'לִפְתֹּחַ')
  // Too few other words: no quiz.
  assert.equal(quizOf([open, others[0]], { entry: open, form: null }, true, 'seed'), null)
})

test('a word marked known in every stage leaves studying', () => {
  const now = Date.now()
  const known = verb([form('meanings:sense1', { review: { due: now - 1, interval: 1, reps: 1, lapses: 0 } })], { review: { due: now - 1, interval: 1, reps: 1, lapses: 0 }, known: ['meanings', 'present', 'past', 'future', 'imperative', 'noun'] })
  assert.ok(isKnownWord(known))
  assert.deepEqual(deckOf([known], { include: 'both', order: 'smart' }, now), [])
  assert.equal(countsOf([known], now).due, 0)
  assert.ok(!isKnownWord({ ...known, known: ['meanings'] }))
})

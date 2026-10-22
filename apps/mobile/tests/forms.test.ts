import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ago, assess, type Card, cardKey, cardState, checkpointStages, choicesFor, countsOf, deckOf, followUps, freshStages, isKnownWord, isMet, missingStages, newCards, openStages, quizOf, recommendedStages, spread, stageProgress, stageState, statusOf } from '../src/lib/forms.ts'
import type { FormCard, VocabEntry } from '../src/lib/types.ts'

const DAY = 24 * 60 * 60 * 1000
const now = new Date(2026, 9, 16, 10).getTime()
const form = (key: string, extra: Partial<FormCard> = {}): FormCard => {
  const [stage, slot] = key.split(':')
  return { key, stage, slot, he: key, en: key, sentence: '', mark: key, translation: '', ...extra }
}
const familiar = { results: [true, true], last: now - DAY }
const learning = { results: [true, false], last: now - DAY }
const verb = (forms: FormCard[], extra: Partial<VocabEntry> = {}): VocabEntry => ({ id: 'open', lemma: 'לִפְתֹּחַ', gloss: 'to open', createdAt: 1, partOfSpeech: 'verb', forms, ...extra })
const present = (results: (typeof familiar | typeof learning)[]) => ['m.sg', 'f.sg', 'm.pl', 'f.pl'].map((slot, i) => form(`present:${slot}`, results[i] ?? {}))

test('a card is familiar once its latest two answers were right; a miss only makes it learning again', () => {
  assert.equal(cardState(undefined), 'new')
  assert.equal(cardState([true]), 'learning')
  assert.equal(cardState([false, true, true]), 'familiar')
  assert.equal(cardState([true, true, false]), 'learning')
  let card: FormCard = form('past:3pl')
  card = { ...card, ...assess(card, true, now) }
  card = { ...card, ...assess(card, false, now + 1) }
  card = { ...card, ...assess(card, true, now + 2) }
  card = { ...card, ...assess(card, true, now + 3) }
  assert.deepEqual(card.results, [false, true, true]); assert.equal(card.last, now + 3)
})

test('a stage is familiar at half its cards, ready with all but one of four or more, or after two good checkpoints', () => {
  const entry = (results: Parameters<typeof present>[0], extra: Partial<VocabEntry> = {}) => verb([form('meanings:sense1', familiar), ...present(results)], extra)
  assert.equal(stageProgress(entry([]), 'present'), 'new')
  assert.equal(stageProgress(entry([learning]), 'present'), 'learning')
  assert.equal(stageProgress(entry([familiar, familiar]), 'present'), 'familiar')
  assert.equal(stageProgress(entry([familiar, familiar, familiar, learning]), 'present'), 'ready')
  // A one-card stage needs its card.
  assert.equal(stageProgress(verb([form('noun:noun', learning)]), 'noun'), 'learning')
  // Checkpoints: one good one makes it familiar, two of the last three ready; a miss doesn't reset.
  const checked = (results: boolean[]) => entry([learning], { checkpoints: { present: { results, last: now - DAY } } })
  assert.equal(stageProgress(checked([true]), 'present'), 'familiar')
  assert.equal(stageProgress(checked([true, false, true]), 'present'), 'ready')
})

test('a word is met once known once; a verb has its present from the start', () => {
  // Saved, not yet studied: a verb's meanings and present are written, and in the deck it is its word card.
  assert.deepEqual(missingStages(verb([])), ['meanings', 'present'])
  // A noun's plural still waits until the noun is met.
  const noun: VocabEntry = { id: 'n', lemma: 'סֵפֶר', gloss: 'book', createdAt: 1, partOfSpeech: 'noun' }
  assert.deepEqual(missingStages(noun), ['meanings'])
  assert.deepEqual(missingStages({ ...noun, results: [true], last: now }), ['meanings', 'plural'])
  assert.ok(!isMet(verb([form('meanings:sense1', { results: [false, false], last: now })])))
  assert.ok(isMet(verb([], { results: [true, false], last: now })))
  assert.ok(isMet(verb([form('meanings:sense1', { results: [false, true], last: now })])))
  assert.ok(isMet(verb([], { known: ['meanings'] })))
  assert.deepEqual(recommendedStages(verb([], { results: [true], last: now })).map(stage => stage.key), ['meanings', 'present'])
  // A present already studied stays in play.
  assert.deepEqual(recommendedStages(verb([form('meanings:sense1'), form('present:m.sg', { results: [false], last: now })])).map(stage => stage.key), ['meanings', 'present'])
})

test('Mila brings in the next stage once every stage so far is familiar; the learner can open any before that', () => {
  const start = verb([form('meanings:sense1', learning), ...present([])], { results: [true], last: now })
  assert.deepEqual(recommendedStages(start).map(stage => stage.key), ['meanings', 'present'])
  assert.equal(stageState(start, 'past'), 'later')
  // Half the present familiar is enough; it needn't be nearly all of it.
  const halfway = verb([form('meanings:sense1', familiar), ...present([familiar, familiar, learning, learning])])
  assert.deepEqual(recommendedStages(halfway).map(stage => stage.key), ['meanings', 'present', 'past'])
  assert.deepEqual(recommendedStages(verb([form('meanings:sense1', familiar), ...present([familiar, learning, learning, learning])])).map(stage => stage.key), ['meanings', 'present'])
  const ready = verb([form('meanings:sense1', familiar), ...present([familiar, familiar, familiar, learning])])
  assert.deepEqual(recommendedStages(ready).map(stage => stage.key), ['meanings', 'present', 'past'])
  assert.deepEqual(missingStages(ready), ['past'])
  // Opened by the learner: in play (and written), though not recommended.
  const explored = { ...start, opened: ['future'] }
  assert.deepEqual(openStages(explored).map(stage => stage.key), ['meanings', 'present', 'future'])
  assert.deepEqual(missingStages(explored), ['future'])
  assert.equal(stageState(explored, 'past'), 'later')
  // Marking stages known counts as ready.
  assert.equal(stageState(verb(start.forms!, { known: ['meanings', 'present'] }), 'past'), 'new')
  assert.equal(statusOf(verb([form('meanings:sense1')])), 'new')
  assert.equal(statusOf(start), 'learning')
})

test('meanings come before the present tense, and present waits until the meanings exist', () => {
  const entry = verb([form('present:m.sg'), form('meanings:sense2'), form('meanings:sense1')], { results: [true], last: now })
  assert.deepEqual(newCards(entry).map(card => card.key), ['meanings:sense2', 'meanings:sense1', 'present:m.sg'])
  assert.deepEqual(newCards(verb([form('present:m.sg')], { results: [true], last: now })), [])
})

test('a round: new words, the next cards of words met, what is being learned, and familiar ones now and then', () => {
  const a = verb([form('meanings:sense1', familiar), form('present:m.sg', learning), form('present:f.sg', { results: [false], last: now - 3 * DAY })], { id: 'a', createdAt: 1, ...familiar })
  const b = verb([form('meanings:sense1')], { id: 'b', createdAt: 2 })
  const keys = (cards: ReturnType<typeof deckOf>) => cards.map(cardKey)
  const smart = deckOf([b, a], { include: 'both', order: 'smart' }, now)
  // b isn't met yet, so it comes as its word card alone; a familiar card for about every three others.
  assert.deepEqual(keys(smart), ['a:present:f.sg', 'b:word', 'a:present:m.sg', 'a:word'])
  assert.deepEqual(smart.map(card => card.why), ['still learning · last seen 3 days ago', `new word · saved ${ago(2, now)}`, 'still learning · last seen yesterday', 'familiar · last seen yesterday'])
  // Once b is met, its meanings come next.
  const metB = { ...b, results: [true], last: now - DAY }
  assert.ok(keys(deckOf([metB, a], { include: 'both', order: 'smart' }, now)).includes('b:meanings:sense1'))
  // In sentences only, a word not yet met still shows its meanings.
  assert.deepEqual(keys(deckOf([b], { include: 'sentences', order: 'smart' }, now)), ['b:meanings:sense1'])
  assert.deepEqual(keys(deckOf([a, b], { include: 'words', order: 'smart' }, now)), ['b:word', 'a:word'])
  assert.ok(keys(deckOf([a, b], { include: 'sentences', order: 'smart' }, now)).every(key => !key.endsWith(':word')))
  // With only familiar cards, the round is all of them.
  const known = verb([form('meanings:sense1', familiar)], { id: 'k', ...familiar })
  assert.deepEqual(keys(deckOf([known], { include: 'both', order: 'smart' }, now)), ['k:word', 'k:meanings:sense1'])
  // Shuffled: every card in play, the same order for the same seed.
  const shuffled = keys(deckOf([a, b], { include: 'both', order: 'shuffle' }, now, 'seed'))
  assert.equal(shuffled.length, 5)
  assert.deepEqual(keys(deckOf([a, b], { include: 'both', order: 'shuffle' }, now, 'seed')), shuffled)
})

test('a round always brings new words, newest and oldest in turn, however much is being learned', () => {
  const unseen = Array.from({ length: 30 }, (_, i) => verb([form('meanings:sense1')], { id: `n${i}`, createdAt: 100 + i }))
  const busy = Array.from({ length: 40 }, (_, i) => verb([form('meanings:sense1', { results: [false], last: now - i })], { id: `l${i}`, createdAt: 1, results: [true, false], last: now - i * 1000 }))
  const round = deckOf([...unseen, ...busy], { include: 'words', order: 'smart' }, now)
  const fresh = round.filter(card => card.entry.id.startsWith('n')).map(card => card.entry.id)
  assert.deepEqual(fresh.sort(), ['n29', 'n0', 'n28', 'n1', 'n27'].sort())
  // Learning fills the rest of the round, least recently seen first; the round stays its size.
  assert.equal(round.filter(card => card.entry.id.startsWith('l')).length, 13)
  // New material isn't left to the end: a new word within the first few cards.
  assert.ok(round.slice(0, 4).some(card => card.entry.id.startsWith('n')))
  // With nothing being learned, a round takes more new words.
  assert.equal(deckOf(unseen, { include: 'words', order: 'smart' }, now).length, 10)
  // The next cards of words met: a few a round, those met most recently first.
  const met = Array.from({ length: 8 }, (_, i) => verb([form('meanings:sense1'), form('meanings:sense2')], { id: `m${i}`, createdAt: 1, results: [true], last: now - i * DAY }))
  const deeper = deckOf(met, { include: 'sentences', order: 'smart' }, now)
  assert.equal(deeper.length, 9)
  assert.ok(deeper.every(card => card.why?.startsWith('next for this word · Meanings')))
})

test('how long ago, in days', () => {
  assert.equal(ago(0, now), 'never')
  assert.equal(ago(now - 60_000, now), 'today')
  assert.equal(ago(now - DAY, now), 'yesterday')
  assert.equal(ago(now - 3 * DAY, now), '3 days ago')
})

test('a checkpoint comes for a familiar stage that is not ready, at most once a day', () => {
  const entry = verb([form('meanings:sense1', familiar), ...present([familiar, familiar, learning])])
  assert.deepEqual(checkpointStages(entry, now), ['present'])
  assert.ok(deckOf([entry], { include: 'both', order: 'smart' }, now).some(card => card.checkpoint === 'present'))
  assert.ok(!deckOf([entry], { include: 'sentences', order: 'smart' }, now).some(card => card.checkpoint))
  assert.deepEqual(checkpointStages({ ...entry, checkpoints: { present: { results: [false], last: now - 60_000 } } }, now), [])
  assert.deepEqual(checkpointStages({ ...entry, checkpoints: { present: { results: [false], last: now - DAY } } }, now), ['present'])
  // Meanings have no checkpoint.
  assert.deepEqual(checkpointStages(verb([form('meanings:sense1', familiar), form('meanings:sense2', learning)]), now), [])
})

test('an expression is learned in the stages of the word that inflects in it', () => {
  const expression: VocabEntry = { id: 'x', lemma: 'לַעֲבֹר דֶּרֶךְ', gloss: 'to go through', createdAt: 1, partOfSpeech: 'expression', head: { lemma: 'לַעֲבֹר', partOfSpeech: 'verb' } }
  assert.deepEqual(missingStages({ ...expression, results: [true], last: now }), ['meanings', 'present'])
  assert.deepEqual(missingStages({ ...expression, results: [true], last: now, head: undefined }), ['meanings'])
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

test('word and meanings cards are quizzed with the learner\'s other saved words', () => {
  const open = verb([form('meanings:sense1', { he: 'לִפְתֹּחַ' })])
  const others = [
    verb([], { id: 'close', lemma: 'לִסְגֹּר', gloss: 'to close, to shut' }),
    verb([], { id: 'write', lemma: 'לִכְתֹּב', gloss: 'to write' }),
    verb([], { id: 'book', lemma: 'סֵפֶר', gloss: 'book', partOfSpeech: 'noun' }),
    verb([], { id: 'idiom', lemma: 'בְּעֶצֶם', gloss: 'actually', partOfSpeech: 'phrase' }),
    verb([], { id: 'expr', lemma: 'לְהַעֲמִיד פָּנִים', gloss: 'to pretend', partOfSpeech: 'expression' }),
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
  const known = verb([form('meanings:sense1', learning)], { ...learning, known: ['meanings', 'present', 'past', 'future', 'imperative', 'noun'] })
  assert.ok(isKnownWord(known))
  assert.deepEqual(deckOf([known], { include: 'both', order: 'smart' }, now), [])
  assert.equal(countsOf([known]).mastered, 1)
  assert.ok(!isKnownWord({ ...known, known: ['meanings'] }))
})

test('Home suggests a stage Mila has just brought in and nothing in it has been studied', () => {
  const ready = verb([form('meanings:sense1', familiar), ...present([familiar, familiar, familiar, familiar])])
  assert.deepEqual(freshStages([ready]).map(item => item.label), ['Past'])
  assert.deepEqual(freshStages([verb([...ready.forms!, form('past:1sg', learning)])]), [])
  assert.deepEqual(freshStages([verb([form('meanings:sense1')])]), [])
  // A stage marked known isn't suggested, and marking it known brings in the next.
  assert.deepEqual(freshStages([{ ...ready, known: ['past'] }]).map(item => item.label), ['Future'])
})

test('in a learning sequence a new word is followed by its sentences, and a missed sentence by the word', () => {
  const fresh = verb([form('meanings:sense2'), form('meanings:sense1'), ...present([])])
  const other: VocabEntry = { ...verb([]), id: 'other' }
  const keys = (cards: Card[]) => cards.map(cardKey)
  const round: Card[] = [{ entry: other, form: null }, { entry: fresh, form: null }]
  // Whichever way the word card went: its first meaning, then its present (m.sg).
  const after = (knew: boolean) => followUps(round, 1, { ...fresh, ...assess(fresh, knew, now) }, knew, fresh, 'both')
  assert.deepEqual(keys(after(false)), ['open:meanings:sense1', 'open:present:m.sg'])
  assert.deepEqual(keys(after(true)), ['open:meanings:sense1', 'open:present:m.sg'])
  assert.ok(after(false).every(card => card.sequence))
  // Words only: nothing follows a word card. A word already met: its cards come in their own time.
  assert.deepEqual(followUps(round, 1, fresh, false, fresh, 'words'), [])
  const met = { ...fresh, results: [true], last: now - DAY }
  assert.deepEqual(followUps([{ entry: met, form: null }], 0, met, true, met, 'both'), [])
  // A sentence card missed brings the word card back, unless the word card was just in this run.
  const sentence = fresh.forms![2]
  assert.deepEqual(keys(followUps([{ entry: other, form: null }, { entry: met, form: sentence }], 1, met, false, sentence, 'both')), ['open:word'])
  assert.deepEqual(followUps([{ entry: met, form: sentence }], 0, met, true, sentence, 'both'), [])
  assert.deepEqual(followUps([{ entry: met, form: null }, { entry: met, form: sentence }], 1, met, false, sentence, 'both'), [])
  assert.deepEqual(followUps([{ entry: met, form: sentence }], 0, met, false, sentence, 'sentences'), [])
  // At most three of one word in a row, and nothing behind a familiar card.
  const long: Card[] = [{ entry: fresh, form: fresh.forms![0] }, { entry: fresh, form: null }]
  assert.deepEqual(keys(followUps(long, 1, fresh, false, fresh, 'both')), ['open:meanings:sense1'])
  const known = { ...form('present:f.sg'), ...familiar }
  assert.deepEqual(followUps([{ entry: met, form: known }], 0, met, false, known, 'both'), [])
})

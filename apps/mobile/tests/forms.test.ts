import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ago, apart, byDue, dueOf, planRound, ProgressRules, asChoice, assess, awaitsRecall, exerciseOf, MAX_SENTENCES, onSentence, sentenceFor, wantsSentence, freshCards, freshPicks, freshRound, justAfterItsWord, personalVariant, shownForm, writerOf, type Card, cardKey, cardState, checkpointStages, choicesFor, countsOf, cueOf, cuedTranslation, cuesOf, deckOf, exposureOf, followUps, freshStages, intakeOrder, isKnownWord, isMet, isPrimed, mayFollow, missingStages, newCards, openStages, quizOf, recommendedStages, spread, stageProgress, stageState, statusOf, studyPool, upcoming } from '../src/lib/forms.ts'
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

test('answers given just after the word was shown are kept as primed, and two of them make nothing familiar', () => {
  assert.equal(cardState([true, true], [true, true]), 'learning')
  assert.equal(cardState([true, true], [true, false]), 'familiar')
  assert.equal(cardState([true, true]), 'familiar') // answers from before primed was kept
  // The marks stay beside their answers, older answers counting as not primed.
  const old = { results: [false, true], last: now - DAY }
  const after = assess(old, true, now, true)
  assert.deepEqual(after.results, [false, true, true]); assert.deepEqual(after.primed, [false, false, true])
  assert.deepEqual(assess(after, true, now + 1, true).primed, [false, true, true])
  // A primed answer still introduces the word (isMet), but doesn't count toward a familiar stage.
  const primedOnly = verb([form('meanings:sense1', { results: [true, true], primed: [true, true], last: now })])
  assert.ok(isMet(primedOnly))
  assert.equal(stageProgress(primedOnly, 'meanings'), 'learning')
})

test('an answer is primed after a learning sequence, or the same word a few cards or minutes before', () => {
  assert.ok(isPrimed({ sequence: true }, now))
  assert.ok(isPrimed({ cardsAgo: 3, msAgo: 20 * 60_000 }, now))
  assert.ok(isPrimed({ cardsAgo: 12, msAgo: 4 * 60_000 }, now))
  assert.ok(isPrimed({ lastAnswered: now - 5 * 60_000 }, now))
  assert.ok(!isPrimed({ cardsAgo: 12, msAgo: 20 * 60_000, lastAnswered: now - DAY }, now))
  assert.ok(!isPrimed({}, now))
  const seen = [{ key: 'a:word', word: 'a', at: now - 3000 }, { key: 'b:word', word: 'b', at: now - 2000 }, { key: 'c:word', word: 'c', at: now - 1000 }]
  assert.deepEqual(exposureOf(seen, item => item.word === 'a', now), { cardsAgo: 3, msAgo: 3000 })
  assert.deepEqual(exposureOf(seen, item => item.word === 'c', now), { cardsAgo: 1, msAgo: 1000 })
  assert.equal(exposureOf(seen, item => item.word === 'z', now), null)
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
  // a's cards still being learned, the one seen longest ago first, and b, not started, as its
  // word card alone (it isn't met yet), early in the round. a's familiar cards were seen
  // yesterday, so they rest.
  assert.deepEqual(keys(smart), ['a:present:f.sg', 'b:word', 'a:present:m.sg'])
  assert.deepEqual(smart.map(card => card.why), ['still learning · last seen 3 days ago', `new word · saved ${ago(2, now)}`, 'still learning · last seen yesterday'])
  // Familiar cards come back once they have rested a few days, one per word, and only of a word
  // the round doesn't otherwise show (a is being learned in it, so its familiar cards wait).
  const rested = { ...a, last: now - 5 * DAY, forms: a.forms!.map(item => (item.key === 'meanings:sense1' ? { ...item, last: now - 4 * DAY } : item)) }
  const familiarOf = (entries: VocabEntry[]) => keys(deckOf(entries, { include: 'both', order: 'smart' }, now).filter(card => card.why?.startsWith('familiar')))
  assert.deepEqual(familiarOf([b, rested]), [])
  const settled = verb([form('meanings:sense1', { results: [true, true], last: now - 5 * DAY })], { id: 'r', createdAt: 3, results: [true, true], last: now - 5 * DAY })
  assert.deepEqual(familiarOf([b, rested, settled]), ['r:word'])
  // Once b is met, its meanings come next.
  const metB = { ...b, results: [true], last: now - DAY }
  assert.ok(keys(deckOf([metB, a], { include: 'both', order: 'smart' }, now)).includes('b:meanings:sense1'))
  // In sentences only, a word not yet met still shows its meanings.
  assert.deepEqual(keys(deckOf([b], { include: 'sentences', order: 'smart' }, now)), ['b:meanings:sense1'])
  assert.deepEqual(keys(deckOf([a, b], { include: 'words', order: 'smart' }, now)), ['b:word'])
  assert.ok(keys(deckOf([a, b], { include: 'sentences', order: 'smart' }, now)).every(key => !key.endsWith(':word')))
  // With only familiar cards, the round is all of them.
  const known = verb([form('meanings:sense1', familiar)], { id: 'k', ...familiar })
  assert.deepEqual(keys(deckOf([known], { include: 'both', order: 'smart' }, now)), ['k:word', 'k:meanings:sense1'])
  // Shuffled: every card in play, the same order for the same seed.
  const shuffled = keys(deckOf([a, b], { include: 'both', order: 'shuffle' }, now, 'seed'))
  assert.equal(shuffled.length, 5)
  assert.deepEqual(keys(deckOf([a, b], { include: 'both', order: 'shuffle' }, now, 'seed')), shuffled)
})

test('started words take turns, least recently studied first, and new words come in every round', () => {
  const unseen = Array.from({ length: 30 }, (_, i) => verb([form('meanings:sense1')], { id: `n${i}`, createdAt: 100 + i }))
  const busy = Array.from({ length: 20 }, (_, i) => verb([form('meanings:sense1', { results: [false], last: now - i })], { id: `l${i}`, createdAt: 1, results: [true, false], last: now - i * 1000 }))
  const pool = studyPool([...unseen, ...busy], 'both', now)
  assert.deepEqual(pool.started.map(entry => entry.id), busy.map(entry => entry.id).reverse())
  assert.equal(pool.unstarted.length, 30)
  // Nothing has to be mastered for new words to come in: a few every round.
  const round = deckOf([...unseen, ...busy], { include: 'words', order: 'smart' }, now)
  const ids = round.map(card => card.entry.id)
  assert.equal(ids.filter(id => id.startsWith('n')).length, 3)
  assert.deepEqual(ids.filter(id => id.startsWith('l')).sort(), busy.slice(5).map(entry => entry.id).sort())
  // Once those have been studied, the others' turn comes.
  const studied = busy.map(entry => (ids.includes(entry.id) ? { ...entry, last: now + 1000 } : entry))
  const next = deckOf([...unseen, ...studied], { include: 'words', order: 'smart' }, now + 2000).map(card => card.entry.id).filter(id => id.startsWith('l'))
  assert.deepEqual(next.slice(0, 5).sort(), ['l0', 'l1', 'l2', 'l3', 'l4'])
  // With nothing started, more new words fill the round, up to newWordsMax.
  assert.equal(deckOf(unseen, { include: 'words', order: 'smart' }, now).length, 6)
  // Studying words only, a word whose word card is familiar is through.
  const knownCard = verb([form('meanings:sense1')], { id: 'w', createdAt: 1, ...familiar })
  assert.equal(studyPool([knownCard], 'words', now).started.length, 0)
  assert.equal(studyPool([knownCard], 'both', now).started.length, 1)
  // Cards are written ahead only for these: a round's worth of started words and the next new ones.
  assert.equal(upcoming([...unseen, ...busy], 'both', now).length, 18 + 6)
})

test('new words come from what was met again, saved lately, and anywhere else in what was saved', () => {
  const at = (days: number) => now - days * DAY
  const again = verb([], { id: 'again', createdAt: at(20), encounters: [{ surface: 'x', meaning: '', context: 'a', at: at(20) }, { surface: 'x', meaning: '', context: 'b', at: at(1) }] })
  const recent = [1, 2].map(days => verb([], { id: `recent${days}`, createdAt: at(days) }))
  const earlier = Array.from({ length: 12 }, (_, i) => verb([], { id: `e${i}`, createdAt: at(30 - i) }))
  // In turn, starting from a different place each day: over three days each goes first once.
  const firsts = [0, 1, 2].map(days => intakeOrder([...earlier, ...recent, again].map(entry => ({ ...entry, createdAt: entry.createdAt + days * DAY })), now + days * DAY)
    .slice(0, 3).map(item => item.source))
  assert.deepEqual(firsts.map(sources => [...sources].sort()), [0, 1, 2].map(() => ['again', 'earlier', 'recent']))
  assert.deepEqual(new Set(firsts.map(sources => sources[0])).size, 3)
  // Within each: met again most recently, saved most recently.
  const order = intakeOrder([...earlier, ...recent, again], now)
  assert.deepEqual(order.map(item => item.entry.id).filter(id => !id.startsWith('e')), ['again', 'recent1', 'recent2'])
  // The earlier ones in an order of the day: the same all day, another the next.
  const ofDay = (time: number) => intakeOrder(earlier, time).map(item => item.entry.id).join()
  assert.equal(ofDay(now), ofDay(now + 60_000))
  assert.notEqual(ofDay(now), ofDay(now + DAY))
  assert.notEqual(ofDay(now), earlier.map(entry => entry.id).join())
})

test('of the other words, the more common come in first, and a word looked up again comes in as met again', () => {
  const at = (days: number) => now - days * DAY
  const ranked = (id: string, rank?: number) => verb([], { id, createdAt: at(30), ...(rank ? { rank } : {}) })
  const words = [ranked('rare', 25000), ranked('unranked'), ranked('common', 800), ranked('uncommon', 6000), ranked('common2', 2900)]
  const order = intakeOrder(words, now).map(item => item.entry.id)
  assert.deepEqual(order.slice(0, 2).sort(), ['common', 'common2'])
  assert.deepEqual(order.slice(2, 4).sort(), ['uncommon', 'unranked'])
  assert.equal(order[4], 'rare')
  const lookedUp = { ...ranked('rare', 25000), lookedUp: { count: 1, last: at(1) } }
  assert.deepEqual(intakeOrder([...words.slice(1), lookedUp], now).filter(item => item.source === 'again').map(item => item.entry.id), ['rare'])
})

test('a round takes the words being studied in turn, least recently studied first, each a few cards further', () => {
  // Met verbs, each with meanings and present cards not yet studied, studied a day apart.
  const met = Array.from({ length: 6 }, (_, i) => verb([form('meanings:sense1'), ...present([])], { id: `m${i}`, createdAt: 1, results: [true], last: now - i * DAY }))
  const round = deckOf(met, { include: 'sentences', order: 'smart' }, now)
  // perWord cards of each, those studied longest ago first: every word gets its turn.
  assert.equal(round.length, 12)
  assert.deepEqual([...new Set(round.map(card => card.entry.id))].sort(), ['m0', 'm1', 'm2', 'm3', 'm4', 'm5'])
  assert.ok(round.filter(card => card.entry.id === 'm5').map(card => card.form!.key).join() === 'meanings:sense1,present:m.sg')
  // Cards still being learned and new ones in turn.
  const going = verb([form('meanings:sense1', familiar), ...present([learning, learning])], { id: 'g', createdAt: 1, ...familiar })
  const turn = deckOf([going], { include: 'sentences', order: 'smart' }, now).filter(card => !card.why?.startsWith('familiar')).map(card => card.form!.key)
  assert.deepEqual(turn, ['present:m.sg', 'present:m.pl'])
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
  // Study prepares those with the round, before the word card is answered (mayFollow).
  const prepared = mayFollow(fresh, 'both').map(item => item.key)
  assert.ok(['meanings:sense1', 'present:m.sg'].every(key => prepared.includes(key)))
  assert.deepEqual(mayFollow(fresh, 'words'), [])
  // Words only: nothing follows a word card. A word already met: its cards come in their own time.
  assert.deepEqual(followUps(round, 1, fresh, false, fresh, 'words'), [])
  const met = { ...fresh, results: [true], last: now - DAY }
  assert.deepEqual(followUps([{ entry: met, form: null }], 0, met, true, met, 'both'), [])
  // A sentence card missed brings the word card back, unless this round has shown it already,
  // just before or earlier.
  const sentence = fresh.forms![2]
  assert.deepEqual(keys(followUps([{ entry: other, form: null }, { entry: met, form: sentence }], 1, met, false, sentence, 'both')), ['open:word'])
  assert.deepEqual(followUps([{ entry: met, form: sentence }], 0, met, true, sentence, 'both'), [])
  assert.deepEqual(followUps([{ entry: met, form: null }, { entry: met, form: sentence }], 1, met, false, sentence, 'both'), [])
  assert.deepEqual(followUps([{ entry: met, form: null }, { entry: other, form: null }, { entry: met, form: sentence }], 2, met, false, sentence, 'both'), [])
  assert.deepEqual(followUps([{ entry: met, form: sentence }], 0, met, false, sentence, 'sentences'), [])
  // At most three of one word in a row, and nothing behind a familiar card.
  const long: Card[] = [{ entry: fresh, form: fresh.forms![0] }, { entry: fresh, form: null }]
  assert.deepEqual(keys(followUps(long, 1, fresh, false, fresh, 'both')), ['open:meanings:sense1'])
  const known = { ...form('present:f.sg'), ...familiar }
  assert.deepEqual(followUps([{ entry: met, form: known }], 0, met, false, known, 'both'), [])
})

test('cards showing the same use of a word are kept apart: in a learning sequence and in a word\'s turn', () => {
  const use = (key: string, usage: string, extra: Partial<FormCard> = {}) => form(key, { usage, ...extra })
  // The present card brought in after the first meaning shows another use, when the cards say.
  const labelled = verb([use('meanings:sense1', 'flooding streets'), use('present:m.sg', 'Flooding streets '), use('present:f.sg', 'flooded with questions'), form('present:m.pl')])
  const other: VocabEntry = { ...verb([]), id: 'other' }
  const keys = (cards: Card[]) => cards.map(cardKey)
  assert.deepEqual(keys(followUps([{ entry: other, form: null }, { entry: labelled, form: null }], 1, labelled, true, labelled, 'both')), ['open:meanings:sense1', 'open:present:f.sg'])
  // Cards written before labels keep their order.
  const plain = verb([form('meanings:sense1'), ...present([])])
  assert.deepEqual(keys(followUps([{ entry: plain, form: null }], 0, plain, true, plain, 'both')), ['open:meanings:sense1', 'open:present:m.sg'])
  // A use is held back only behind the others, never dropped.
  assert.deepEqual(apart(labelled.forms!.slice(1), [labelled.forms![0]]).map(item => item.key), ['present:f.sg', 'present:m.pl', 'present:m.sg'])
  // In its turn, a met word's new card is one showing another use than the card answered last.
  const met = verb([use('meanings:sense1', 'flooding streets', { results: [true], last: now - DAY }), use('present:m.sg', 'flooding streets'), use('present:f.sg', 'flooded with questions')],
    { results: [true], last: now - DAY })
  const round = deckOf([met], { include: 'sentences', order: 'smart' }, now)
  assert.deepEqual(round.filter(card => card.form?.stage === 'present').map(card => card.form!.key)[0], 'present:f.sg')
})

test('a card says who its form is for only where its English leaves it open', () => {
  // Written with the card: kept, even when empty because the English already says.
  assert.equal(cueOf({ stage: 'present', slot: 'f.sg', cue: '👧' }), '👧')
  assert.equal(cueOf({ stage: 'past', slot: '2sg.f', cue: '' }), '')
  // Written before: "you" and commands from their slot, everything else nothing.
  assert.equal(cueOf({ stage: 'past', slot: '2sg.m' }), '👨')
  assert.equal(cueOf({ stage: 'future', slot: '2pl' }), '👨👩')
  assert.equal(cueOf({ stage: 'imperative', slot: 'f.sg' }), '👩')
  assert.equal(cueOf({ stage: 'past', slot: '3sg.m' }), '')
  assert.equal(cueOf({ stage: 'present', slot: 'm.sg' }), '')
  assert.equal(cueOf({ stage: 'meanings', slot: 'sense1' }), '')
})

test('every person the English leaves open is cued after their word, the first time it appears', () => {
  const card = { stage: 'meanings', slot: 'sense1', translation: "Don't buy this coat if you might regret it, you know.", cue: '👨', cueAfter: 'you' }
  assert.equal(cuedTranslation({ ...card, cues: [{ cue: '👨', after: 'you' }] }), "Don't buy this coat if you 👨 might regret it, you know.")
  const two = { ...card, translation: 'The teacher told you to wait.', cues: [{ cue: '👩', after: 'teacher' }, { cue: '👨', after: 'you' }] }
  assert.equal(cuedTranslation(two), 'The teacher 👩 told you 👨 to wait.')
  // Two people named by the same word share its place; one whose word isn't there goes first.
  assert.equal(cuedTranslation({ ...two, cues: [{ cue: '👨', after: 'you' }, { cue: '👩', after: 'you' }, { cue: '👦', after: '' }] }), '👦 The teacher told you 👨👩 to wait.')
  // A card whose sentence needs none says so, whatever its slot.
  assert.equal(cuedTranslation({ ...card, stage: 'past', slot: '2sg.m', cues: [] }), card.translation)
  assert.deepEqual(cuesOf({ stage: 'past', slot: '2sg.f' }), [{ cue: '👩', after: 'you' }])
})

test('a cue is shown right after the English word it is about', () => {
  const card = { stage: 'meanings', slot: 'sense1', translation: "The doctor's secretary made me an appointment.", cue: '👩', cueAfter: 'secretary' }
  assert.equal(cuedTranslation(card), "The doctor's secretary 👩 made me an appointment.")
  assert.equal(cuedTranslation({ ...card, translation: 'Why are you tired?', cue: '👨', cueAfter: 'you' }), 'Why are you 👨 tired?')
  // After the whole of a contraction, before punctuation; not inside another word.
  assert.equal(cuedTranslation({ ...card, translation: "I'm sorry I'm late.", cue: '👩', cueAfter: 'I' }), "I'm 👩 sorry I'm late.")
  assert.equal(cuedTranslation({ ...card, translation: 'Are you coming, you?', cue: '👨👩', cueAfter: 'you' }), 'Are you 👨👩 coming, you?')
  assert.equal(cuedTranslation({ ...card, translation: 'Your kids, are they tired?', cue: '👦', cueAfter: 'kids' }), 'Your kids 👦, are they tired?')
  // Not found, or not said: first. No cue: the translation as it is.
  assert.equal(cuedTranslation({ ...card, cueAfter: 'nurse' }), "👩 The doctor's secretary made me an appointment.")
  assert.equal(cuedTranslation({ ...card, cue: '' }), card.translation)
  // Written before cues: "you" in the past is after "you".
  assert.equal(cuedTranslation({ stage: 'past', slot: '2sg.f', translation: 'Yesterday you were tired.' }), 'Yesterday you 👩 were tired.')
})

test('a card shows its own sentence or a new one written later, with its own key and results either way', () => {
  const card = form('present:m.sg', { sentence: 'הוא פותח', results: [true], writer: 'base', variants: [{ he: 'פותח', en: 'opens', sentence: 'הוא פותח את הדלת', mark: 'פותח', translation: 'He opens the door', writer: 'personal-v1', at: 1 }] })
  assert.equal(shownForm(card, 0).sentence, 'הוא פותח')
  const shown = shownForm(card, 1)
  assert.equal(shown.sentence, 'הוא פותח את הדלת')
  assert.equal(shown.key, 'present:m.sg')
  assert.deepEqual(shown.results, [true])
  // Its glosses are its own: none, rather than the first sentence's.
  assert.equal(shownForm({ ...card, glosses: [{ i: 0, lemma: 'הוא', en: 'he', t: 'He' }] }, 1).glosses, undefined)
  assert.equal(writerOf(card, 0), 'base')
  assert.equal(writerOf(card, 1), 'personal-v1')
  assert.equal(personalVariant(card), 1)
})

test('Study keeps a card in its sentence while it is learned, and gives it another once it is known there or keeps being missed', () => {
  const variants = [{ he: 'פותח', en: 'opens', sentence: 'הוא פותח את הדלת', mark: 'פותח', translation: 'He opens the door', writer: 'personal-v1', at: 1 }]
  const card = form('present:m.sg', { variants })
  // A first meeting: its own sentence. Being learned: the one it was last answered on.
  assert.deepEqual(sentenceFor(card, {}), { variant: 0, why: 'own', fresh: true })
  assert.deepEqual(sentenceFor(card, { results: [true, false], on: [0, 0], seen: [0] }), { variant: 0, why: 'repeat', fresh: false })
  // Familiar in its own sentence: the other one, new to the learner.
  assert.deepEqual(sentenceFor(card, { results: [true, true], on: [0, 0], seen: [0] }), { variant: 1, why: 'another-context', fresh: true })
  // Missed twice in it: another example.
  assert.deepEqual(sentenceFor(card, { results: [false, false], on: [0, 0], seen: [0] }), { variant: 1, why: 'another-example', fresh: true })
  // Every sentence seen: familiar takes them in turn.
  assert.deepEqual(sentenceFor(card, { results: [true, true], on: [0, 1], seen: [0, 1] }), { variant: 0, why: 'in-turn', fresh: false })
  // Older answers, from before Study said which sentence: its own.
  assert.equal(sentenceFor(card, { results: [true, false] }).variant, 0)
  // Each answer keeps which sentence it was on, alongside its results.
  const after = onSentence({ results: [true, true], on: [0] }, assess({ results: [true, true] }, false, 5), 1)
  assert.deepEqual(after.results, [true, true, false])
  assert.deepEqual(after.on, [-1, 0, 1])
  assert.deepEqual(after.seen, [0, 1])
})

test('a new sentence is written only where it would help, and not without limit', () => {
  const now = 10 * DAY
  const known = form('present:m.sg', { results: [true, true], on: [0, 0], seen: [0] })
  assert.equal(wantsSentence(known, now), 'another-context')
  assert.equal(wantsSentence(form('present:m.sg', { results: [false, false], on: [0, 0], seen: [0] }), now), 'another-example')
  // Being learned, a first meeting, or answers from before Study said which sentence: none.
  assert.equal(wantsSentence(form('present:m.sg', { results: [true, false], on: [0, 0], seen: [0] }), now), null)
  assert.equal(wantsSentence(form('present:m.sg'), now), null)
  assert.equal(wantsSentence(form('present:m.sg', { results: [true, true] }), now), null)
  // Familiar across sentences already (not stuck in one): none.
  const variant = { he: 'x', en: 'x', sentence: 'x', mark: 'x', translation: 'x', writer: 'personal-v1', at: now - 5 * DAY }
  assert.equal(wantsSentence({ ...known, variants: [variant], on: [0, 1], seen: [0, 1] }, now), null)
  // One it hasn't been answered on yet, one written lately, or as many as a card has room for: none.
  assert.equal(wantsSentence({ ...known, variants: [variant] }, now), null)
  assert.equal(wantsSentence({ ...known, variants: [{ ...variant, at: now - 3_600_000 }], seen: [0, 1] }, now), null)
  const full = Array.from({ length: MAX_SENTENCES - 1 }, (_, i) => i + 1)
  assert.equal(wantsSentence({ ...known, variants: full.map(() => variant), seen: [0, ...full] }, now), null)
  assert.equal(wantsSentence({ ...known, variants: [variant], on: [1, 1], seen: [0, 1] }, now), 'another-context')
})

test('how a card is asked follows what it needs, and says why', () => {
  const card = { entry: verb([]), form: form('present:m.sg') }
  assert.deepEqual(exerciseOf(card, {}, 'some'), { choice: false, why: 'first-meeting' })
  // Known in one sentence and now in another: recalled there, not chosen.
  assert.deepEqual(exerciseOf(card, { results: [true, true] }, 'some', false, { variant: 1, why: 'another-context', fresh: true }), { choice: false, why: 'new-context' })
  // Missed last time, same sentence: chosen from options, a step towards recalling it.
  assert.deepEqual(exerciseOf(card, { results: [true, false] }, 'some', false, { variant: 0, why: 'repeat', fresh: false }), { choice: true, why: 'support' })
  // ...but not just after its word was shown.
  assert.deepEqual(exerciseOf(card, { results: [true, false] }, 'some', true), { choice: false, why: 'just-shown' })
  assert.ok(['check', 'recall'].includes(exerciseOf(card, { results: [false, true] }, 'some').why))
})

test('a round of new sentences takes words being learned that have sentence cards studied, a stage each', () => {
  const studied = verb([form('meanings:sense1', learning), form('present:m.sg', { results: [false], last: now - 2 * DAY })], { id: 'a', results: [true], last: now - DAY })
  const wordOnly = verb([form('meanings:sense1')], { id: 'b', results: [true], last: now - DAY })
  const picks = freshPicks([studied, wordOnly])
  assert.deepEqual(picks.map(pick => [pick.entry.id, pick.stage]), [['a', 'meanings']])
  const written = { ...studied, forms: studied.forms!.map(item => (item.stage === 'meanings' ? { ...item, variants: [{ he: 'x', en: 'x', sentence: 'x', mark: 'x', translation: 'x', writer: 'personal-v1', at: Date.now() }] } : item)) }
  assert.deepEqual(freshCards(written, 'meanings').map(card => [card.form!.key, card.variant]), [['meanings:sense1', 1]])
  // Once a stage has a new sentence (one a day at most), the next round of them takes another stage, or another word.
  assert.deepEqual(freshPicks([written]).map(pick => pick.stage), ['present'])
  const both = { ...written, forms: written.forms!.map(item => ({ ...item, variants: written.forms![0].variants })) }
  assert.deepEqual(freshPicks([both]), [])
  // Only sentences written just now are new: a card that had one before isn't in the round.
  assert.deepEqual(freshCards(written, 'meanings', written), [])
  assert.equal(freshCards(written, 'meanings', studied).length, 1)
})

test('a choice can confirm a recall but never make a card familiar alone', () => {
  // Choices are kept marked as not unaided (as primed answers are).
  const chosen = assess(assess({}, true, 1, true), true, 2, true)
  assert.equal(cardState(chosen.results, chosen.primed), 'learning')
  assert.equal(awaitsRecall(chosen), true)
  const recalled = assess(assess({}, true, 1, false), true, 2, true)
  assert.equal(cardState(recalled.results, recalled.primed), 'familiar')
  assert.equal(awaitsRecall(recalled), false)
  // A card one recall away from familiar is asked as a flashcard, however choices are set.
  const card = { entry: verb([]), form: form('present:m.sg') }
  assert.equal(asChoice(card, chosen, 'all'), false)
  assert.equal(asChoice(card, chosen, 'some'), false)
  assert.equal(asChoice(card, { results: [false, true], primed: [true, true] }, 'all'), true)
})

test('fill in the blank never offers a word that means much the same', () => {
  const examine = verb([], { id: 'examine', lemma: 'לִבְחֹן', gloss: 'to examine, to test' })
  const others = [
    verb([], { id: 'check', lemma: 'לִבְדֹּק', gloss: 'to check, examine' }),
    verb([], { id: 'write', lemma: 'לִכְתֹּב', gloss: 'to write' }),
    verb([], { id: 'close', lemma: 'לִסְגֹּר', gloss: 'to close' }),
    verb([], { id: 'run', lemma: 'לָרוּץ', gloss: 'to run' }),
  ]
  const quiz = quizOf([examine, ...others], { entry: examine, form: null }, false, 'seed')!
  assert.ok(!quiz.options.includes('לִבְדֹּק'))
  assert.equal(quiz.options.length, 4)
})

test('fill in the blank comes now and then on sentence cards answered before, never at a first meeting', () => {
  const entry = verb([])
  const cards = Array.from({ length: 60 }, (_, i) => ({ entry: { ...entry, id: `w${i}` }, form: form('present:m.sg') }))
  const some = cards.filter(card => asChoice(card, { results: [true] }, 'some')).length
  assert.ok(some > 8 && some < 32, `${some} of 60`)
  assert.equal(cards.filter(card => asChoice(card, { results: [] }, 'some')).length, 0)
  assert.equal(asChoice({ entry, form: null }, { results: [true] }, 'some'), false)
  assert.equal(asChoice({ entry, form: null }, { results: [] }, 'all'), true)
  assert.equal(asChoice(cards[0], { results: [true] }, 'off'), false)
  assert.equal(asChoice({ entry, form: null, checkpoint: 'present' }, { results: [true] }, 'all'), false)
})

test('cards of the same word are a few cards apart where the round has room, as far as it can where not', () => {
  const of = (id: string, n: number) => ({ entry: verb([], { id }), n })
  const order = spread([of('a', 1), of('a', 2), of('b', 1), of('c', 1), of('d', 1), of('e', 1)]).map(card => card.entry.id)
  assert.ok(order.indexOf('a', order.indexOf('a') + 1) - order.indexOf('a') >= 4, order.join())
  // Two words only: they alternate.
  assert.deepEqual(spread([of('a', 1), of('a', 2), of('b', 1), of('b', 2)]).map(card => card.entry.id), ['a', 'b', 'a', 'b'])
})

test('a round of new sentences takes each word in turn, so its two cards are a round of words apart', () => {
  const card = (id: string, key: string) => ({ entry: verb([], { id }), form: form(key) })
  const round = freshRound([[card('a', 'present:m.sg'), card('a', 'present:f.sg')], [card('b', 'meanings:sense1')], [card('c', 'past:1sg'), card('c', 'past:2sg.m')]])
  assert.deepEqual(round.map(item => item.entry.id), ['a', 'b', 'c', 'a', 'c'])
})

test('fill in the blank is a check on what is known: never just after another card of its word, nor in a learning sequence', () => {
  const entry = verb([])
  const deck = [{ entry, form: null }, { entry: verb([], { id: 'x' }), form: null }, { entry, form: form('present:m.sg') }]
  assert.equal(justAfterItsWord(deck, 2), true)
  assert.equal(justAfterItsWord(deck, 1), false)
  // Not counting cards from before this round.
  assert.equal(justAfterItsWord(deck, 2, 1), false)
  const card = deck[2]
  const often = Array.from({ length: 30 }, (_, i) => ({ ...card, entry: { ...entry, id: `w${i}` } })).filter(item => asChoice(item, { results: [true] }, 'some')).length
  assert.ok(often > 0)
  assert.equal(Array.from({ length: 30 }, (_, i) => ({ ...card, entry: { ...entry, id: `w${i}` } })).filter(item => asChoice(item, { results: [true] }, 'some', true)).length, 0)
  assert.equal(asChoice({ ...card, sequence: true }, { results: [true] }, 'some'), false)
})

test('a meaning card is a fill in the blank only with distractors for the word as its sentence has it', () => {
  const other = verb([], { id: 'other', lemma: 'לָרוּץ' })
  // Written for the form in the sentence (שְׁלֵמָה): that is the answer, among words in that form.
  const natural = form('meanings:sense1', { he: 'שָׁלֵם', mark: 'שלמה', said: 'שְׁלֵמָה', distractors: ['רֵיקָה', 'שְׁבוּרָה', 'קְטַנָּה'], distractorsFor: 'שְׁלֵמָה' })
  const quiz = quizOf([verb([natural], { lemma: 'שָׁלֵם' }), other], { entry: verb([natural], { lemma: 'שָׁלֵם' }), form: natural }, false, 'seed')!
  assert.equal(quiz.answer, 'שְׁלֵמָה')
  assert.ok(quiz.options.includes('רֵיקָה'))
  // Older distractors were written in the dictionary form: not for a sentence that inflects it.
  const older = form('meanings:sense1', { he: 'שָׁלֵם', mark: 'שלמה', distractors: ['רֵיק', 'שָׁבוּר', 'קָטָן'] })
  assert.equal(quizOf([verb([older]), other], { entry: verb([older]), form: older }, false, 'seed'), null)
  // Spelled more fully in the sentence is still the dictionary form.
  const spelled = form('meanings:sense1', { he: 'לִנְהֹג', mark: 'לנהוג', distractors: ['לִשְׁחוֹת', 'לִרְקֹד', 'לִישֹׁן'] })
  assert.equal(quizOf([verb([spelled]), other], { entry: verb([spelled]), form: spelled }, false, 'seed')!.answer, 'לִנְהֹג')
  // No distractors of its own: the other saved words might fit the sentence too, so a flashcard.
  assert.equal(quizOf([verb([form('meanings:sense1', { he: 'לִפְתֹּחַ', mark: 'לפתוח' })]), other, verb([], { id: 'c', lemma: 'לִסְגֹּר' }), verb([], { id: 'd', lemma: 'לִכְתֹּב' })], { entry: verb([form('meanings:sense1', { he: 'לִפְתֹּחַ', mark: 'לפתוח' })]), form: form('meanings:sense1', { he: 'לִפְתֹּחַ', mark: 'לפתוח' }) }, true, 'seed'), null)
  // A new sentence's distractors are its own, never its card's.
  const varied = { ...spelled, variants: [{ he: 'לִנְהֹג', en: 'to drive', sentence: 'הוא נהג', mark: 'נהג', translation: 'He drove', writer: 'personal-v1', at: 1 }] }
  assert.equal(shownForm(varied, 1).distractors, undefined)
})

test('a meaning card written with distractors of its own chooses among them', () => {
  const card = form('meanings:sense1', { he: 'לִבְלֹעַ', mark: 'לבלוע', distractors: ['לִלְעֹס', 'לִנְשֹׁם', 'לִירֹק'] })
  const entry = verb([card], { lemma: 'לִבְלֹעַ' })
  const quiz = quizOf([entry, verb([], { id: 'other', lemma: 'לָרוּץ' })], { entry, form: card }, false, 'seed')!
  assert.deepEqual([...quiz.options].sort(), ['לִבְלֹעַ', 'לִלְעֹס', 'לִנְשֹׁם', 'לִירֹק'].sort())
  assert.equal(quiz.answer, 'לִבְלֹעַ')
})

test('a started word is due a day after a miss and two after a right answer, the least overdue first', () => {
  const at = (days: number) => new Date(2026, 9, 16 - days, 9).getTime()
  const missed = verb([form('meanings:sense1', { results: [false], last: at(1) })], { id: 'm', results: [true], last: at(3) })
  const right = verb([form('meanings:sense1', { results: [true], last: at(1) })], { id: 'r', results: [true], last: at(1) })
  const old = verb([form('meanings:sense1', { results: [false], last: at(13) })], { id: 'o', results: [true], last: at(14) })
  assert.equal(dueOf(missed, now).due, true)
  assert.equal(dueOf(right, now).due, false)
  assert.equal(dueOf(right, now + DAY).due, true)
  const { due, early } = byDue([old, right, missed], now)
  // Met yesterday and missed: today, ahead of the backlog from two weeks ago.
  assert.deepEqual(due.map(item => item.entry.id), ['m', 'o'])
  assert.deepEqual(early.map(item => item.entry.id), ['r'])
})

test('a round says what it considered: reviews by due, fewer new words while reviews wait, and why each card is out', () => {
  const at = (days: number) => new Date(2026, 9, 16 - days, 9).getTime()
  const backlog = Array.from({ length: 30 }, (_, i) => verb([form('meanings:sense1', { results: [false], last: at(10 + i) })], { id: `b${i}`, createdAt: 1, results: [true], last: at(10 + i) }))
  const unseen = Array.from({ length: 10 }, (_, i) => verb([form('meanings:sense1')], { id: `n${i}`, createdAt: 100 + i }))
  const plan = planRound([...backlog, ...unseen], { include: 'both', order: 'smart' }, now)
  const ids = plan.cards.map(card => card.entry.id)
  // 30 words due: the round takes as many as fit, and only one new word while 20 or more wait.
  assert.equal(ids.filter(id => id.startsWith('n')).length, 1)
  assert.equal(plan.cards.length, ProgressRules.roundSize)
  assert.ok(plan.budget[0].startsWith('30 words due for review'))
  assert.ok(plan.budget.some(line => line.startsWith('1 new word this round instead of 3')))
  const out = plan.considered.filter(item => !item.chosen)
  assert.ok(out.some(item => item.slot === 'review' && item.why.startsWith('due, but the round is full')))
  assert.ok(out.some(item => item.slot === 'new' && item.why.startsWith('waits its turn')))
  assert.ok(plan.considered.filter(item => item.chosen).every(item => plan.cards.some(card => cardKey(card) === item.key)))
  // With a small backlog, three new words as before.
  const few = planRound([...backlog.slice(0, 3), ...unseen], { include: 'both', order: 'smart' }, now)
  assert.ok(few.cards.filter(card => card.entry.id.startsWith('n')).length >= 3)
})

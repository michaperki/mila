import { stripNiqqud } from './ocr-cleanup.ts'
import type { FormCard, Results, VocabEntry } from './types'

// A saved word is learned in stages. Every saved word can be studied at once, first as its word
// card alone; once it has been known once (isMet), its meanings come in (one card per distinct
// meaning, using the dictionary form) and then its forms: a verb's present, past, future,
// imperative and verbal noun, an adjective's other forms, a noun's plural. Each card has its own
// sentence. An expression (לעבור דרך) has the stages of the word in it that inflects, every card
// using the whole expression. A stage marked `withPrevious` comes in with the one before it once
// the word is met (a verb's present with its meanings), its cards after; Mila brings in any other
// stage once those before it are familiar (see ProgressRules). How a word is going decides how
// hard its cards get, never whether it can be studied, and the learner can study any stage
// sooner. Stages and slots mirror apps/web/netlify/functions/word-forms.ts, which writes the cards.
export type Kind = 'verb' | 'adjective' | 'noun' | 'other'
export type Stage = { key: string; label: string; slots: Record<string, string>; withPrevious?: boolean }
const PERSONS = { '1sg': 'I', '2sg.m': 'you (m.)', '2sg.f': 'you (f.)', '3sg.m': 'he', '3sg.f': 'she', '1pl': 'we' }
const MEANINGS: Stage = { key: 'meanings', label: 'Meanings', slots: { sense1: 'meaning 1', sense2: 'meaning 2', sense3: 'meaning 3' } }
const STAGES: Record<Kind, Stage[]> = {
  verb: [
    MEANINGS,
    { key: 'present', label: 'Present', withPrevious: true, slots: { 'm.sg': 'm. singular', 'f.sg': 'f. singular', 'm.pl': 'm. plural', 'f.pl': 'f. plural' } },
    { key: 'past', label: 'Past', slots: { ...PERSONS, '2pl.m': 'you (pl. m.)', '2pl.f': 'you (pl. f.)', '3pl': 'they' } },
    { key: 'future', label: 'Future', slots: { ...PERSONS, '2pl': 'you (pl.)', '3pl': 'they' } },
    { key: 'imperative', label: 'Imperative', slots: { 'm.sg': 'to a man', 'f.sg': 'to a woman', pl: 'to several' } },
    { key: 'noun', label: 'Verbal noun', slots: { noun: 'verbal noun' } },
  ],
  adjective: [
    MEANINGS,
    { key: 'inflected', label: 'Other forms', withPrevious: true, slots: { 'f.sg': 'f. singular', 'm.pl': 'm. plural', 'f.pl': 'f. plural' } },
  ],
  noun: [
    MEANINGS,
    { key: 'plural', label: 'Plural', withPrevious: true, slots: { pl: 'plural' } },
  ],
  other: [MEANINGS],
}
export const kindOf = (partOfSpeech?: string): Kind =>
  partOfSpeech === 'verb' || partOfSpeech === 'adjective' || partOfSpeech === 'noun' ? partOfSpeech : 'other'
// An expression is learned as the kind of word that inflects in it.
export const kindOfEntry = (entry: VocabEntry) => kindOf(entry.partOfSpeech === 'expression' ? entry.head?.partOfSpeech : entry.partOfSpeech)
export const stagesOf = (entry: VocabEntry) => STAGES[kindOfEntry(entry)]
// What kind of word it is, with a noun's gender: "feminine noun", "verb", "expression".
export const kindLabel = (entry: VocabEntry) => (entry.partOfSpeech === 'noun' && entry.gender ? `${entry.gender} noun` : entry.partOfSpeech || '')
export const slotLabel = (entry: VocabEntry, form: FormCard) => stagesOf(entry).find(stage => stage.key === form.stage)?.slots[form.slot] ?? form.slot

// Local calendar day.
export const dayOf = (now: number) => { const date = new Date(now); return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}` }

// What studying shows, and what Mila does with it. A swipe says whether the learner knew a card;
// each card keeps its last few results, never a date to come back. A card is familiar when its
// latest answers were right, and a wrong answer only makes it learning again: nothing resets.
// A stage is familiar when about half its cards are (or a checkpoint went well), and then Mila
// brings in the next stage; it is ready when nearly all are, or when most recent checkpoints
// were nailed. A round is mostly new words and words being learned, never only the same few
// cards. The numbers live here so they can be tuned in one place.
export const ProgressRules = {
  kept: 3, // results kept per card and per checkpoint
  familiarAfter: 2, // the latest answers that must be right for a card to be familiar
  familiarShare: 0.5, // share of a stage's cards familiar for the stage to be familiar
  readySlackFrom: 4, // a stage of this many cards or more is ready with one card still learning
  checkpointsReady: 2, // nailed checkpoints, of those kept, that make a stage ready
  roundSize: 18, // cards in a round, besides the familiar ones mixed in
  newWordsPerRound: 5, // words seen for the first time in a round, at least
  newWordsMax: 10, // ...and at most, when little is being learned to fill the round
  deeperPerRound: 4, // new cards of words already met (their meanings, then their forms)
  familiarEvery: 3, // one familiar card for about this many others in a round
}

export type CardState = 'new' | 'learning' | 'familiar'
export function cardState(results?: boolean[]): CardState {
  if (!results?.length) return 'new'
  const latest = results.slice(-ProgressRules.familiarAfter)
  return latest.length === ProgressRules.familiarAfter && latest.every(Boolean) ? 'familiar' : 'learning'
}
export const isFamiliar = (card: Results) => cardState(card.results) === 'familiar'
// A card's record after an answer: its latest results and when it was answered.
export const assess = (card: Results, knew: boolean, now = Date.now()): Required<Results> =>
  ({ results: [...(card.results || []), knew].slice(-ProgressRules.kept), last: now })

export const formsIn = (entry: VocabEntry, stage: string) => (entry.forms || []).filter(form => form.stage === stage)
const isKnown = (entry: VocabEntry, stage: string) => !!entry.known?.includes(stage)
// "I know this word": every stage marked known. It then leaves studying altogether.
export const isKnownWord = (entry: VocabEntry) => stagesOf(entry).every(stage => isKnown(entry, stage.key))

// Conjugation checkpoints: recalling a whole tense (or an adjective's forms) at once, checked
// against the word's table of forms (word-table.ts). By stage, the table group it uses.
const CHECKPOINTS: Record<string, string> = { present: 'present', past: 'past', future: 'future', imperative: 'imperative', inflected: 'forms' }
export const checkpointGroup = (entry: VocabEntry, stage: string) =>
  (stagesOf(entry).some(item => item.key === stage) ? CHECKPOINTS[stage] : undefined)
export const checkpointsOf = (entry: VocabEntry, stage: string) => entry.checkpoints?.[stage]?.results || []

// How a stage is going, from its cards and checkpoints.
export type Progress = 'new' | 'learning' | 'familiar' | 'ready'
export function stageProgress(entry: VocabEntry, stage: string): Progress {
  const forms = formsIn(entry, stage)
  const familiar = forms.filter(isFamiliar).length
  const nailed = checkpointsOf(entry, stage).filter(Boolean).length
  const slack = forms.length >= ProgressRules.readySlackFrom ? 1 : 0
  if (nailed >= ProgressRules.checkpointsReady || (forms.length > 0 && familiar >= forms.length - slack)) return 'ready'
  if (nailed > 0 || (forms.length > 0 && familiar >= forms.length * ProgressRules.familiarShare)) return 'familiar'
  return forms.some(form => form.results?.length) || checkpointsOf(entry, stage).length ? 'learning' : 'new'
}
const isDone = (entry: VocabEntry, stage: string) => isKnown(entry, stage) || stageProgress(entry, stage) === 'ready'
// Far enough along for Mila to bring in the next stage.
const isFamiliarStage = (entry: VocabEntry, stage: string) => isKnown(entry, stage) || ['familiar', 'ready'].includes(stageProgress(entry, stage))
const practisedStage = (entry: VocabEntry, stage: string) => formsIn(entry, stage).some(form => form.results?.length)

// A word is met once the learner has known it once: its word card or one of its meanings
// answered right, or its meanings marked known. Until then it is studied as its word card alone.
export const isMet = (entry: VocabEntry) => !!entry.results?.some(Boolean)
  || formsIn(entry, 'meanings').some(form => form.results?.some(Boolean)) || isKnown(entry, 'meanings')

// The stages Mila has brought in: the first always; a `withPrevious` stage with the one before
// it once the word is met (or once it has been studied); any other once every stage brought in
// so far is familiar (or marked known).
export function recommendedStages(entry: VocabEntry): Stage[] {
  const stages = stagesOf(entry)
  const open = [stages[0]]
  for (let i = 1; i < stages.length; i++) {
    const comes = stages[i].withPrevious
      ? isMet(entry) || practisedStage(entry, stages[i].key)
      : open.every(stage => isFamiliarStage(entry, stage.key))
    if (!comes) break
    open.push(stages[i])
  }
  return open
}
// The stages a word starts with, before anything is studied: its first and those that come in
// with it. Bringing these in is not news (see freshStages, and the end of a round).
export function startingStages(entry: VocabEntry): Stage[] {
  const stages = stagesOf(entry)
  const end = stages.findIndex((stage, i) => i > 0 && !stage.withPrevious)
  return end === -1 ? stages : stages.slice(0, end)
}
// The stages in play: those Mila brought in and those the learner chose to study anyway.
export function openStages(entry: VocabEntry): Stage[] {
  const recommended = new Set(recommendedStages(entry).map(stage => stage.key))
  return stagesOf(entry).filter(stage => recommended.has(stage.key) || !!entry.opened?.includes(stage.key))
}
// Open stages whose cards haven't been written yet (word-forms writes them on request).
export const missingStages = (entry: VocabEntry) => openStages(entry).filter(stage => !formsIn(entry, stage.key).length).map(stage => stage.key)

// A stage as the word page shows it: known, how it is going, or not brought in yet ('later').
export type StageState = 'known' | Progress | 'later'
export function stageState(entry: VocabEntry, stage: string): StageState {
  if (isKnown(entry, stage)) return 'known'
  if (!openStages(entry).some(item => item.key === stage)) return 'later'
  return stageProgress(entry, stage)
}

// Cards in play: forms of open stages the learner hasn't marked as known.
const activeForms = (entry: VocabEntry) => {
  const open = new Set(openStages(entry).map(stage => stage.key))
  return (entry.forms || []).filter(form => open.has(form.stage) && !isKnown(entry, form.stage))
}

const practised = (entry: VocabEntry) => !!entry.results?.length || (entry.forms || []).some(form => form.results?.length)
  || Object.values(entry.checkpoints || {}).some(item => item.results.length)
export type Status = 'new' | 'learning' | 'mastered'
export function statusOf(entry: VocabEntry): Status {
  if (!practised(entry)) return 'new'
  return stagesOf(entry).every(stage => isDone(entry, stage.key)) ? 'mastered' : 'learning'
}
// New cards in stage order. A `withPrevious` stage's cards wait until the stage before it has
// cards, so a verb's meanings always come before its present tense.
export function newCards(entry: VocabEntry) {
  const stages = stagesOf(entry)
  const ready = (stage: string) => {
    const i = stages.findIndex(item => item.key === stage)
    return i <= 0 || !stages[i].withPrevious || formsIn(entry, stages[i - 1].key).length > 0
  }
  const order = (form: FormCard) => stages.findIndex(stage => stage.key === form.stage)
  return activeForms(entry).filter(form => !form.results?.length && ready(form.stage)).sort((a, b) => order(a) - order(b))
}

// A study card: a saved word on its own (its dictionary form and meanings; `form` is null), one
// of its form cards in a sentence, or a checkpoint on one of its stages (`checkpoint`). `why`
// says why the round has it, for the learner who asks (practice.tsx).
export type Card = { entry: VocabEntry; form: FormCard | null; checkpoint?: string; why?: string }
export const cardKey = ({ entry, form, checkpoint }: Card) => `${entry.id}:${checkpoint ? `checkpoint:${checkpoint}` : form ? form.key : 'word'}`
const resultsOf = ({ entry, form, checkpoint }: Card): Results =>
  (checkpoint ? { results: checkpointsOf(entry, checkpoint), last: entry.checkpoints?.[checkpoint]?.last } : form ?? entry)

// A checkpoint is offered for a stage that is familiar but not ready, at most once a day.
export function checkpointStages(entry: VocabEntry, now = Date.now()) {
  if (isKnownWord(entry)) return []
  return openStages(entry).filter(stage => checkpointGroup(entry, stage.key) && !isKnown(entry, stage.key)
    && stageProgress(entry, stage.key) === 'familiar'
    && !(entry.checkpoints?.[stage.key] && dayOf(entry.checkpoints[stage.key].last) === dayOf(now))).map(stage => stage.key)
}

// What to study: word cards, sentence cards or both, in smart or shuffled order.
export type Include = 'words' | 'sentences' | 'both'
export type Order = 'smart' | 'shuffle'
// One round of studying, which the learner can go round again for as long as they like. Smart
// order fills a round of about ProgressRules.roundSize cards:
// - new words, as their word cards: at least a few every round, and more when little is being
//   learned; the newest saved and the oldest still unseen in turn, so what was just read comes
//   soon and nothing waits forever;
// - the next cards of words already met (their meanings, then their forms), a few a round;
// - the cards still being learned, least recently seen first, in the room left;
// and mixed in among them, familiar cards now and then (least recently seen first), so what is
// known comes back without crowding out the rest; then any checkpoints. Shuffled: everything in
// play, shuffled. Either way, a word not yet met shows only its word card (in sentences only, its
// meanings), and two cards of one word aren't back to back where another can go between.
// Nothing here is ever due.
export function deckOf(entries: VocabEntry[], { include, order }: { include: Include; order: Order }, now = Date.now(), seed = String(now)): Card[] {
  const studied = entries.filter(entry => !isKnownWord(entry))
  const deeper = (entry: VocabEntry) => (include === 'sentences' || isMet(entry) ? newCards(entry) : [])
  const cards: Card[] = studied.flatMap(entry => [
    ...(include === 'sentences' ? [] : [{ entry, form: null }]),
    ...(include === 'words' ? [] : [...activeForms(entry).filter(form => !!form.results?.length), ...deeper(entry)].map(form => ({ entry, form }))),
  ])
  const checkpoints: Card[] = include === 'both'
    ? studied.flatMap(entry => checkpointStages(entry, now).map(stage => ({ entry, form: null, checkpoint: stage, why: `checkpoint · ${stageLabel(entry, stage)} is familiar, not yet ready` })))
    : []
  if (order === 'shuffle') return spread(shuffle([...cards, ...checkpoints], seed).map(card => ({ why: 'shuffled', ...card })))
  const rules = ProgressRules
  const state = (card: Card) => cardState(resultsOf(card).results)
  const lastOf = (card: Card) => resultsOf(card).last ?? 0
  const learning = cards.filter(card => state(card) === 'learning').sort((a, b) => lastOf(a) - lastOf(b))
  const fresh = cards.filter(card => state(card) === 'new')
  // Unseen words, newest and oldest in turn.
  const unseen = fresh.filter(card => !card.form).sort((a, b) => a.entry.createdAt - b.entry.createdAt)
  const newWords: Card[] = []
  for (let lo = 0, hi = unseen.length - 1; lo <= hi;) {
    newWords.push(unseen[hi--])
    if (lo <= hi) newWords.push(unseen[lo++])
  }
  // Words met most recently go deeper first; sorting is stable, so a word's cards keep their order.
  const metAt = (entry: VocabEntry) => Math.max(entry.last ?? 0, ...formsIn(entry, 'meanings').map(form => form.last ?? 0))
  const next = fresh.filter(card => card.form).sort((a, b) => metAt(b.entry) - metAt(a.entry))
  const deeperTaken = next.slice(0, rules.deeperPerRound + (include === 'sentences' ? rules.newWordsPerRound : 0))
  const room = rules.roundSize - deeperTaken.length
  const wordsTaken = newWords.slice(0, Math.min(rules.newWordsMax, Math.max(rules.newWordsPerRound, room - learning.length)))
  const learningTaken = learning.slice(0, Math.max(0, room - wordsTaken.length))
  const familiar = cards.filter(card => state(card) === 'familiar').sort((a, b) => lastOf(a) - lastOf(b))
  const explained = (list: Card[], why: (card: Card) => string) => list.map(card => ({ ...card, why: why(card) }))
  const others = mix(
    explained(learningTaken, card => `still learning · last seen ${ago(lastOf(card), now)}`),
    [...explained(wordsTaken, card => `new word · saved ${ago(card.entry.createdAt, now)}`), ...explained(deeperTaken, card => `next for this word · ${stageLabel(card.entry, card.form!.stage)}`)],
  )
  const some = explained(others.length ? familiar.slice(0, Math.ceil(others.length / rules.familiarEvery)) : familiar,
    card => `familiar · last seen ${ago(lastOf(card), now)}`)
  return spread([...mix(others, some), ...checkpoints])
}
const stageLabel = (entry: VocabEntry, stage: string) => stagesOf(entry).find(item => item.key === stage)?.label ?? stage
// "today", "yesterday", "3 days ago", or "never".
export function ago(at: number, now = Date.now()) {
  if (!at) return 'never'
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}
// `extra` spread evenly through `cards`.
function mix<T>(cards: T[], extra: T[]): T[] {
  if (!extra.length) return cards
  if (!cards.length) return extra
  const out: T[] = []
  const every = (cards.length + extra.length) / extra.length
  let next = every - 1, e = 0, c = 0
  for (let i = 0; i < cards.length + extra.length; i++) {
    if (e < extra.length && (i >= next || c >= cards.length)) { out.push(extra[e++]); next += every } else out.push(cards[c++])
  }
  return out
}
// Reorders so two cards of the same word are not back to back, where another card can go between.
export function spread<T extends { entry: VocabEntry }>(cards: T[]): T[] {
  const left = [...cards]
  const out: T[] = []
  while (left.length) {
    const previous = out[out.length - 1]?.entry.id
    const i = left.findIndex(card => card.entry.id !== previous)
    out.push(...left.splice(i === -1 ? 0 : i, 1))
  }
  return out
}

// For the Vocabulary screen: how many words, and how they are going.
export function countsOf(entries: VocabEntry[]) {
  return {
    saved: entries.length,
    learning: entries.filter(entry => statusOf(entry) === 'learning').length,
    mastered: entries.filter(entry => statusOf(entry) === 'mastered').length,
  }
}

// Stages Mila has just brought in (not the ones a word starts with) that haven't been studied
// yet: "Past · לכתוב", what Home suggests studying next. A stage marked known is left out.
export type Suggestion = { entry: VocabEntry; label: string }
export function freshStages(entries: VocabEntry[], limit = 3): Suggestion[] {
  const out: Suggestion[] = []
  for (const entry of entries) {
    if (isKnownWord(entry)) continue
    const initial = new Set(startingStages(entry).map(stage => stage.key))
    for (const stage of recommendedStages(entry)) {
      if (initial.has(stage.key) || isKnown(entry, stage.key)) continue
      if (formsIn(entry, stage.key).some(form => form.results?.length) || checkpointsOf(entry, stage.key).length) continue
      out.push({ entry, label: stage.label })
    }
  }
  return out.slice(0, limit)
}

// Quiz mode: a form card is answered by filling its blank with one of up to four options, this
// form and other forms of the same word, same stage first. Fewer than three options would make
// the choice trivial, so then the card is flipped as usual.
export function choicesFor(entry: VocabEntry, form: FormCard, seed: string): string[] | null {
  const bare = (text: string) => stripNiqqud(text)
  const others = (entry.forms || []).filter(other => bare(other.he) !== bare(form.he))
    .sort((a, b) => Number(b.stage === form.stage) - Number(a.stage === form.stage))
  const picked: string[] = []
  for (const other of others) if (picked.length < 3 && !picked.some(item => bare(item) === bare(other.he))) picked.push(other.he)
  if (picked.length < 2) return null
  return shuffle([form.he, ...picked], seed)
}

// Any card as a quiz: the right answer among three or four options, or null when there aren't
// enough to make a real choice (the card is then flipped as usual). A later stage's form chooses
// among the word's other forms (choicesFor). A meanings card (the word blanked in its sentence)
// and a word card have no other forms, so they choose among the learner's other saved words,
// same part of speech first (an expression among expressions): the Hebrew word, or for a word card shown in Hebrew its English
// meaning (the first sense only, so the length of a list doesn't give it away).
export type Quiz = { options: string[]; answer: string }
export const firstSense = (gloss: string) => gloss.split(/[,;]/)[0].trim()
export function quizOf(entries: VocabEntry[], { entry, form }: Card, english: boolean, seed: string): Quiz | null {
  if (form && form.stage !== 'meanings') {
    const options = choicesFor(entry, form, seed)
    return options && { options, answer: form.he }
  }
  const inEnglish = !form && english
  const valueOf = (item: VocabEntry) => (inEnglish ? firstSense(item.gloss || '') : item.lemma || '')
  const key = (text: string) => stripNiqqud(text).trim().toLowerCase()
  const answer = form ? form.he : valueOf(entry)
  if (!answer) return null
  // An expression chooses among other expressions, a word among other words.
  const expression = (item: VocabEntry) => item.partOfSpeech === 'expression'
  const others = shuffle(entries.filter(item => item.id !== entry.id && item.partOfSpeech !== 'phrase' && expression(item) === expression(entry)), seed)
    .sort((a, b) => Number(b.partOfSpeech === entry.partOfSpeech) - Number(a.partOfSpeech === entry.partOfSpeech))
  const picked: string[] = []
  for (const other of others) {
    const value = valueOf(other)
    if (picked.length < 3 && value && key(value) !== key(answer) && !picked.some(item => key(item) === key(value))) picked.push(value)
  }
  if (picked.length < 2) return null
  return { options: shuffle([answer, ...picked], seed), answer }
}

function shuffle<T>(items: T[], seed: string): T[] {
  let state = [...seed].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7)
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32 }
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}

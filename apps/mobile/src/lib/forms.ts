import { stripNiqqud } from './ocr-cleanup.ts'
import { endOfDay, grade, type Rating } from './review.ts'
import type { FormCard, VocabEntry } from './types'

const DAY = 24 * 60 * 60 * 1000

// A saved word is learned in stages. Every word starts with its meanings (one card per
// distinct meaning, using the dictionary form); then come its forms: a verb's present, past,
// future, imperative and verbal noun, an adjective's other forms, a noun's plural. Each card
// has its own sentence. A stage marked `withPrevious` opens together with the one before it
// (a verb's present with its meanings) but its cards come after; any other stage opens when
// every card of the group before it is solid (Got it on two different days), or when the
// learner marks those stages as known. Stages and slots mirror
// apps/web/netlify/functions/word-forms.ts, which writes the cards.
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
export const stagesOf = (entry: VocabEntry) => STAGES[kindOf(entry.partOfSpeech)]
// What kind of word it is, with a noun's gender: "feminine noun", "verb".
export const kindLabel = (entry: VocabEntry) => (entry.partOfSpeech === 'noun' && entry.gender ? `${entry.gender} noun` : entry.partOfSpeech || '')
export const slotLabel = (entry: VocabEntry, form: FormCard) => stagesOf(entry).find(stage => stage.key === form.stage)?.slots[form.slot] ?? form.slot

// Local calendar day, so "two different days" means what it says to the learner.
export const dayOf = (now: number) => { const date = new Date(now); return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}` }
export const isSolid = (form: FormCard) => (form.goodDays?.length ?? 0) >= 2
export const formsIn = (entry: VocabEntry, stage: string) => (entry.forms || []).filter(form => form.stage === stage)
const isKnown = (entry: VocabEntry, stage: string) => !!entry.known?.includes(stage)
// "I know this word": every stage marked known. It then leaves studying altogether.
export const isKnownWord = (entry: VocabEntry) => stagesOf(entry).every(stage => isKnown(entry, stage.key))
const isDone = (entry: VocabEntry, stage: string) => {
  const forms = formsIn(entry, stage)
  return isKnown(entry, stage) || (forms.length > 0 && forms.every(isSolid))
}

// The first stage is always open. A `withPrevious` stage opens with the one before it; any
// other opens when every stage opened so far is done.
export function unlockedStages(entry: VocabEntry): Stage[] {
  const stages = stagesOf(entry)
  const open = [stages[0]]
  for (let i = 1; i < stages.length; i++) {
    if (!stages[i].withPrevious && !open.every(stage => isDone(entry, stage.key))) break
    open.push(stages[i])
  }
  return open
}
// Open stages whose cards haven't been written yet (word-forms writes them on request).
export const missingStages = (entry: VocabEntry) => unlockedStages(entry).filter(stage => !formsIn(entry, stage.key).length).map(stage => stage.key)

export type StageState = 'known' | 'done' | 'learning' | 'locked'
export function stageState(entry: VocabEntry, stage: string): StageState {
  if (isKnown(entry, stage)) return 'known'
  if (!unlockedStages(entry).some(item => item.key === stage)) return 'locked'
  return isDone(entry, stage) ? 'done' : 'learning'
}

// Cards in play: forms of open stages the learner hasn't marked as known.
const activeForms = (entry: VocabEntry) => {
  const open = new Set(unlockedStages(entry).map(stage => stage.key))
  return (entry.forms || []).filter(form => open.has(form.stage) && !isKnown(entry, form.stage))
}

export type Status = 'new' | 'learning' | 'mastered'
export function statusOf(entry: VocabEntry): Status {
  if (!entry.review && !(entry.forms || []).some(form => form.review)) return 'new'
  return stagesOf(entry).every(stage => isDone(entry, stage.key)) ? 'mastered' : 'learning'
}
export const dueCards = (entry: VocabEntry, now = Date.now()) => activeForms(entry).filter(form => !!form.review && form.review.due <= endOfDay(now))
// New cards in stage order. A `withPrevious` stage's cards wait until the stage before it has
// cards, so a verb's meanings always come before its present tense.
export function newCards(entry: VocabEntry) {
  const stages = stagesOf(entry)
  const ready = (stage: string) => {
    const i = stages.findIndex(item => item.key === stage)
    return i <= 0 || !stages[i].withPrevious || formsIn(entry, stages[i - 1].key).length > 0
  }
  const order = (form: FormCard) => stages.findIndex(stage => stage.key === form.stage)
  return activeForms(entry).filter(form => !form.review && ready(form.stage)).sort((a, b) => order(a) - order(b))
}

// A study card: a saved word on its own (its dictionary form and meanings; `form` is null) or
// one of its form cards in a sentence. A word card's schedule is the entry's own `review`.
export type Card = { entry: VocabEntry; form: FormCard | null }
export const cardKey = ({ entry, form }: Card) => `${entry.id}:${form ? form.key : 'word'}`
export const reviewOf = ({ entry, form }: Card) => (form ? form.review : entry.review)
const wordDue = (entry: VocabEntry, now: number) => !isKnownWord(entry) && !!entry.review && entry.review.due <= endOfDay(now)

// What to study: word cards, sentence cards or both, in smart or shuffled order.
export type Include = 'words' | 'sentences' | 'both'
export type Order = 'smart' | 'shuffle'
// Everything there is to study, as one deck the learner goes through for as long as they like:
// a card for each saved word and the form cards of its open stages (new ones in stage order).
// Smart order: what is due (most overdue first), then new cards (oldest saved word first), then
// the rest (soonest due first). Either way, two cards of one word aren't back to back where
// another card can go between.
export function deckOf(entries: VocabEntry[], { include, order }: { include: Include; order: Order }, now = Date.now(), seed = String(now)): Card[] {
  const cards: Card[] = entries.flatMap(entry => [
    ...(include === 'sentences' || isKnownWord(entry) ? [] : [{ entry, form: null }]),
    ...(include === 'words' ? [] : [...activeForms(entry).filter(form => !!form.review), ...newCards(entry)].map(form => ({ entry, form }))),
  ])
  if (order === 'shuffle') return spread(shuffle(cards, seed))
  const rank = (card: Card) => { const review = reviewOf(card); return !review ? 1 : review.due <= endOfDay(now) ? 0 : 2 }
  // Sorting is stable, so a new word's cards keep their stage order.
  return spread([...cards].sort((a, b) => rank(a) - rank(b)
    || (rank(a) === 1 ? a.entry.createdAt - b.entry.createdAt : reviewOf(a)!.due - reviewOf(b)!.due)))
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

// For the Vocabulary screen: cards due today (word cards and form cards) and word counts.
export function countsOf(entries: VocabEntry[], now = Date.now()) {
  return {
    saved: entries.length,
    due: entries.reduce((sum, entry) => sum + dueCards(entry, now).length + Number(wordDue(entry, now)), 0),
    learning: entries.filter(entry => statusOf(entry) === 'learning').length,
    mastered: entries.filter(entry => statusOf(entry) === 'mastered').length,
  }
}
export const isDue = (entry: VocabEntry, now = Date.now()) => wordDue(entry, now) || dueCards(entry, now).length > 0 || newCards(entry).length > 0

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
// same part of speech first: the Hebrew word, or for a word card shown in Hebrew its English
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
  const others = shuffle(entries.filter(item => item.id !== entry.id && item.partOfSpeech !== 'phrase'), seed)
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

// A card's result: its next review, how often it was right (Hard counts), and the days it was
// answered with Got it, which is what makes a form solid.
// A card studied before it is due keeps its schedule on Got it, so studying ahead can't push
// it weeks away; Hard brings it back by tomorrow and Again resets it as usual.
// A word card is answered the same way, with the entry's own review.
export type Result = Pick<FormCard, 'review' | 'correct' | 'goodDays'>
export function answer(form: Result, rating: Rating, now = Date.now()): Result {
  const day = dayOf(now)
  const goodDays = rating === 'good' && !form.goodDays?.includes(day) ? [...(form.goodDays || []), day].slice(-5) : form.goodDays || []
  const early = !!form.review && form.review.due > endOfDay(now) && rating !== 'again'
  const review = early ? { ...form.review!, last: now, due: rating === 'hard' ? Math.min(form.review!.due, now + DAY) : form.review!.due } : grade(form.review, rating, now)
  return { review, correct: (form.correct ?? 0) + (rating === 'again' ? 0 : 1), goodDays }
}

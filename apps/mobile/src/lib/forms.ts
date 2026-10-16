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
export const slotLabel = (entry: VocabEntry, form: FormCard) => stagesOf(entry).find(stage => stage.key === form.stage)?.slots[form.slot] ?? form.slot

// Local calendar day, so "two different days" means what it says to the learner.
export const dayOf = (now: number) => { const date = new Date(now); return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}` }
export const isSolid = (form: FormCard) => (form.goodDays?.length ?? 0) >= 2
export const formsIn = (entry: VocabEntry, stage: string) => (entry.forms || []).filter(form => form.stage === stage)
const isKnown = (entry: VocabEntry, stage: string) => !!entry.known?.includes(stage)
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
  if (!(entry.forms || []).some(form => form.review)) return 'new'
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

export type Card = { entry: VocabEntry; form: FormCard }
// Today's practice: cards due for review (most overdue first), then new cards, oldest saved
// word first and taking turns between words, up to `newPerDay` new cards a day. Forms of the
// same word are kept apart so one doesn't give the next away.
export function practiceQueue(entries: VocabEntry[], now = Date.now(), newPerDay = 10): Card[] {
  const today = dayOf(now)
  const reviews = entries.flatMap(entry => dueCards(entry, now).map(form => ({ entry, form })))
    .sort((a, b) => a.form.review!.due - b.form.review!.due)
  const startedToday = entries.flatMap(entry => entry.forms || []).filter(form => form.review?.first && dayOf(form.review.first) === today).length
  const waiting = [...entries].sort((a, b) => a.createdAt - b.createdAt).map(entry => newCards(entry).map(form => ({ entry, form })))
  const fresh: Card[] = []
  for (let round = 0; fresh.length < newPerDay - startedToday && waiting.some(list => list.length > round); round++) {
    for (const list of waiting) if (list[round] && fresh.length < newPerDay - startedToday) fresh.push(list[round])
  }
  return spread([...reviews, ...fresh])
}
// Reorders so two cards of the same word are not back to back, where another card can go between.
export function spread(cards: Card[]): Card[] {
  const left = [...cards]
  const out: Card[] = []
  while (left.length) {
    const previous = out[out.length - 1]?.entry.id
    const i = left.findIndex(card => card.entry.id !== previous)
    out.push(...left.splice(i === -1 ? 0 : i, 1))
  }
  return out
}

// Extra practice, after the day's cards are done: cards not yet due (soonest first), then new
// cards past the daily limit, then cards already practiced today.
export function extraQueue(entries: VocabEntry[], now = Date.now(), size = 20): Card[] {
  const today = dayOf(now)
  const rank = ({ form }: Card) => (!form.review ? 1 : form.review.last && dayOf(form.review.last) === today ? 2 : 0)
  const cards = entries.flatMap(entry => activeForms(entry).map(form => ({ entry, form })))
    .sort((a, b) => rank(a) - rank(b) || (a.form.review?.due ?? a.entry.createdAt) - (b.form.review?.due ?? b.entry.createdAt))
  return spread(cards.slice(0, size))
}

export function countsOf(entries: VocabEntry[], now = Date.now()) {
  return {
    saved: entries.length,
    due: practiceQueue(entries, now).length,
    learning: entries.filter(entry => statusOf(entry) === 'learning').length,
    mastered: entries.filter(entry => statusOf(entry) === 'mastered').length,
  }
}
export const isDue = (entry: VocabEntry, now = Date.now()) => dueCards(entry, now).length > 0 || newCards(entry).length > 0

// A new card is read first (what does the marked word mean?). Once it has been answered right
// it is asked the other way: a meaning card from English (recall the Hebrew word, then grade
// yourself), a form card by filling the blank with one of the word's own forms.
export type Drill = 'read' | 'recall' | 'choose'
export const drillOf = (form: FormCard): Drill => ((form.correct ?? 0) === 0 ? 'read' : form.stage === 'meanings' ? 'recall' : 'choose')

// Up to four options: this form and other forms of the same word, same stage first. Fewer
// than three options would make the choice trivial, so then the card is read instead.
export function choicesFor(entry: VocabEntry, form: FormCard, seed: string): string[] | null {
  const bare = (text: string) => stripNiqqud(text)
  const others = (entry.forms || []).filter(other => bare(other.he) !== bare(form.he))
    .sort((a, b) => Number(b.stage === form.stage) - Number(a.stage === form.stage))
  const picked: string[] = []
  for (const other of others) if (picked.length < 3 && !picked.some(item => bare(item) === bare(other.he))) picked.push(other.he)
  if (picked.length < 2) return null
  return shuffle([form.he, ...picked], seed)
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
// A card practiced before it is due (extra practice) keeps its schedule on Got it, so drilling
// ahead can't push it weeks away; Hard brings it back by tomorrow and Again resets it as usual.
export function answer(form: FormCard, rating: Rating, now = Date.now()): Pick<FormCard, 'review' | 'correct' | 'goodDays'> {
  const day = dayOf(now)
  const goodDays = rating === 'good' && !form.goodDays?.includes(day) ? [...(form.goodDays || []), day].slice(-5) : form.goodDays || []
  const early = !!form.review && form.review.due > endOfDay(now) && rating !== 'again'
  const review = early ? { ...form.review!, last: now, due: rating === 'hard' ? Math.min(form.review!.due, now + DAY) : form.review!.due } : grade(form.review, rating, now)
  return { review, correct: (form.correct ?? 0) + (rating === 'again' ? 0 : 1), goodDays }
}

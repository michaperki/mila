import { type Card, cardKey, cardName, type ChoiceMode, type Considered, exerciseOf, firstSense, frontFor, justAfterItsWord, quizOf, sentenceFor, shownForm } from './forms.ts'
import type { VocabEntry } from './types'

// Learning Insights → Upcoming (consolidation phase B, 2026-11-19): the cards Study will show
// next, as it will show them, in plain words. Each card says what it is (the word, its form, its
// English), how it will be asked and why it is in the round. How it is asked comes from the same
// rules Study applies when the card comes up (lib/forms.ts frontFor, exerciseOf, sentenceFor,
// quizOf), with the words as they are now: an answer before then can still change it.

export type Asked = { kind: 'flashcard' | 'choice' | 'checkpoint'; label: string }
export type UpcomingRow = { key: string; wordId: string; hebrew: string; english: string; card: string; asked: Asked; reason: string; sequence: boolean }
export type AskSettings = { front: 'he' | 'en' | 'mixed'; choices: ChoiceMode }

// How the card at `at` of a round (its first card at `start`) will be asked.
export function askedOf(deck: Card[], at: number, start: number, entries: VocabEntry[], settings: AskSettings): Asked {
  const card = deck[at]
  if (card.checkpoint) return { kind: 'checkpoint', label: 'Checkpoint: the whole tense from memory' }
  const entry = entries.find(item => item.id === card.entry.id) ?? card.entry
  const stored = card.form ? entry.forms?.find(item => item.key === card.form!.key) ?? card.form : null
  const record = stored ?? entry
  const english = frontFor(card, at - start, settings.front) === 'en' && (!stored || !!stored.translation)
  const sentence = !stored ? undefined : card.variant !== undefined
    ? { variant: card.variant, why: 'asked' as const, fresh: !(stored.seen || []).includes(card.variant) }
    : sentenceFor(stored, record)
  const exercise = exerciseOf(card, record, settings.choices, justAfterItsWord(deck, at, start), sentence)
  const shown = stored ? shownForm(stored, sentence?.variant ?? 0) : null
  const quiz = exercise.choice ? quizOf(entries, { entry, form: shown }, !english, `${cardKey(card)}-${record.results?.length ?? 0}`) : null
  const fresh = !!sentence?.fresh && (sentence.variant ?? 0) > 0 ? ', a sentence new to you' : ''
  if (quiz) return { kind: 'choice', label: `Fill in the blank: ${stored && stored.stage !== 'meanings' ? 'choose the form' : stored ? 'choose the word' : english ? 'choose the word' : 'choose its meaning'}${fresh}` }
  return { kind: 'flashcard', label: `Flashcard, ${english ? 'English' : 'Hebrew'} first${fresh}` }
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
// Why a card is in the round, in a line: from what the plan noted when it chose it (`considered`,
// with the facts behind it), or else from the reason the card carries (a round already under way).
export function reasonOf(card: Card, considered?: Considered): string {
  if (card.sequence) return 'Right after its word: a new word’s sentences follow it as it is learned'
  // Unified: its kind, and how likely it is recalled now (unified · review · recall now 45%).
  if (card.why?.startsWith('unified · ')) return capital(card.why.slice('unified · '.length)
    .replace('reinforce: first studied lately', 'reinforce: you started it in the last few days').replace('recall now', 'recall now about'))
  if (considered) {
    const [first, second] = considered.factors
    if (considered.slot === 'review') return `Due for review: ${first}`
    if (considered.slot === 'early') return `Not due yet, room in the round: ${first}`
    if (considered.slot === 'familiar') return `A check on a word you know: ${second ?? first}`
    if (considered.slot === 'checkpoint') return `Checkpoint: ${considered.why}`
    return capital(considered.why)
  }
  const [head, ...rest] = (card.why ?? '').split(' · ')
  const tail = rest.join(', ')
  const labels: Record<string, string> = { 'still learning': 'Still learning', 'next for this word': 'The word’s next card', 'new word': 'New word', familiar: 'A check on a word you know', checkpoint: 'Checkpoint', 'new sentence': 'New sentence', shuffled: 'Shuffled' }
  return head ? `${labels[head] ?? capital(head)}${tail ? `: ${tail}` : ''}` : ''
}

// A round's cards from `from` on, each as Upcoming lists it. `considered`: the plan's notes, for a
// round being planned now.
export function upcomingRows(deck: Card[], from: number, entries: VocabEntry[], settings: AskSettings, considered: Considered[] = []): UpcomingRow[] {
  const noted = new Map(considered.filter(item => item.chosen).map(item => [item.key, item]))
  return deck.slice(from).map((card, i) => {
    const entry = entries.find(item => item.id === card.entry.id) ?? card.entry
    const form = card.form ? entry.forms?.find(item => item.key === card.form!.key) ?? card.form : null
    return {
      key: cardKey(card), wordId: entry.id, hebrew: entry.lemmaPlain || entry.lemma,
      english: form && form.stage !== 'meanings' ? form.en : firstSense(form?.en || entry.gloss || ''),
      card: cardName(card), asked: askedOf(deck, from + i, 0, entries, settings), reason: reasonOf(card, noted.get(cardKey(card))), sequence: !!card.sequence,
    }
  })
}

// The rule the round was planned by, in a sentence or two.
export function ruleOf(order: 'smart' | 'shuffle', planner: 'standard' | 'unified') {
  if (order === 'shuffle') return 'Shuffled: the words you’ve started, in a random order.'
  if (planner === 'unified') return 'Unified order (experimental): each word’s value is how useful it is × how much practising it now would help you remember it a month from now. The round takes the most valuable, with new words early.'
  return 'Words due for review come first: a word is due a day after you miss it and two days after you get it right. Then words not due yet if there’s room, then new words (fewer while reviews wait), and now and then a check on a word you know.'
}

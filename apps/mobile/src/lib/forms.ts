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
// `withPrevious`: opens together with the stage before it once the word is met; `fromSave` too: from
// the moment the word is saved, so a new verb can be practised in the present at once.
export type Stage = { key: string; label: string; slots: Record<string, string>; withPrevious?: boolean; fromSave?: boolean }
const PERSONS = { '1sg': 'I', '2sg.m': 'you (m.)', '2sg.f': 'you (f.)', '3sg.m': 'he', '3sg.f': 'she', '1pl': 'we' }
const MEANINGS: Stage = { key: 'meanings', label: 'Meanings', slots: { sense1: 'meaning 1', sense2: 'meaning 2', sense3: 'meaning 3' } }
const STAGES: Record<Kind, Stage[]> = {
  verb: [
    MEANINGS,
    { key: 'present', label: 'Present', withPrevious: true, fromSave: true, slots: { 'm.sg': 'm. singular', 'f.sg': 'f. singular', 'm.pl': 'm. plural', 'f.pl': 'f. plural' } },
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
// Who a card's form is for, shown beside its English when the English doesn't say and the Hebrew
// depends on it ("you were tired" to a woman: 👩). Cards say so when written; cards written before
// say it only where English never can, from their slot: "you" in the past and future, and commands.
const PERSON_CUES: Record<string, string> = { '2sg.m': '👨', '2sg.f': '👩', '2pl.m': '👨👨', '2pl.f': '👩👩', '2pl': '👨👩' }
const COMMAND_CUES: Record<string, string> = { 'm.sg': '👨', 'f.sg': '👩', pl: '👨👩' }
export const cueOf = (form: Pick<FormCard, 'stage' | 'slot' | 'cue'>) => form.cue
  ?? ((form.stage === 'past' || form.stage === 'future' ? PERSON_CUES[form.slot] : form.stage === 'imperative' ? COMMAND_CUES[form.slot] : undefined) || '')
// Every cue a card's English shows, each with the word it goes after: the people its sentence
// leaves open on cards written since, else its one cue (after "you" on cards written before cues
// when that is who it is for).
export function cuesOf(form: Pick<FormCard, 'stage' | 'slot' | 'cue' | 'cueAfter' | 'cues'>) {
  if (form.cues) return form.cues.filter(item => !!item.cue)
  const cue = cueOf(form)
  return cue ? [{ cue, after: form.cueAfter || (form.cue === undefined ? 'you' : '') }] : []
}

// The card's English with each cue right after the word it is about ("The doctor's secretary 👩
// booked me an appointment", "Why are you 👨 tired?", "Don't buy this coat if you 👨 might regret
// it"): after the first time that word appears, after the whole word when that is a contraction
// ("I'm 👩"), before any punctuation. A cue whose word isn't there goes first.
export function cuedTranslation(form: Pick<FormCard, 'stage' | 'slot' | 'cue' | 'cueAfter' | 'cues' | 'translation'>) {
  const text = form.translation
  const first: string[] = []
  const placed: { end: number; cue: string }[] = []
  for (const { cue, after } of cuesOf(form)) {
    const found = after ? new RegExp(`(^|[^\\p{L}])(${after.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\p{L}])`, 'iu').exec(text) : null
    if (!found) { first.push(cue); continue }
    let end = found.index + found[1].length + found[2].length
    while (end < text.length && /[\p{L}'’]/u.test(text[end])) end++
    const same = placed.find(item => item.end === end)
    if (same) same.cue += cue
    else placed.push({ end, cue })
  }
  let cued = text
  for (const { end, cue } of placed.sort((a, b) => b.end - a.end)) cued = `${cued.slice(0, end)} ${cue}${cued.slice(end)}`
  return first.length ? `${first.join(' ')} ${cued}` : cued
}

export const kindLabel = (entry: VocabEntry) => (entry.partOfSpeech === 'noun' && entry.gender ? `${entry.gender} noun` : entry.partOfSpeech || '')
export const slotLabel = (entry: VocabEntry, form: FormCard) => stagesOf(entry).find(stage => stage.key === form.stage)?.slots[form.slot] ?? form.slot

// Local calendar day.
export const dayOf = (now: number) => { const date = new Date(now); return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}` }

// What studying shows, and what Mila does with it. A swipe says whether the learner knew a card;
// each card keeps its last few results, never a date to come back. An answer given just after the
// word's Hebrew was shown (a card brought in by a learning sequence, or the same word a few cards
// or minutes before: isPrimed) is kept marked as primed: it shows what was just seen, not what is
// remembered. An answer chosen from options (fill in the blank) is kept marked the same way: it
// shows the word was recognised, not recalled unaided. A card is familiar when its latest answers
// were right and at least one of them was unaided, so choosing right can keep a card familiar or
// confirm a recall but never make it familiar alone; a wrong answer only makes it learning again:
// nothing resets. A stage is
// familiar when about half its cards are (or a checkpoint went well), and then Mila brings in
// the next stage; it is ready when nearly all are, or when most recent checkpoints were nailed.
// A round takes the words already started in turn, a few cards each, and brings in a few new
// ones (studyPool). The numbers live here so they can be tuned in one place.
export const ProgressRules = {
  kept: 3, // results kept per card and per checkpoint
  familiarAfter: 2, // the latest answers that must be right for a card to be familiar
  familiarShare: 0.5, // share of a stage's cards familiar for the stage to be familiar
  readySlackFrom: 4, // a stage of this many cards or more is ready with one card still learning
  checkpointsReady: 2, // nailed checkpoints, of those kept, that make a stage ready
  roundSize: 18, // cards in a round, besides familiar ones and those learning sequences bring in
  newWords: 3, // words seen for the first time in a round
  newWordsMax: 6, // ...up to this many when the words already started don't fill it
  recentDays: 3, // a word saved this recently comes in as a recent save (intakeOrder)
  perWord: 2, // cards a round takes of each started word
  familiarEvery: 3, // one familiar card for about this many others in a round
  familiarRestDays: 3, // a familiar card comes back once it hasn't been seen for this many days
  sequenceLongest: 3, // cards of one word back to back in a learning sequence, at most
  primedCards: 6, // an answer is primed when a card of the same word was shown this few cards
  primedMinutes: 10, // before it, or this many minutes, or the card came in a learning sequence
  dueAfterMissDays: 1, // a started word is due for review this many days after a missed answer
  dueAfterRightDays: 2, // ...and this many after a right one (dueOf)
  backlogFewer: 8, // with this many due words left out of a round, it takes 2 new words
  backlogFewest: 20, // ...and with this many, 1
}
const DAY = 86_400_000

export type CardState = 'new' | 'learning' | 'familiar'
// `primed`, by position, says which of `results` were primed; older answers have none.
export function cardState(results?: boolean[], primed?: boolean[]): CardState {
  if (!results?.length) return 'new'
  const from = results.length - ProgressRules.familiarAfter
  const latest = results.slice(-ProgressRules.familiarAfter)
  const recalled = latest.some((knew, i) => knew && !primed?.[from + i])
  return latest.length === ProgressRules.familiarAfter && latest.every(Boolean) && recalled ? 'familiar' : 'learning'
}
export const stateOf = (card: Results) => cardState(card.results, card.primed)
export const isFamiliar = (card: Results) => stateOf(card) === 'familiar'
// Right lately but never unaided: one recall away from familiar, so it is asked as a flashcard.
export function awaitsRecall({ results, primed }: Results) {
  if (!results || results.length < ProgressRules.familiarAfter) return false
  const from = results.length - ProgressRules.familiarAfter
  return results.slice(from).every(Boolean) && results.slice(from).every((_, i) => !!primed?.[from + i])
}
// A card's record after an answer: its latest results, which of them were primed, and when it
// was answered.
export type Answered = Required<Pick<Results, 'results' | 'primed' | 'last'>>
export function assess(card: Results, knew: boolean, now = Date.now(), primed = false): Answered {
  const results = [...(card.results || []), knew]
  const marks = [...(card.results || []).map((_, i) => !!card.primed?.[i]), primed]
  return { results: results.slice(-ProgressRules.kept), primed: marks.slice(-ProgressRules.kept), last: now }
}
// When something was last shown in this session: how many cards ago (1: the card just before) and
// how long ago, or null if it wasn't. `seen` is the session's cards in the order shown.
export type Seen = { key: string; word: string; at: number }
export type Exposure = { cardsAgo: number; msAgo: number } | null
export function exposureOf(seen: Seen[], match: (item: Seen) => boolean, now = Date.now()): Exposure {
  for (let i = seen.length - 1; i >= 0; i--) if (match(seen[i])) return { cardsAgo: seen.length - i, msAgo: now - seen[i].at }
  return null
}
// Whether an answer only shows what was just seen: the card came in a learning sequence, or a
// card of the same word (and so its Hebrew) was shown a few cards or minutes before, in this
// session (`cardsAgo`, `msAgo`) or, going by when the word was last answered, just before it.
export function isPrimed({ sequence, cardsAgo, msAgo, lastAnswered }: { sequence?: boolean; cardsAgo?: number | null; msAgo?: number | null; lastAnswered?: number }, now = Date.now()) {
  const window = ProgressRules.primedMinutes * 60_000
  return !!sequence || (cardsAgo != null && cardsAgo <= ProgressRules.primedCards)
    || (msAgo != null && msAgo <= window) || (!!lastAnswered && now - lastAnswered <= window)
}

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
// A stage's checkpoint record (its results, which were primed, when last done).
export const checkpointRecord = (entry: VocabEntry, stage: string): Results =>
  ({ results: checkpointsOf(entry, stage), primed: entry.checkpoints?.[stage]?.primed, last: entry.checkpoints?.[stage]?.last })

// How a stage is going, from its cards and checkpoints (only those nailed without being primed).
export type Progress = 'new' | 'learning' | 'familiar' | 'ready'
export function stageProgress(entry: VocabEntry, stage: string): Progress {
  const forms = formsIn(entry, stage)
  const familiar = forms.filter(isFamiliar).length
  const { primed } = checkpointRecord(entry, stage)
  const nailed = checkpointsOf(entry, stage).filter((knew, i) => knew && !primed?.[i]).length
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
// Being met only ends its learning sequence; an answer primed by that sequence still counts here,
// since it says nothing more than that the word has been introduced (familiarity is what doesn't
// count primed answers).
export const isMet = (entry: VocabEntry) => !!entry.results?.some(Boolean)
  || formsIn(entry, 'meanings').some(form => form.results?.some(Boolean)) || isKnown(entry, 'meanings')

// The stages Mila has brought in: the first always; a `withPrevious` stage with the one before
// it once the word is met (or once it has been studied), or from the start if it is `fromSave`;
// any other once every stage brought in so far is familiar (or marked known).
export function recommendedStages(entry: VocabEntry): Stage[] {
  const stages = stagesOf(entry)
  const open = [stages[0]]
  for (let i = 1; i < stages.length; i++) {
    const comes = stages[i].withPrevious
      ? !!stages[i].fromSave || isMet(entry) || practisedStage(entry, stages[i].key)
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
// says why the round has it, for the learner who asks (practice.tsx); `sequence`, that it was
// brought in behind the card before it (followUps).
// `variant`: which of the card's sentences a round of new sentences shows (shownForm); otherwise
// it is chosen as the card comes up (variantOf).
// `mode: 'fresh'`: in a round of new sentences, a different setting from an ordinary round.
export type Card = { entry: VocabEntry; form: FormCard | null; checkpoint?: string; why?: string; sequence?: boolean; variant?: number; mode?: 'fresh' }
export const cardKey = ({ entry, form, checkpoint }: Card) => `${entry.id}:${checkpoint ? `checkpoint:${checkpoint}` : form ? form.key : 'word'}`
export const resultsOf = ({ entry, form, checkpoint }: Card): Results => (checkpoint ? checkpointRecord(entry, checkpoint) : form ?? entry)

// A checkpoint is offered for a stage that is familiar but not ready, at most once a day.
export function checkpointStages(entry: VocabEntry, now = Date.now()) {
  if (isKnownWord(entry)) return []
  return openStages(entry).filter(stage => checkpointGroup(entry, stage.key) && !isKnown(entry, stage.key)
    && stageProgress(entry, stage.key) === 'familiar'
    && !(entry.checkpoints?.[stage.key] && dayOf(entry.checkpoints[stage.key].last) === dayOf(now))).map(stage => stage.key)
}

// The saved words as Study sees them. Started: practised and not yet through (mastered, marked
// known, or, studying words only, a familiar word card), least recently studied first, which is
// the order a round takes them in, so every started word gets its turn and none holds its place
// by having just been studied. Not started: in the order they come in (intakeOrder). Nothing is
// stored: it follows from how each word is going.
export type Source = 'again' | 'recent' | 'earlier'
export type Intake = { entry: VocabEntry; source: Source }
export type Pool = { started: VocabEntry[]; unstarted: Intake[]; through: number }
export const lastStudied = (entry: VocabEntry) => Math.max(entry.last ?? 0, ...(entry.forms || []).map(form => form.last ?? 0),
  ...Object.values(entry.checkpoints || {}).map(item => item.last ?? 0))
export function studyPool(entries: VocabEntry[], include: Include = 'both', now = Date.now()): Pool {
  const through = (entry: VocabEntry) => isKnownWord(entry) || statusOf(entry) === 'mastered'
    || (include === 'words' && cardState(entry.results, entry.primed) === 'familiar')
  const started = entries.filter(entry => practised(entry) && !through(entry))
    .sort((a, b) => lastStudied(a) - lastStudied(b) || a.createdAt - b.createdAt)
  const unstarted = intakeOrder(entries.filter(entry => !practised(entry) && !isKnownWord(entry)), now)
  return { started, unstarted, through: entries.filter(through).length }
}
// The order words not yet started come in, from three places in turn so that no part of what was
// saved waits forever: a word met again since it was saved, in reading or looked up again ('again',
// the one met most recently first), a recent save ('recent', newest first), and any other
// ('earlier'), the more common words first (by `rank`, how common the word is in Hebrew: the 3,000
// most common, then the rest of the 10,000 and words without a rank, then rarer ones), each group in
// an order shuffled afresh each day and kept all day, so one round after another goes on through
// it. A rare word met again still comes in as 'again'. Which place goes first changes from day to
// day, so short sessions, which meet only a word or two, don't always take theirs from the same one.
export const COMMON_RANK = 3000
const UNCOMMON_RANK = 10000
const commonness = (entry: VocabEntry) => (!entry.rank || entry.rank <= UNCOMMON_RANK ? (entry.rank && entry.rank <= COMMON_RANK ? 0 : 1) : 2)
export function intakeOrder(entries: VocabEntry[], now = Date.now()): Intake[] {
  const metLast = (entry: VocabEntry) => Math.max(0, entry.lookedUp?.last ?? 0, ...(entry.encounters || []).map(item => item.at || 0))
  const again = entries.filter(entry => (entry.encounters?.length ?? 0) > 1 || !!entry.lookedUp?.count).sort((a, b) => metLast(b) - metLast(a))
  const recent = entries.filter(entry => !again.includes(entry) && now - entry.createdAt < ProgressRules.recentDays * DAY)
    .sort((a, b) => b.createdAt - a.createdAt)
  const rest = entries.filter(entry => !again.includes(entry) && !recent.includes(entry)).sort((a, b) => a.createdAt - b.createdAt)
  const earlier = [0, 1, 2].flatMap(group => shuffle(rest.filter(entry => commonness(entry) === group), `${dayOf(now)}:${group}`))
  const day = Math.floor(new Date(now).setHours(0, 0, 0, 0) / DAY)
  const sources: [Source, VocabEntry[]][] = [['again', again], ['recent', recent], ['earlier', earlier]]
  const queues = [...sources.slice(day % 3), ...sources.slice(0, day % 3)]
  const out: Intake[] = []
  for (let i = 0; out.length < entries.length; i++) {
    for (const [source, queue] of queues) if (i < queue.length) out.push({ entry: queue[i], source })
  }
  return out
}
const sourceWhy = ({ entry, source }: Intake, now: number) =>
  (source === 'again' ? ((entry.encounters?.length ?? 0) > 1 ? 'met again in reading' : 'looked up again')
    : `${source === 'earlier' && entry.rank && entry.rank <= COMMON_RANK ? 'common word · ' : ''}saved ${ago(entry.createdAt, now)}`)
// What to study: word cards, sentence cards or both, in smart or shuffled order.
export type Include = 'words' | 'sentences' | 'both'
export type Order = 'smart' | 'shuffle'
// When a started word is next due for review (STUDY-2, first step, 2026-11-17): a day after its
// latest answer if that was missed, two days if it was right, counted in calendar days. Nothing
// more is modelled yet (a memory model per card comes later, in shadow first). `overdue`: how far
// past due, as a share of its interval (1: a whole interval late), which orders the words due.
export type Due = { at: number; days: number; lastRight: boolean; last: number; due: boolean; overdue: number }
const dayStart = (at: number, plusDays = 0) => { const date = new Date(at); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + plusDays); return date.getTime() }
export function dueOf(entry: VocabEntry, now = Date.now()): Due {
  const records: Results[] = [entry, ...(entry.forms || []), ...Object.values(entry.checkpoints || {})]
  const latest = records.filter(record => record.last && record.results?.length).sort((a, b) => (b.last ?? 0) - (a.last ?? 0))[0]
  const last = latest?.last ?? 0
  const lastRight = !!latest?.results?.[latest.results.length - 1]
  const days = lastRight ? ProgressRules.dueAfterRightDays : ProgressRules.dueAfterMissDays
  const at = dayStart(last, days)
  return { at, days, lastRight, last, due: now >= at, overdue: Math.max(0, (now - at) / (days * DAY)) }
}
// Started words in the order a round takes them: those due first, the least overdue for their
// interval first (so a word met yesterday is reviewed today, while a backlog is worked through
// behind it rather than keeping it waiting), then those not due yet, least recently studied first.
export function byDue(started: VocabEntry[], now = Date.now()) {
  const with_ = started.map(entry => ({ entry, due: dueOf(entry, now) }))
  const due = with_.filter(item => item.due.due).sort((a, b) => a.due.overdue - b.due.overdue || a.due.last - b.due.last)
  const early = with_.filter(item => !item.due.due).sort((a, b) => a.due.last - b.due.last)
  return { due, early }
}

// A card in words: "word card", "meaning 1", "Present, m. singular", "Past checkpoint".
export const cardName = (card: Card) => (card.checkpoint ? `${stageLabel(card.entry, card.checkpoint)} checkpoint` : card.form ? (card.form.stage === 'meanings' ? slotLabel(card.entry, card.form) : `${stageLabel(card.entry, card.form.stage)}, ${slotLabel(card.entry, card.form)}`) : 'word card')
// A round as planned, with every card it considered and why it did or didn't take it (Learning
// Insights → Upcoming): `slot` is the part of the round a card was considered for, `chosen`
// whether it is in the round, `why` the reason in words (for a card left out, what kept it out),
// `factors` what the decision rested on. `budget`: how the round was divided, in words.
export type Slot = 'review' | 'early' | 'new' | 'familiar' | 'checkpoint' | 'shuffled'
export type Considered = { key: string; wordId: string; lemma: string; card: string; slot: Slot; chosen: boolean; why: string; factors: string[]; rank: number }
export type Plan = { cards: Card[]; considered: Considered[]; budget: string[] }
// One round of studying, which the learner can go round again for as long as they like. Smart
// order takes the started words due for review (dueOf, byDue), each a couple of cards further
// (ProgressRules.perWord): its word card while it is being learned, then its cards still being
// learned and its next new cards (its meanings, then its forms) in turn, until the round has
// about ProgressRules.roundSize. Words not due yet only fill a round that has room. A started
// word not yet met brings only its word card. A few words not yet started come in each round,
// fewer while many words wait for review (ProgressRules.backlogFewer, backlogFewest), more when
// the started ones don't fill it, as their word cards (in sentences only, their first meaning),
// their next cards following as they are answered (followUps); the first comes early in the
// round, so a short session meets one too. Mixed in among them, familiar cards now and then:
// those not seen for a few days (ProgressRules.familiarRestDays), least recently seen first and
// one per word, so what is known comes back without the same few coming round every time; then
// checkpoints of the words whose turn it was. Shuffled: everything in play, shuffled. Either way,
// a word not yet met shows only its word card (in sentences only, its meanings), and two cards of
// one word aren't back to back where another can go between.
export const deckOf = (entries: VocabEntry[], settings: { include: Include; order: Order }, now = Date.now(), seed = String(now)): Card[] =>
  planRound(entries, settings, now, seed).cards
export function planRound(entries: VocabEntry[], { include, order }: { include: Include; order: Order }, now = Date.now(), seed = String(now)): Plan {
  const studied = entries.filter(entry => !isKnownWord(entry))
  const deeper = (entry: VocabEntry) => (include === 'sentences' || isMet(entry) ? newCards(entry) : [])
  const cardsOf = (entry: VocabEntry): Card[] => [
    ...(include === 'sentences' ? [] : [{ entry, form: null }]),
    ...(include === 'words' ? [] : [...activeForms(entry).filter(form => !!form.results?.length), ...deeper(entry)].map(form => ({ entry, form }))),
  ]
  const checkpointsOf = (entry: VocabEntry): Card[] => include !== 'both' ? []
    : checkpointStages(entry, now).map(stage => ({ entry, form: null, checkpoint: stage, why: `checkpoint · ${stageLabel(entry, stage)} is familiar, not yet ready` }))
  const considered: Considered[] = []
  const lemmaOf = (entry: VocabEntry) => entry.lemmaPlain || entry.lemma
  const labelOf = cardName
  const note = (card: Card, slot: Slot, chosen: boolean, why: string, factors: string[], rank: number) =>
    considered.push({ key: cardKey(card), wordId: card.entry.id, lemma: lemmaOf(card.entry), card: labelOf(card), slot, chosen, why, factors, rank })
  const usefulness = (entry: VocabEntry) => [
    entry.rank ? `${entry.rank <= COMMON_RANK ? 'common' : entry.rank <= UNCOMMON_RANK ? 'less common' : 'rare'}, #${entry.rank}` : 'not in the frequency list',
    ...(entry.lookedUp?.count ? [`looked up again ${entry.lookedUp.count}×`] : []),
  ]
  if (order === 'shuffle') {
    const cards = spread(shuffle(studied.flatMap(entry => [...cardsOf(entry), ...checkpointsOf(entry)]), seed).map(card => ({ why: 'shuffled', ...card })))
    cards.forEach((card, i) => note(card, 'shuffled', true, 'shuffled', [], i + 1))
    return { cards, considered, budget: ['Shuffled: every card in play, in random order'] }
  }
  const rules = ProgressRules
  const state = (card: Card) => stateOf(resultsOf(card))
  const lastOf = (card: Card) => resultsOf(card).last ?? 0
  const explain = (card: Card): Card => ({ ...card, why: state(card) === 'learning' ? `still learning · last seen ${ago(lastOf(card), now)}`
    : `next for this word · ${card.form ? stageLabel(card.entry, card.form.stage) : 'Word'}` })
  const { started, unstarted } = studyPool(entries, include, now)
  const { due, early } = byDue(started, now)
  const dueText = (item: { due: Due }) => [
    `last answer ${item.due.lastRight ? 'right' : 'missed'}, ${ago(item.due.last, now)}`,
    item.due.due ? `due ${ago(item.due.at, now) === 'today' ? 'today' : `since ${ago(item.due.at, now)}`}, reviewed ${plural(item.due.days, 'day')} after an answer like that` : `due ${inDays(item.due.at, now)}`,
  ]
  const taken: Card[] = []
  const turned: VocabEntry[] = []
  // A word's turn: the cards it brings, and those it could have brought but doesn't this round.
  const turnOf = (entry: VocabEntry, room: number, slot: Slot, factors: string[], rank: number) => {
    turned.push(entry)
    const cards = cardsOf(entry)
    const word = cards.filter(card => !card.form && state(card) !== 'familiar')
    // Not met: its word card alone, its next cards following as it is answered.
    if (!isMet(entry) && include !== 'sentences') {
      word.forEach(card => note(card, slot, true, 'not met yet: its word card alone, its sentences following as it is answered', factors, rank))
      cards.filter(card => card.form).slice(0, 2).forEach(card => note(card, slot, false, 'waits until the word is met: its word card comes first', factors, rank))
      taken.push(...word.map(explain))
      return
    }
    const learning = cards.filter(card => card.form && state(card) === 'learning').sort((a, b) => lastOf(a) - lastOf(b))
    // A new card showing a use other than the card it comes with and the one answered last.
    const fresh = apart(cards.filter(card => card.form && state(card) === 'new'), [learning[0]?.form, lastAnswered(entry)])
    const turn = [...word]
    for (let i = 0; turn.length < rules.perWord && (i < learning.length || i < fresh.length); i++) turn.push(...[learning[i], fresh[i]].filter(Boolean))
    const chosen = turn.slice(0, Math.min(rules.perWord, room - taken.length))
    chosen.forEach(card => note(card, slot, true, state(card) === 'learning' ? 'still being learned' : state(card) === 'new' ? 'the word’s next new card' : 'its word card, while the word is being learned', factors, rank))
    const keys = new Set(chosen.map(cardKey))
    ;[...learning, ...fresh].filter(card => !keys.has(cardKey(card))).slice(0, 3)
      .forEach(card => note(card, slot, false, `the word has its ${plural(chosen.length, 'card')} this round`, factors, rank))
    taken.push(...chosen.map(explain))
  }
  // Words due for review first, until the round's room for started words is full; fewer new
  // words while many due words wait (they would only add to what isn't being reviewed in time).
  let room = rules.roundSize - rules.newWords
  let next = 0
  const takeDue = () => { for (; next < due.length && taken.length < room; next++) turnOf(due[next].entry, room, 'review', [...dueText(due[next]), ...usefulness(due[next].entry)], next + 1) }
  takeDue()
  const waiting = () => due.length - next
  const throttled = waiting() >= rules.backlogFewest ? 1 : waiting() >= rules.backlogFewer ? 2 : null
  if (throttled !== null) { room = rules.roundSize - throttled; takeDue() }
  due.slice(next).forEach((item, i) => note({ entry: item.entry, form: null }, 'review', false, `due, but the round is full: the ${plural(next, 'word')} least late for their review come first`, [...dueText(item), ...usefulness(item.entry)], next + i + 1))
  // Words not due yet only fill a round with room left.
  let filled = 0
  for (const item of early) {
    if (taken.length < room) { turnOf(item.entry, room, 'early', dueText(item), ++filled); continue }
    note({ entry: item.entry, form: null }, 'early', false, `not due yet: ${dueText(item)[1]}`, dueText(item), filled + 1)
  }
  const wanted = throttled ?? Math.min(rules.newWordsMax, Math.max(rules.newWords, rules.roundSize - taken.length))
  const incoming: Card[] = []
  const newWhy = throttled ? `${plural(throttled, 'new word')} this round instead of ${rules.newWords}: ${waiting()} words due for review wait` : `${plural(wanted, 'new word')} this round`
  unstarted.forEach((intake, i) => {
    const { entry } = intake
    const first = include === 'sentences' ? newCards(entry).filter(form => form.stage === 'meanings').slice(0, 1).map(form => ({ entry, form })) : [{ entry, form: null }]
    const factors = [`from ${intake.source === 'again' ? 'words met again' : intake.source === 'recent' ? 'recent saves' : 'everything else saved, common words first'}`, ...usefulness(entry)]
    if (incoming.length < wanted) {
      first.forEach(card => note(card, 'new', true, `new word: ${sourceWhy(intake, now)}`, factors, i + 1))
      incoming.push(...first.map(card => ({ ...card, why: `new word · ${sourceWhy(intake, now)}` })))
    } else if (i < wanted + 8) first.forEach(card => note(card, 'new', false, `waits its turn: ${newWhy}`, factors, i + 1))
  })
  const others = mix(taken, incoming, 0.5)
  const rest = rules.familiarRestDays * DAY
  // A familiar card is a check on what was learned, so only of a word the round doesn't otherwise
  // show: met just after another card of its word, it would only show what that card just primed.
  const inPlay = new Set(others.map(card => card.entry.id))
  const familiar = studied.flatMap(cardsOf).filter(card => state(card) === 'familiar').sort((a, b) => lastOf(a) - lastOf(b))
  const rested = familiar.filter(card => !inPlay.has(card.entry.id) && now - lastOf(card) >= rest).filter((card, i, all) => all.findIndex(other => other.entry.id === card.entry.id) === i)
  const outside = familiar.filter(card => !inPlay.has(card.entry.id))
  const some = (others.length ? rested.slice(0, Math.ceil(others.length / rules.familiarEvery)) : (rested.length ? rested : outside).slice(0, rules.roundSize))
    .map(card => ({ ...card, why: `familiar · last seen ${ago(lastOf(card), now)}` }))
  const checks = new Set(some.map(cardKey))
  familiar.slice(0, 40).forEach((card, i) => {
    const factors = [`familiar: last two answers right`, `last seen ${ago(lastOf(card), now)}`]
    if (checks.has(cardKey(card))) note(card, 'familiar', true, 'a check on what was learned, rested long enough', factors, i + 1)
    else if (inPlay.has(card.entry.id)) note(card, 'familiar', false, 'its word is already in this round, so a check now would only show what was just seen', factors, i + 1)
    else if (now - lastOf(card) < rest) note(card, 'familiar', false, `resting: ${ago(lastOf(card), now)} of ${rules.familiarRestDays} days`, factors, i + 1)
    else note(card, 'familiar', false, `enough checks this round: one for every ${rules.familiarEvery} other cards, one per word`, factors, i + 1)
  })
  const points = turned.flatMap(checkpointsOf)
  points.forEach((card, i) => note(card, 'checkpoint', true, 'its stage is familiar, not yet ready', [], i + 1))
  const cards = spread([...mix(others, some), ...points])
  return {
    cards, considered,
    budget: [
      `${plural(due.length, 'word')} due for review: ${next} in this round${waiting() ? `, ${waiting()} wait` : ''}`,
      ...(filled ? [`${plural(filled, 'word')} not due yet fill the room left`] : []),
      throttled ? newWhy : `${plural(incoming.length, 'new word')}${incoming.length > rules.newWords ? ', more since the words started don’t fill the round' : ''}`,
      `${plural(some.length, 'familiar check')}, about one for every ${rules.familiarEvery} other cards`,
      ...(points.length ? [`${plural(points.length, 'checkpoint')}`] : []),
      `Order: the most urgent reviews first, new words spread from early in the round, familiar checks spread through it, and a word’s cards kept ${SPREAD_GAP} apart`,
    ],
  }
}
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`
// "tomorrow" or "in 3 days", for a day still to come.
const inDays = (at: number, now: number) => { const days = Math.round((dayStart(at) - dayStart(now)) / DAY); return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days` }
// Learning sequences, in smart order: a card of a word still being learned can bring the word's
// next cards in right behind it, whatever the deck's order, so a word is taught in a short run
// instead of waiting to be known. A word not yet met is followed by its first meaning in a
// sentence and, for a verb, its present, however it was answered; a sentence card missed is
// followed by the word card. A familiar card, or a word already ProgressRules.sequenceLongest
// cards in a row, brings nothing: once known, a word's cards are independent again, and nothing
// comes in that this round has already shown, so a word card isn't brought back after every
// sentence of its word that is missed. Answers to the cards a sequence brings are primed
// (isPrimed). `round` is the round as answered so far (from its first card), `entry` the word
// after this answer.
export function followUps(round: Card[], at: number, entry: VocabEntry, knew: boolean, before: Results, include: Include): Card[] {
  const card = round[at]
  if (card.checkpoint || stateOf(before) === 'familiar') return []
  let run = 0
  while (at - run >= 0 && round[at - run].entry.id === entry.id) run++
  const shown = new Set(round.slice(0, at + 1).map(cardKey))
  const next: Card[] = !card.form
    ? (include === 'words' || isMet(card.entry) ? [] : sequenceOf(entry).map(form => ({ entry, form })))
    : (knew || include === 'sentences' ? [] : [{ entry, form: null }])
  return next.filter(item => !shown.has(cardKey(item))).slice(0, Math.max(0, ProgressRules.sequenceLongest - run))
    .map(item => ({ ...item, sequence: true, why: `in sequence · after ${card.form ? 'its sentence' : 'the word'}` }))
}
// The words a round is about to draw on, for writing their cards ahead (practice.tsx): the
// started words whose turn comes next and the next words to come in, a round's worth of each.
// Cards are written for these rather than for every saved word.
export function upcoming(entries: VocabEntry[], include: Include = 'both', now = Date.now()): VocabEntry[] {
  const { started, unstarted } = studyPool(entries, include, now)
  const { due, early } = byDue(started, now)
  return [...[...due, ...early].slice(0, ProgressRules.roundSize).map(item => item.entry), ...unstarted.slice(0, ProgressRules.newWordsMax).map(item => item.entry)]
}
// A stage's cards in the order of its slots (sense1, m.sg).
const inOrder = (entry: VocabEntry, stage: string) => {
  const slots = Object.keys(stagesOf(entry).find(item => item.key === stage)?.slots ?? {})
  return formsIn(entry, stage).sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot))
}
// What a new word's sequence brings after its word card: its first meaning and, for a verb, a
// present card showing another use of it, so the two sentences met back to back don't teach the
// same thing (the first in slot order when the cards have no labels).
function sequenceOf(entry: VocabEntry): FormCard[] {
  const meaning = inOrder(entry, 'meanings').find(form => stateOf(form) !== 'familiar')
  const present = kindOfEntry(entry) === 'verb' ? apart(inOrder(entry, 'present').filter(form => stateOf(form) !== 'familiar'), [meaning])[0] : undefined
  return [meaning, present].filter((form): form is FormCard => !!form)
}
// The use a card shows, as the writer labelled it ('' on cards written before labels).
const usageOf = (form?: FormCard | null) => form?.usage?.trim().toLowerCase() || ''
// The same cards (forms, or study cards with one), those showing a use none of `shown` shows
// first, each part in its order. Cards without a label are never held back.
export function apart<T extends FormCard | { form: FormCard | null }>(cards: T[], shown: (FormCard | null | undefined)[]): T[] {
  const used = new Set(shown.map(usageOf).filter(Boolean))
  const repeats = (card: T) => used.has(usageOf('form' in card ? card.form : card))
  return [...cards.filter(card => !repeats(card)), ...cards.filter(repeats)]
}
// The word's card answered last, if any.
const lastAnswered = (entry: VocabEntry) => (entry.forms || []).filter(form => form.last).sort((a, b) => (b.last ?? 0) - (a.last ?? 0))[0]
const stageLabel = (entry: VocabEntry, stage: string) => stagesOf(entry).find(item => item.key === stage)?.label ?? stage
// "today", "yesterday", "3 days ago", or "never".
export function ago(at: number, now = Date.now()) {
  if (!at) return 'never'
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}
// `extra` spread evenly through `cards`, the first of them after `first` of the gap between them
// (1: a whole gap in; 0.5: half, so it comes sooner).
function mix<T>(cards: T[], extra: T[], first = 1): T[] {
  if (!extra.length) return cards
  if (!cards.length) return extra
  const out: T[] = []
  const every = (cards.length + extra.length) / extra.length
  let next = every * first - 1, e = 0, c = 0
  for (let i = 0; i < cards.length + extra.length; i++) {
    if (e < extra.length && (i >= next || c >= cards.length)) { out.push(extra[e++]); next += every } else out.push(cards[c++])
  }
  return out
}
// A card's sentence as shown: its own (0) or one of the new sentences written for it later
// (n: FormCard.variants[n - 1]), with the card's key and results either way, so a sentence can
// change without the card's progress starting over.
export const shownForm = (form: FormCard, variant = 0): FormCard => {
  const other = variant > 0 ? form.variants?.[variant - 1] : undefined
  // A sentence's glosses are its own: one written without them never takes its card's first one's.
  return other ? { ...form, ...other, glosses: other.glosses, key: form.key, stage: form.stage, slot: form.slot } : form
}
// Which sentence a card is shown in, and why (logged with it, as `sentence`), from how it has
// gone (its results, and which sentence each was given on, `on`, `seen`):
// - 'own': at a first meeting, its own sentence;
// - 'repeat': while it is being learned, the sentence it was last answered on, since meeting
//   the same example again is how it is learned;
// - 'another-context': once familiar, a sentence it hasn't been answered on, if it has one, to
//   check the word is understood beyond the sentence it was learned in;
// - 'another-example': wrong twice running, a sentence it hasn't been answered on, if it has
//   one, since the same example again hasn't helped;
// - 'in-turn': familiar or struggling with every sentence seen, another than the last.
// `fresh`: a sentence never answered before. A card can't say which sentence its older answers
// were given on; those count as its own.
// ('asked': a round of new sentences, asked for from Settings.)
export type SentenceWhy = 'own' | 'repeat' | 'another-context' | 'another-example' | 'in-turn' | 'asked'
export type Sentence = { variant: number; why: SentenceWhy; fresh: boolean }
const lastSentence = (record: Results) => { const on = (record.on || []).filter(at => at >= 0); return on.length ? on[on.length - 1] : 0 }
const seenSentences = (record: Results) => new Set([...(record.seen || []), ...(record.results?.length && !record.seen ? [0] : [])])
const struggling = (record: Results) => { const results = record.results || []; return results.length >= 2 && !results[results.length - 1] && !results[results.length - 2] }
export function sentenceFor(form: FormCard, record: Results): Sentence {
  const count = (form.variants?.length ?? 0) + 1
  if (!record.results?.length) return { variant: 0, why: 'own', fresh: true }
  const seen = seenSentences(record)
  const last = lastSentence(record) < count ? lastSentence(record) : 0
  const unseen = Array.from({ length: count }, (_, i) => i).filter(i => !seen.has(i))
  const familiar = isFamiliar(record)
  if (familiar || struggling(record)) {
    if (unseen.length) return { variant: unseen[unseen.length - 1], why: familiar ? 'another-context' : 'another-example', fresh: true }
    if (count > 1) return { variant: (last + 1) % count, why: 'in-turn', fresh: false }
  }
  return { variant: last, why: 'repeat', fresh: false }
}
// Whether a card would be helped by a sentence it doesn't have yet, and why: familiar, its last
// two answers right on the same sentence (known in that sentence, maybe only there), or wrong
// twice running on the same one; never while it has a sentence not yet answered on, nor at a
// first meeting. A card has at most MAX_SENTENCES, and one is written at most every
// SENTENCE_REST_HOURS (word-forms.ts keeps to both too).
export const MAX_SENTENCES = 4
export const SENTENCE_REST_HOURS = 20
export function wantsSentence(form: FormCard, now = Date.now()): 'another-context' | 'another-example' | null {
  const variants = form.variants || []
  if (variants.length + 1 >= MAX_SENTENCES || (form.results?.length ?? 0) < 2) return null
  if (variants.some(item => now - item.at < SENTENCE_REST_HOURS * 3_600_000)) return null
  const seen = seenSentences(form)
  if (Array.from({ length: variants.length + 1 }, (_, i) => i).some(i => !seen.has(i))) return null
  const on = form.on || []
  const sameTwice = on.length >= 2 && on[on.length - 1] === on[on.length - 2]
  if (!sameTwice) return null
  return isFamiliar(form) ? 'another-context' : struggling(form) ? 'another-example' : null
}
// A sentence card's record after an answer on sentence `variant`: which sentence each kept result
// was given on, and every sentence answered on.
export function onSentence(before: Results, after: Answered, variant: number): Answered & Required<Pick<Results, 'on' | 'seen'>> {
  const known = before.on || []
  const on = [...(before.results || []).map((_, i) => known[i - ((before.results?.length ?? 0) - known.length)] ?? -1), variant]
  const seen = [...seenSentences(before), variant].filter((at, i, all) => all.indexOf(at) === i).sort((a, b) => a - b)
  return { ...after, on: on.slice(-ProgressRules.kept), seen }
}
// The newest sentence written for the learner (word-forms.ts personal-v1), or 0 if none.
export const personalVariant = (form: FormCard) => {
  const at = (form.variants || []).map((item, i) => (item.writer.startsWith('personal') ? i + 1 : 0)).filter(Boolean)
  return at.length ? at[at.length - 1] : 0
}
export const writerOf = (form: FormCard, variant = 0) => (variant > 0 ? form.variants?.[variant - 1]?.writer : form.writer)

// A round of new sentences, to meet sentences written for what the learner knows now: the words
// being learned that have sentence cards studied already, least recently studied first, each with
// the stage studied in most lately whose cards don't all have one yet (all of that stage's cards
// get a new sentence, word-forms.ts fresh, once per card), so every round of them is new: a stage
// that has them is left to ordinary rounds, which show a card's sentences in turn. Nothing about
// the words' progress changes; their cards' results go on as before.
// A card can take another sentence: fewer than MAX_SENTENCES, none written lately.
const roomForSentence = (form: FormCard, now = Date.now()) => (form.variants?.length ?? 0) + 1 < MAX_SENTENCES
  && !(form.variants || []).some(item => now - item.at < SENTENCE_REST_HOURS * 3_600_000)
export const FRESH_WORDS = 6
export const FRESH_PER_WORD = 2
export function freshPicks(entries: VocabEntry[], words = FRESH_WORDS): { entry: VocabEntry; stage: string }[] {
  const out: { entry: VocabEntry; stage: string }[] = []
  for (const entry of studyPool(entries, 'both').started) {
    const studied = activeForms(entry).filter(form => form.results?.length).sort((a, b) => (b.last ?? 0) - (a.last ?? 0))
    const wanting = studied.find(form => formsIn(entry, form.stage).some(roomForSentence))
    if (wanting) out.push({ entry, stage: wanting.stage })
    if (out.length >= words) break
  }
  return out
}
// Its cards with their new sentences, once written: those of the stage that got one just now
// (none before, in `had`, the word as it was), the ones still being learned first, FRESH_PER_WORD
// of them (the rest come round in ordinary rounds, which show a card's sentences in turn).
export const freshCards = (entry: VocabEntry, stage: string, had?: VocabEntry): Card[] => (entry.forms || [])
  .filter(form => form.stage === stage && personalVariant(form))
  .filter(form => { const before = had?.forms?.find(item => item.key === form.key); return !before || (form.variants?.length ?? 0) > (before.variants?.length ?? 0) })
  .sort((a, b) => Number(stateOf(a) === 'familiar') - Number(stateOf(b) === 'familiar') || (a.last ?? 0) - (b.last ?? 0))
  .slice(0, FRESH_PER_WORD)
  .map(form => ({ entry, form, variant: personalVariant(form), mode: 'fresh' as const, why: 'new sentence · written for what you know' }))
// The round: a card of each word in turn, so a word's two cards are as far apart as the round
// allows, never back to back.
export const freshRound = (cards: Card[][]): Card[] =>
  Array.from({ length: Math.max(0, ...cards.map(list => list.length)) }, (_, i) => cards.flatMap(list => list[i] ?? [])).flat()

// Whether another card of this card's word came just before it in the round (within
// ProgressRules.primedCards), so that answering it is helped by having just seen the word.
export const justAfterItsWord = (deck: Card[], at: number, from = 0) =>
  deck.slice(Math.max(from, at - ProgressRules.primedCards), at).some(card => card.entry.id === deck[at]?.entry.id)

// Fill in the blank: a sentence card asked as its sentence with the word left out and four
// Hebrew options (quizOf), which tests choosing the right word or form in context rather than
// recalling it unaided, so its answers are logged as choices, not as swipes. 'some' (the default):
// now and then, on about one in three sentence cards that have been answered before (never at a
// first meeting, which is a flashcard), settled by the card and how often it was answered, so
// going back shows the same; 'all': every card that can be (Quiz forms before); 'off': none.
// It is a check on what is known, so in 'some' never just after another card of its word
// (`primed`, as isPrimed says), where it would only show what that card just put in mind. Either
// way, a card right lately only by choosing or just after its word (awaitsRecall) is a flashcard,
// since only recalling it can make it familiar.
export type ChoiceMode = 'some' | 'all' | 'off'
// How a card is asked, and why (logged as `exerciseWhy`), with fill in the blank at 'some':
// - 'first-meeting', 'in-sequence', 'just-shown': a flashcard, as above;
// - 'needs-recall': right lately only by choosing or primed (awaitsRecall), a flashcard;
// - 'new-context': familiar, in a sentence it hasn't been answered on, a flashcard: recalling
//   it there is the check that it is known beyond the sentence it was learned in;
// - 'support': wrong last time, in the same sentence, fill in the blank: a step between being
//   shown it and recalling it unaided (counted as a choice, so it can't make it familiar);
// - 'check' or 'recall': otherwise about one in three of each, settled by the card and how
//   often it was answered, so going back shows the same.
export type ExerciseWhy = 'off' | 'checkpoint' | 'all' | 'word-card' | 'first-meeting' | 'in-sequence' | 'just-shown' | 'needs-recall' | 'new-context' | 'support' | 'check' | 'recall'
export function exerciseOf(card: Card, record: Results, mode: ChoiceMode, primed = false, sentence?: Sentence): { choice: boolean; why: ExerciseWhy } {
  const as = (choice: boolean, why: ExerciseWhy) => ({ choice, why })
  if (mode === 'off') return as(false, 'off')
  if (card.checkpoint) return as(false, 'checkpoint')
  if (awaitsRecall(record)) return as(false, 'needs-recall')
  if (mode === 'all') return as(true, 'all')
  if (!card.form) return as(false, 'word-card')
  if (!record.results?.length) return as(false, 'first-meeting')
  if (card.sequence) return as(false, 'in-sequence')
  if (primed) return as(false, 'just-shown')
  if (sentence?.why === 'another-context') return as(false, 'new-context')
  if (!record.results[record.results.length - 1] && !sentence?.fresh) return as(true, 'support')
  const hash = [...`${cardKey(card)}:${record.results.length}`].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7)
  return hash % 3 === 0 ? as(true, 'check') : as(false, 'recall')
}
export const asChoice = (card: Card, record: Results, mode: ChoiceMode, primed = false, sentence?: Sentence) => exerciseOf(card, record, mode, primed, sentence).choice

// Reorders so cards of the same word are a few cards apart (SPREAD_GAP) where the round has room
// for it, keeping the order otherwise: two uses of a word met one after the other are practised
// with the first still in mind. Where it can't be that far, as far as it can. A learning sequence
// (followUps), which puts a word's cards together on purpose, is added after this.
export const SPREAD_GAP = 4
export function spread<T extends { entry: VocabEntry }>(cards: T[], gap = SPREAD_GAP): T[] {
  const left = [...cards]
  const out: T[] = []
  const since = (id: string) => { const at = out.map(card => card.entry.id).lastIndexOf(id); return at === -1 ? Infinity : out.length - at }
  while (left.length) {
    let i = left.findIndex(card => since(card.entry.id) >= gap)
    if (i === -1) i = left.reduce((best, card, at) => (since(card.entry.id) > since(left[best].entry.id) ? at : best), 0)
    out.push(...left.splice(i, 1))
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
  // A meaning card written with distractors of its own (words that look as if they could go in the
  // blank but don't fit this sentence) chooses among those; older cards among the saved words.
  const own = (form?.distractors || []).filter((item, i, all) => key(item) !== key(answer) && all.findIndex(other => key(other) === key(item)) === i).slice(0, 3)
  if (own.length === 3) return { options: shuffle([answer, ...own], seed), answer }
  // An expression chooses among other expressions, a word among other words: the same part of
  // speech first, then words the learner has practised (so the choice is between words they know,
  // and which fits is what it asks), then those about as common as this one; taken from the best
  // few in a shuffled order, so the same three don't come back every time.
  const expression = (item: VocabEntry) => item.partOfSpeech === 'expression'
  const distance = (item: VocabEntry) => (item.rank && entry.rank ? Math.abs(Math.log(item.rank) - Math.log(entry.rank)) : 3)
  const score = (item: VocabEntry) => (item.partOfSpeech === entry.partOfSpeech ? 0 : 10) + (practised(item) ? 0 : 4) + distance(item)
  // Never a word that means much the same (לבחון beside לבדוק, both "examine"): the English given
  // would fit both, and the question would have two answers.
  const meaning = meaningWords(`${entry.gloss || ''} ${form?.en || ''}`)
  const alike = (item: VocabEntry) => [...meaningWords(item.gloss || '')].some(word => meaning.has(word))
  const ranked = entries.filter(item => item.id !== entry.id && item.partOfSpeech !== 'phrase' && expression(item) === expression(entry) && !alike(item))
    .sort((a, b) => score(a) - score(b))
  const others = shuffle(ranked.slice(0, 8), seed).concat(ranked.slice(8))
  const picked: string[] = []
  for (const other of others) {
    const value = valueOf(other)
    if (picked.length < 3 && value && key(value) !== key(answer) && !picked.some(item => key(item) === key(value))) picked.push(value)
  }
  if (picked.length < 2) return null
  return { options: shuffle([answer, ...picked], seed), answer }
}

// The words of an English meaning that say what it means (not "to", "a", "someone"...).
const FILLER = new Set(['to', 'a', 'an', 'the', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'up', 'out', 'off', 'as', 'or', 'and', 'be', 'is', 'it', 'its',
  'one', "one's", 'oneself', 'someone', "someone's", 'something', 'somebody', 'get', 'make', 'do', 'have', 'go', 'take', 'not', 'no', 'very', 'about', 'into', 'over'])
const meaningWords = (text: string) => new Set(text.toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z']+/).filter(word => word.length > 2 && !FILLER.has(word)))

function shuffle<T>(items: T[], seed: string): T[] {
  let state = [...seed].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7)
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32 }
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}

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
// remembered. A card is familiar when its latest answers were right and at least one of them
// wasn't primed, and a wrong answer only makes it learning again: nothing resets. A stage is
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
// A card's record after an answer: its latest results, which of them were primed, and when it
// was answered.
export function assess(card: Results, knew: boolean, now = Date.now(), primed = false): Required<Results> {
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
export type Card = { entry: VocabEntry; form: FormCard | null; checkpoint?: string; why?: string; sequence?: boolean }
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
// saved waits forever: a word met again in reading since it was saved ('again', the one met most
// recently first), a recent save ('recent', newest first), and any other ('earlier'), in an order
// shuffled afresh each day and kept all day, so one round after another goes on through it. Which
// place goes first changes from day to day, so short sessions, which meet only a word or two,
// don't always take theirs from the same one.
export function intakeOrder(entries: VocabEntry[], now = Date.now()): Intake[] {
  const metLast = (entry: VocabEntry) => Math.max(0, ...(entry.encounters || []).map(item => item.at || 0))
  const again = entries.filter(entry => (entry.encounters?.length ?? 0) > 1).sort((a, b) => metLast(b) - metLast(a))
  const recent = entries.filter(entry => !again.includes(entry) && now - entry.createdAt < ProgressRules.recentDays * DAY)
    .sort((a, b) => b.createdAt - a.createdAt)
  const earlier = shuffle(entries.filter(entry => !again.includes(entry) && !recent.includes(entry)).sort((a, b) => a.createdAt - b.createdAt), dayOf(now))
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
  (source === 'again' ? 'met again in reading' : `saved ${ago(entry.createdAt, now)}`)
// What to study: word cards, sentence cards or both, in smart or shuffled order.
export type Include = 'words' | 'sentences' | 'both'
export type Order = 'smart' | 'shuffle'
// One round of studying, which the learner can go round again for as long as they like. Smart
// order takes the started words in turn (studyPool), the one studied least recently first, each
// a couple of cards further (ProgressRules.perWord): its word card while it is being learned,
// then its cards still being learned and its next new cards (its meanings, then its forms) in
// turn, until the round has about ProgressRules.roundSize. A started word not yet met brings
// only its word card. A few words not yet started come in each round (more when the started ones
// don't fill it), as their word cards (in sentences only, their first meaning), their next cards
// following as they are answered (followUps); the first comes early in the round, so a short
// session meets one too. Mixed in among them, familiar cards now and then: those not seen for a
// few days (ProgressRules.familiarRestDays), least recently seen first and one per word, so what
// is known comes back without the same few coming round every time; then checkpoints of the
// words whose turn it was. Shuffled: everything in play, shuffled. Either way, a word not yet met
// shows only its word card (in sentences only, its meanings), and two cards of one word aren't
// back to back where another can go between. Nothing here is ever due.
export function deckOf(entries: VocabEntry[], { include, order }: { include: Include; order: Order }, now = Date.now(), seed = String(now)): Card[] {
  const studied = entries.filter(entry => !isKnownWord(entry))
  const deeper = (entry: VocabEntry) => (include === 'sentences' || isMet(entry) ? newCards(entry) : [])
  const cardsOf = (entry: VocabEntry): Card[] => [
    ...(include === 'sentences' ? [] : [{ entry, form: null }]),
    ...(include === 'words' ? [] : [...activeForms(entry).filter(form => !!form.results?.length), ...deeper(entry)].map(form => ({ entry, form }))),
  ]
  const checkpointsOf = (entry: VocabEntry): Card[] => include !== 'both' ? []
    : checkpointStages(entry, now).map(stage => ({ entry, form: null, checkpoint: stage, why: `checkpoint · ${stageLabel(entry, stage)} is familiar, not yet ready` }))
  if (order === 'shuffle') return spread(shuffle(studied.flatMap(entry => [...cardsOf(entry), ...checkpointsOf(entry)]), seed).map(card => ({ why: 'shuffled', ...card })))
  const rules = ProgressRules
  const state = (card: Card) => stateOf(resultsOf(card))
  const lastOf = (card: Card) => resultsOf(card).last ?? 0
  const explain = (card: Card): Card => ({ ...card, why: state(card) === 'learning' ? `still learning · last seen ${ago(lastOf(card), now)}`
    : `next for this word · ${card.form ? stageLabel(card.entry, card.form.stage) : 'Word'}` })
  const { started, unstarted } = studyPool(entries, include, now)
  const room = rules.roundSize - rules.newWords
  const taken: Card[] = []
  const turned: VocabEntry[] = []
  for (const entry of started) {
    if (taken.length >= room) break
    turned.push(entry)
    const cards = cardsOf(entry)
    const word = cards.filter(card => !card.form && state(card) !== 'familiar')
    // Not met: its word card alone, its next cards following as it is answered.
    if (!isMet(entry) && include !== 'sentences') { taken.push(...word.map(explain)); continue }
    const learning = cards.filter(card => card.form && state(card) === 'learning').sort((a, b) => lastOf(a) - lastOf(b))
    const fresh = cards.filter(card => card.form && state(card) === 'new')
    const turn = [...word]
    for (let i = 0; turn.length < rules.perWord && (i < learning.length || i < fresh.length); i++) turn.push(...[learning[i], fresh[i]].filter(Boolean))
    taken.push(...turn.slice(0, Math.min(rules.perWord, room - taken.length)).map(explain))
  }
  const wanted = Math.min(rules.newWordsMax, Math.max(rules.newWords, rules.roundSize - taken.length))
  const incoming: Card[] = []
  for (const intake of unstarted) {
    if (incoming.length >= wanted) break
    const { entry } = intake
    const first = include === 'sentences' ? newCards(entry).filter(form => form.stage === 'meanings').slice(0, 1).map(form => ({ entry, form })) : [{ entry, form: null }]
    incoming.push(...first.map(card => ({ ...card, why: `new word · ${sourceWhy(intake, now)}` })))
  }
  const others = mix(taken, incoming, 0.5)
  const rest = rules.familiarRestDays * DAY
  const familiar = studied.flatMap(cardsOf).filter(card => state(card) === 'familiar').sort((a, b) => lastOf(a) - lastOf(b))
  const rested = familiar.filter(card => now - lastOf(card) >= rest).filter((card, i, all) => all.findIndex(other => other.entry.id === card.entry.id) === i)
  const some = (others.length ? rested.slice(0, Math.ceil(others.length / rules.familiarEvery)) : (rested.length ? rested : familiar).slice(0, rules.roundSize))
    .map(card => ({ ...card, why: `familiar · last seen ${ago(lastOf(card), now)}` }))
  return spread([...mix(others, some), ...turned.flatMap(checkpointsOf)])
}
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
    ? (include === 'words' || isMet(card.entry) ? [] : [firstOf(entry, 'meanings'), kindOfEntry(entry) === 'verb' ? firstOf(entry, 'present') : undefined]
      .filter((form): form is FormCard => !!form && stateOf(form) !== 'familiar').map(form => ({ entry, form })))
    : (knew || include === 'sentences' ? [] : [{ entry, form: null }])
  return next.filter(item => !shown.has(cardKey(item))).slice(0, Math.max(0, ProgressRules.sequenceLongest - run))
    .map(item => ({ ...item, sequence: true, why: `in sequence · after ${card.form ? 'its sentence' : 'the word'}` }))
}
// The words a round is about to draw on, for writing their cards ahead (practice.tsx): the
// started words whose turn comes next and the next words to come in, a round's worth of each.
// Cards are written for these rather than for every saved word.
export function upcoming(entries: VocabEntry[], include: Include = 'both', now = Date.now()): VocabEntry[] {
  const { started, unstarted } = studyPool(entries, include, now)
  return [...started.slice(0, ProgressRules.roundSize), ...unstarted.slice(0, ProgressRules.newWordsMax).map(item => item.entry)]
}
// A stage's first card, in the order of its slots (sense1, m.sg).
const firstOf = (entry: VocabEntry, stage: string) => {
  const slots = Object.keys(stagesOf(entry).find(item => item.key === stage)?.slots ?? {})
  return formsIn(entry, stage).sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot))[0]
}
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

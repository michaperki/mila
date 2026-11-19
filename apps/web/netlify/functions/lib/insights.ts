import { rankOf } from './frequency.ts'
import { studyState } from './calibration.ts'
import { type Memory, retrievability } from './memory.ts'
import { cardsOfEntry, lemmaKeyOf, parseCardKey, savedFormMatcher, type Evidence, type LearnerEntry, type LearnerEvent, type LearnerState } from './learner.ts'

// Learning Insights (admin only, the app's Account → Learning Insights): what Mila observed of a
// learner, told session by session, what it took from it (the learner model's evidence, each piece
// traced to the events it came from), and a few plain, labelled heuristics that say what a
// learning opportunity might be and what Study actually did about it. It reads and never decides:
// nothing here changes what Study does, and nothing is stored but predictions already worked out
// (insights.ts keeps those per version). Observations (events), interpretations (the model,
// versioned) and heuristics (named, versioned here) stay apart so each can be judged on its own.
// Everything shown is said in plain words: Study's reason codes, card slots and the model's own
// labels are put into words here (PLAIN), so the app only lays them out.
// insights-v0.2 (2026-11-17): plain wording, a reason whenever something isn't counted, one
// rounding for a card's times, late arrival said once per session with what it held back, reading
// sessions on the same passage minutes apart told as one, a constant baseline and calibration in
// the model checks, evidence as structured lines (side and date said once, not on every line).
export const INSIGHTS_VERSION = 'insights-v0.2'

// A gap longer than this without anything happening isn't counted as time spent (a phone put
// down); going to the background ends time spent at once.
export const IDLE_MS = 120_000
// How common a word must be for its save or need to be called out (frequency rank).
export const COMMON_RANK = 3000
// A prediction this sure that turned out wrong is a surprise.
export const SURE = 0.75
// Reading sessions on the same passage this close together are one visit (the reader starts a new
// session each time a passage is opened).
const REOPENED_MS = 10 * 60_000
// An event that reached the server this much after it happened arrived late.
const LATE_MS = 10 * 60_000
// The learner model's own rule for one lookup (lib/learner.ts): the same word tapped again in the
// same place within this is the same lookup.
const SAME_LOOKUP_MS = 10_000

export type Ev = LearnerEvent & { id: string; receivedAt?: number }
type Form = { key: string; stage: string; slot: string; results?: boolean[]; primed?: boolean[]; last?: number; sentence?: string; translation?: string; variants?: { sentence?: string; translation?: string }[] }
export type InsightEntry = Omit<LearnerEntry, 'forms'> & { forms?: Form[]; categories?: string[]; register?: string; level?: string; root?: string; known?: string[] }
export type TextDoc = { id?: string; textId?: string; title?: string; chunks?: { text?: string; translation?: string }[] }
export type WordRef = { id?: string; lemma: string }
// A piece of evidence as shown: what happened in plain words, when (a date only, with no time, for
// an older result whose time wasn't kept: its order against other evidence is uncertain), and how
// it counted. `side`: null when the side shown first wasn't recorded.
export type EvidenceLine = { text: string; at: number; dated: boolean; side: 'English first' | 'Hebrew first' | 'fill in the blank' | null; weight: number; knew: boolean; kind: string }
// One prediction of an answer, as Mila would have made it just before it.
export type Prediction = { answer: string; at: number; key: string; wordId: string; lemma: string; channel: 'recognition' | 'production' | 'either'; knew: boolean; p: number; low: number; high: number; prior: number; cardSoFar: number; cardAnswers: number; evidence: EvidenceLine[] }
export type Insight = { rule: string; label: string; observation: string; interpretation: string; opportunity?: string; decision?: string; acted?: boolean; outcome?: string; words?: WordRef[] }
export type Row = { at: number; gapMs?: number; icon: string; text: string; detail?: string[]; words?: WordRef[]; model?: string[]; flags?: string[]; insight?: Insight }
// `ended`: how the session ended, in words. `late`: events that reached the server late, and the
// Study sessions that started without them (`missed`, their start times; the app words it in local
// time), said once for the session.
export type SessionSummary = {
  id: string; kind: 'study' | 'reading'; title: string; start: number; end: number; activeMs: number; endedBy: string; ended: string
  counts: Record<string, number>; parts: number; late: { count: number; receivedAt: number; missed: number[] } | null
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
// Seconds, rounded once: every time shown for a card comes from the same rounded values.
export const seconds = (ms: number) => Math.max(0, Math.round(ms / 1000))
export const sayTime = (s: number) => (s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${(s / 3600).toFixed(1)} h`)
export const duration = (ms: number) => sayTime(seconds(ms))
const pct = (p: number) => `${Math.round(p * 100)}%`
const day = (at: number) => new Date(at).toISOString().slice(0, 10)
const rankText = (rank?: number) => (!rank ? 'not in the frequency list' : rank <= 1000 ? `very common, #${rank}` : rank <= COMMON_RANK ? `common, #${rank}` : rank <= 10000 ? `less common, #${rank}` : `rare, #${rank}`)
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// Study's codes and the cards' slots, in words.
const STAGES: Record<string, string> = { meanings: 'meaning', present: 'present', past: 'past', future: 'future', imperative: 'command', inflected: 'other forms', plural: 'plural', noun: 'verbal noun' }
const SLOTS: Record<string, string> = {
  'm.sg': 'masculine singular', 'f.sg': 'feminine singular', 'm.pl': 'masculine plural', 'f.pl': 'feminine plural', pl: 'plural', noun: 'verbal noun',
  '1sg': 'I', '2sg.m': 'you, to a man', '2sg.f': 'you, to a woman', '3sg.m': 'he', '3sg.f': 'she', '1pl': 'we', '2pl': 'you all', '2pl.m': 'you all, men', '2pl.f': 'you all, women', '3pl': 'they',
}
const COMMANDS: Record<string, string> = { 'm.sg': 'to a man', 'f.sg': 'to a woman', pl: 'to several people' }
const EXERCISES: Record<string, string> = {
  'word-card': 'a flashcard of the word on its own',
  'first-meeting': 'a flashcard, the first time this card was asked',
  'in-sequence': 'a flashcard, following its word in a learning sequence',
  'just-shown': 'a flashcard, since the word was just shown',
  'needs-recall': 'a flashcard, since it was right lately only with help',
  'new-context': 'a flashcard in a sentence it wasn’t answered on before',
  support: 'fill in the blank, since it was missed last time in this sentence',
  check: 'fill in the blank, as about one card in three is',
  recall: 'a flashcard, as about two cards in three are',
  all: 'fill in the blank, as set in Settings', off: 'a flashcard, with fill in the blank off', checkpoint: 'a checkpoint',
}
const SENTENCES: Record<string, string> = {
  own: 'its own sentence', repeat: 'the same sentence as last time', 'another-context': 'a sentence it wasn’t answered on before, to see if it holds elsewhere',
  'another-example': 'another example, after two misses in the same one', 'in-turn': 'the next of its sentences in turn', asked: 'a new sentence, asked for',
}
const ENDINGS: Record<string, string> = { closed: 'you closed it', 'next word': 'you moved to another word', left: 'you left the screen' }
// Study's reason line, "still learning · last seen 14 days ago", as a sentence.
const plainWhy = (why: unknown) => (typeof why !== 'string' || !why ? 'not recorded' : why.split(' · ').map((part, i) => (i ? part.charAt(0).toLowerCase() + part.slice(1) : part)).join(': ').replace(/: (.*): /, ': $1, '))
export const cardLabel = (key: string) => {
  const card = parseCardKey(key)
  if (card.kind === 'word') return 'word card'
  if (card.kind === 'checkpoint') return `${STAGES[card.stage] ?? card.stage} checkpoint`
  if (card.stage === 'meanings') return `meaning ${card.slot.replace('sense', '')}`
  return `${STAGES[card.stage] ?? card.stage}, ${(card.stage === 'imperative' ? COMMANDS[card.slot] : SLOTS[card.slot]) ?? card.slot}`
}
// The learner model's card labels in its evidence ("meanings sense1", "present m.sg").
const modelCardLabel = (label: string) => {
  const [stage, slot] = label.split(' ')
  if (label === 'word card') return label
  if (slot === 'checkpoint') return `${STAGES[stage] ?? stage} checkpoint`
  if (stage === 'meanings') return `meaning ${slot?.replace('sense', '') ?? ''}`.trim()
  return slot ? `${STAGES[stage] ?? stage}, ${(stage === 'imperative' ? COMMANDS[slot] : SLOTS[slot]) ?? slot}` : STAGES[stage] ?? stage
}
const sideOf = (front: unknown) => (front === 'en' ? 'English first' : front === 'he' ? 'Hebrew first' : 'side not recorded')
const channelOf = (front: unknown) => (front === 'en' ? 'production' : front === 'he' ? 'recognition' : 'either') as Prediction['channel']
const doing = (channel: string) => (channel === 'production' ? 'producing' : channel === 'recognition' ? 'recognizing' : 'knowing')
const weightOf = (weight: number) => Math.round(weight * 100) / 100
// Parentheses in the model's own descriptions, as commas (they nest: "(הצבי) (word found by its spelling)").
const unbracket = (text: string) => text.replace(/\s*\(([^()]*)\)/g, ', $1').replace(/\s*\(([^()]*)\)/g, ', $1').replace(/^, /, '')

// A piece of the model's evidence in plain words, without its side and date (said apart).
export function evidenceLineOf(evidence: Evidence): EvidenceLine {
  const answered = evidence.what.match(/^(knew|missed) (.+?) \((.*)\)$/)
  let text = ''
  // A side only for answers: a lookup or a save is reading, not a card shown one way round.
  let side: EvidenceLine['side'] = !answered ? null : evidence.channel === 'production' ? 'English first' : evidence.channel === 'recognition' ? 'Hebrew first' : null
  const help = evidence.what.match(/^asked for on a card shown in English, for "(.*?)" \((.*?)\)(.*)$/)
  const looked = evidence.what.match(/^(looked up on a card in Study|looked up while reading|saved from a page) \((.*?)\)(.*)$/)
  if (help) text = `Asked for its Hebrew on an English card: “${help[1].replace(/[.,;:!?]+$/, '')}” → ${help[2]}${help[3] ? `, ${unbracket(help[3]).replace(/^, /, '')}` : ''}`
  else if (looked) text = `${capital(looked[1])}: ${looked[2]}${looked[3] ? `, ${unbracket(looked[3]).replace(/^, /, '')}` : ''}`
  else if (answered) {
    const flags = answered[3]
    if (flags.includes('choices')) side = 'fill in the blank'
    const help = flags.match(/Hebrew for (\d+) words? around it given/)
    const label = modelCardLabel(answered[2])
    text = [`${answered[1] === 'knew' ? 'Knew' : 'Missed'} ${label === 'word card' ? 'the word card' : label}`,
      flags.includes('primed') && 'just after seeing the word', flags.includes('choices') && 'chosen from options',
      help && `with the Hebrew of ${plural(Number(help[1]), 'other word')} given`].filter(Boolean).join(', ')
  } else if (!text) {
    text = capital(unbracket(evidence.what))
  }
  return { text, at: evidence.at, dated: evidence.dated !== false, side, weight: weightOf(evidence.weight), knew: evidence.knew, kind: evidence.kind ?? 'answer' }
}

// What a piece of evidence did to the model, as one sentence for a session's row.
export function modelLine({ lemma, evidence }: { lemma: string; evidence: Evidence }) {
  if (evidence.weight === 0) {
    if (evidence.what.startsWith('tapped on the answer side')) return `Not counted for ${lemma}: you were checking the answer side of an English-first card.`
    if (evidence.what.includes('was looked up on this card')) return `Noted for ${lemma}, not counted: a word looked up on its card may be why it was hard, or may not.`
    return `Noted for ${lemma}, not counted.`
  }
  const how = `${evidence.knew ? 'Counts for' : 'Counts against'} ${doing(evidence.channel)} ${lemma}, weight ${weightOf(evidence.weight)}`
  const why = evidence.kind === 'help' ? 'you asked for its Hebrew'
    : evidence.kind === 'lookup' ? (evidence.what.includes('a phrase selected') ? 'looked up, as an expression' : evidence.what.includes('on a card') ? 'looked up on a card' : 'looked up while reading')
    : lessBecause(evidence)
  return `${how}${why ? `: ${why}` : ''}.`
}
// Why an answer counts less than in full, every reason it has (learner.ts WEIGHTS).
function lessBecause({ what, weight }: Evidence) {
  const reasons = [
    what.includes('primed') && 'the word was just shown',
    what.includes('choices') && 'it was chosen from options',
    what.includes('English shown') && 'the English was shown',
    what.includes('around it given') && 'Hebrew was given for words around it',
  ].filter(Boolean)
  if (reasons.length) return `less, since ${reasons.join(' and ')}`
  return weight < 1 ? 'half, since a form card is partly about the form' : ''
}

// Final answers only: a changed answer replaces the one before it on the same card.
export function finalAnswers(events: Ev[]) {
  const final = new Map<string, Ev>()
  for (const event of events) if (event.type === 'answer' && typeof event.key === 'string') final.set(`${event.session}:${event.position}:${event.key}`, event)
  return new Set(final.values())
}

// When the app was in the background (`app` events), as [from, to] spans.
export function backgroundSpans(events: Ev[], now = Date.now()) {
  const spans: [number, number][] = []
  let from: number | null = null
  for (const event of events) {
    if (event.type !== 'app') continue
    if (event.state !== 'active' && from === null) from = event.at
    if (event.state === 'active' && from !== null) { spans.push([from, event.at]); from = null }
  }
  if (from !== null) spans.push([from, now])
  return spans
}
// Time spent between two moments: the gap, cut at going to the background and at IDLE_MS.
const spent = (a: number, b: number, background: [number, number][]) => {
  const left = background.find(([from]) => from >= a && from < b)
  return Math.max(0, Math.min(b - a, IDLE_MS, left ? left[0] - a : Infinity))
}

const isStudy = (events: Ev[]) => events.some(event => ['start', 'show', 'answer'].includes(event.type))
// The events of a session id as listed: one session, or reading sessions told as one (ids joined by +).
export const eventsOf = (id: string, events: Ev[]) => { const ids = new Set(id.split(/[+ ]/)); return events.filter(event => ids.has(event.session)) }

// Late events and what they held back: Study sessions that started after they happened and before
// the server had them (its choice of new words and the cards written then read lookups, answers
// and saves from the server).
function lateness(list: Ev[], all: Ev[]): SessionSummary['late'] {
  const late = list.filter(event => typeof event.receivedAt === 'number' && event.receivedAt - event.at > LATE_MS)
  if (!late.length) return null
  const receivedAt = Math.max(...late.map(event => event.receivedAt!))
  const own = new Set(list.map(event => event.session))
  const counted = late.filter(event => ['lookup', 'answer', 'save', 'explained', 'unsave'].includes(event.type))
  const missed = all.filter(event => event.type === 'start' && !own.has(event.session) && counted.some(item => item.at < event.at && item.receivedAt! > event.at))
  return { count: late.length, receivedAt, missed: missed.map(event => event.at) }
}

export function sessionsOf(events: Ev[], texts: Map<string, TextDoc>, now = Date.now()): SessionSummary[] {
  const background = backgroundSpans(events, now)
  const bySession = new Map<string, Ev[]>()
  for (const event of events) if (event.type !== 'app') (bySession.get(event.session) ?? bySession.set(event.session, []).get(event.session)!).push(event)
  const answers = finalAnswers(events)
  const summaries = [...bySession.entries()].map(([id, list]) => summaryOf(id, list, events, background, answers, texts, now)).sort((a, b) => a.start - b.start)
  // Reading sessions on the same passage minutes apart: one visit, its parts counted.
  const merged: SessionSummary[] = []
  for (const item of summaries) {
    const previous = [...merged].reverse().find(other => other.kind === 'reading')
    const text = textOf(eventsOf(item.id, events))
    if (item.kind === 'reading' && previous && merged[merged.length - 1] === previous && textOf(eventsOf(previous.id, events)) === text && text && item.start - previous.end <= REOPENED_MS) {
      merged[merged.length - 1] = summaryOf(`${previous.id}+${item.id}`, eventsOf(`${previous.id}+${item.id}`, events), events, background, answers, texts, now)
    } else merged.push(item)
  }
  return merged.sort((a, b) => b.start - a.start)
}
const textOf = (list: Ev[]) => list.find(event => typeof event.text === 'string')?.text as string | undefined
function summaryOf(id: string, list: Ev[], all: Ev[], background: [number, number][], answers: Set<Ev>, texts: Map<string, TextDoc>, now: number): SessionSummary {
  const study = isStudy(list)
  const start = list[0].at, end = list[list.length - 1].at
  let activeMs = 0
  for (let i = 1; i < list.length; i++) activeMs += spent(list[i - 1].at, list[i].at, background)
  const last = list[list.length - 1]
  const left = background.find(([from]) => from >= end && from - end <= IDLE_MS)
  const endedBy = last.type === 'end' ? 'finished' : left ? 'left the app' : now - end < IDLE_MS ? 'still going' : 'no end recorded'
  const count = (type: string) => list.filter(event => event.type === type).length
  const text = textOf(list)
  const mine = list.filter(event => answers.has(event))
  const round = Number(list.find(event => event.type === 'start')?.cards) || 0
  const parts = id.split('+').length
  const ended = study
    ? endedBy === 'finished' ? `finished the round${round ? ` of ${round}` : ''}, ${mine.length} answered`
      : `${round ? `round of ${round}: ` : ''}stopped after ${mine.length} answered; ${endedBy === 'left the app' ? 'you left the app' : endedBy === 'still going' ? 'still going' : 'no end recorded'}`
    : `${endedBy === 'left the app' ? 'you left the app' : endedBy === 'still going' ? 'still going' : 'no end recorded'}${parts > 1 ? `; opened ${parts} times within minutes, shown as one visit` : ''}`
  return {
    id, kind: study ? 'study' : 'reading', title: study ? 'Study' : (text && texts.get(text)?.title) || 'Reading', start, end, activeMs, endedBy, ended, parts,
    counts: study
      ? { cards: count('show'), answers: mine.length, right: mine.filter(event => event.knew).length, hints: count('hold') || list.filter(event => event.type === 'lookup' && event.help === 'english').length, lookups: list.filter(event => event.type === 'lookup' && event.help !== 'english').length, saves: count('save') }
      : { sentences: new Set(list.filter(event => event.type === 'select').map(event => `${event.text}:${event.segment}`)).size, lookups: count('lookup'), saves: count('save') },
    late: lateness(list, all),
  }
}

// What the story needs: everything, already loaded and sorted, and the model's views of it.
export type Context = {
  events: Ev[]; entries: InsightEntry[]; texts: Map<string, TextDoc>; now: number
  // The model's state just before a moment (only events before it), and its prediction of an answer.
  stateAt: (at: number) => LearnerState
  predict: (answer: Ev) => Prediction | null
}

function lookups(ctx: Context) {
  const byId = new Map(ctx.entries.map(entry => [entry.id, entry]))
  const byKey = new Map(ctx.entries.map(entry => [lemmaKeyOf(entry.lemmaPlain || entry.lemma), entry]))
  const explained = new Map(ctx.events.filter(event => event.type === 'explained').map(event => [String(event.of), event]))
  const lemmaOf = (event: Ev) => (typeof event.lemma === 'string' && event.lemma) || (explained.get(event.id)?.lemma as string | undefined) || (typeof event.word === 'string' ? event.word : '')
  const entryOf = (lemma: string) => byKey.get(lemmaKeyOf(lemma))
  const rankOfEntry = (entry: InsightEntry) => rankOf(entry.lemmaPlain || entry.lemma, ...(entry.encounters || []).map(met => met.surface))
  const ref = (lemma: string, entry = entryOf(lemma)): WordRef => (entry ? { id: entry.id, lemma: entry.lemmaPlain || entry.lemma } : { lemma })
  const answers = finalAnswers(ctx.events)
  // What Study did about a word after a moment: when it first showed it, and the answers since.
  const shownAfter = (wordId: string, at: number) => ctx.events.find(event => event.type === 'show' && event.at > at && typeof event.key === 'string' && parseCardKey(event.key).wordId === wordId)
  const answersAfter = (wordId: string, at: number) => ctx.events.filter(event => answers.has(event) && event.at > at && parseCardKey(event.key as string).wordId === wordId)
  const outcome = (wordId: string, at: number) => {
    const since = answersAfter(wordId, at)
    const primed = since.filter(event => event.primed).length
    return since.length ? `${plural(since.length, 'answer')} since, ${since.filter(event => event.knew).length} right${primed ? `, ${primed} of them just after seeing the word` : ''}` : 'No answers since'
  }
  return { byId, byKey, explained, lemmaOf, entryOf, rankOfEntry, ref, answers, shownAfter, outcome }
}

// Evidence the model took from each event, by event id, from a state that includes them.
function evidenceByEvent(state: LearnerState) {
  const index = new Map<string, { lemma: string; id?: string; evidence: Evidence }[]>()
  for (const word of state.words) for (const evidence of word.evidence) for (const from of evidence.from ?? []) {
    (index.get(from) ?? index.set(from, []).get(from)!).push({ lemma: word.lemma, id: word.id, evidence })
  }
  return index
}

// Why an event the model could have counted wasn't, when it took nothing from it.
function notCounted(event: Ev, list: Ev[], look: ReturnType<typeof lookups>, hasHolds: boolean): string | null {
  if (event.type === 'answer') {
    if (!look.answers.has(event)) return 'Not counted: replaced by a later answer on this card.'
    if (!look.byId.get(parseCardKey(String(event.key)).wordId)) return 'Not counted: the word is no longer saved.'
    return null
  }
  if (event.type === 'hold') {
    if (event.found !== 'hebrew') return 'Not counted: no Hebrew word was given.'
    return 'Not counted again: its Hebrew was already given on this card.'
  }
  if (event.type !== 'lookup' || (event.help === 'english' && hasHolds)) return null
  if (event.own) return 'Not counted: it’s the card’s own word, shown with its answer.'
  const before = list.find(other => other !== event && other.type === 'lookup' && other.at <= event.at && event.at - other.at < SAME_LOOKUP_MS
    && other.word === event.word && other.key === event.key && other.text === event.text && other.segment === event.segment && other.place === event.place)
  if (before) return `Not counted again: the same word was looked up here ${duration(event.at - before.at)} before.`
  if (event.phrase && !look.explained.get(event.id)?.lemma) return 'Not counted: the phrase has no single dictionary form.'
  return 'Not counted: Mila couldn’t tell which word it was, as no explanation came and no saved word is spelled this way.'
}

// A session told event by event, with the evidence taken from each and the insights it gave.
export function sessionStory(id: string, ctx: Context): { summary: SessionSummary; rows: Row[] } | null {
  const list = eventsOf(id, ctx.events)
  if (!list.length) return null
  const look = lookups(ctx)
  const background = backgroundSpans(ctx.events, ctx.now)
  const summary = summaryOf(id, list, ctx.events, background, look.answers, ctx.texts, ctx.now)
  const before = ctx.stateAt(list[0].at)
  const after = ctx.stateAt(list[list.length - 1].at + 1)
  const taken = evidenceByEvent(after)
  const hasHolds = list.some(event => event.type === 'hold')
  const shows = new Map<string, Ev>()
  const fronts = new Map<string, number>()
  const rows: Row[] = []
  const lookupRows = new Map<string, Row>()
  let previous = 0
  const push = (event: Ev, row: Omit<Row, 'at' | 'gapMs'>) => {
    const away = previous > 0 ? background.find(([from, to]) => from > previous && to <= event.at) : undefined
    const model = [...(row.model ?? []), ...(taken.get(event.id) ?? []).map(modelLine)]
    const reason = !model.length ? notCounted(event, list, look, hasHolds) : null
    rows.push({
      at: event.at, ...(previous ? { gapMs: event.at - previous } : {}), ...row,
      detail: [...(away ? [`After ${duration(away[1] - away[0])} away from the app`] : []), ...(row.detail ?? [])],
      model: [...model, ...(reason ? [reason] : [])],
    })
    previous = event.at
    return rows[rows.length - 1]
  }
  for (const event of list) {
    const key = typeof event.key === 'string' ? event.key : null
    const entry = key ? look.byId.get(parseCardKey(key).wordId) : undefined
    const where = `${event.session}:${event.position}`
    if (event.type === 'start') {
      push(event, { icon: 'play', text: `${event.resumed ? 'Went on with a round' : 'Started a round'}: ${plural(Number(event.cards) || 0, 'card')}, ${event.front === 'mixed' ? 'mixed sides' : sideOf(event.front)}, ${event.order === 'shuffle' ? 'shuffled' : 'smart order'}`, detail: [`${event.started ?? '?'} words started, ${event.unstarted ?? '?'} waiting, ${event.saved ?? '?'} saved`] })
    } else if (event.type === 'show' && key) {
      shows.set(where, event)
      const form = entry?.forms?.find(item => `${entry.id}:${item.key}` === key)
      const sentence = typeof event.variant === 'number' && event.variant > 0 ? form?.variants?.[event.variant - 1] : form
      push(event, {
        icon: 'card', words: entry ? [look.ref(entry.lemma, entry)] : [],
        text: `Card: ${entry?.lemmaPlain || entry?.lemma || event.lemma} · ${cardLabel(key)} · ${event.quiz ? 'fill in the blank' : sideOf(event.front)}`,
        detail: [
          ...(sentence?.sentence ? [`${event.front === 'en' && sentence.translation ? sentence.translation : sentence.sentence}`] : []),
          `Why this card: ${plainWhy(event.why)}`,
          ...(event.exerciseWhy ? [`Asked as ${EXERCISES[String(event.exerciseWhy)] ?? String(event.exerciseWhy)}`] : []),
          ...(event.sentence ? [`Sentence: ${SENTENCES[String(event.sentence)] ?? String(event.sentence)}${event.sentenceNew && event.sentence !== 'own' ? ', new to this card' : ''}`] : []),
        ],
      })
    } else if (event.type === 'reveal') {
      const front = seconds(Number(event.ms) || 0)
      if (!fronts.has(where)) fronts.set(where, front)
      push(event, { icon: 'flip', text: `Turned over after ${sayTime(front)}` })
    } else if (event.type === 'hold') {
      const found = event.found
      push(event, {
        icon: 'hold', text: `Held “${event.english}” for a hint: ${found === 'hebrew' ? event.hebrew : found === 'none' ? 'no separate Hebrew word' : found === 'target' ? 'part of the word being recalled' : found === 'failed' ? 'couldn’t be looked up' : 'no hint, the word wasn’t matched'}`,
        detail: [event.from === 'late' ? `The card wasn’t prepared, so it was asked for then and took ${duration(Number(event.waitMs) || 0)}` : 'From the card’s own word data, at once'],
        flags: found === 'unknown' || found === 'failed' ? ['A hint that found nothing'] : [],
      })
    } else if (event.type === 'lookup') {
      const lemma = look.lemmaOf(event)
      const target = look.entryOf(lemma)
      if (event.help === 'english') {
        if (hasHolds) {
          // A hint's Hebrew word is logged as a lookup just after the hold: its evidence goes there.
          const last = rows[rows.length - 1]
          const lines = (taken.get(event.id) ?? []).map(modelLine)
          if (last) last.model = [...new Set([...(last.model ?? []).filter(line => !line.startsWith('Not counted again: its Hebrew')), ...(lines.length ? lines : ['Not counted: Mila couldn’t tell which word it was.'])])]
          continue
        }
        push(event, { icon: 'hold', words: [look.ref(lemma, target)], text: `Held “${event.english}” for a hint: ${event.word}` })
      } else {
        const place = key ? `on the ${event.side === 'front' ? 'question side' : event.side === 'back' ? 'answer side' : 'card'}` : 'while reading'
        const row = push(event, {
          icon: 'lookup', words: [look.ref(lemma, target)],
          text: `Looked up ${event.word}${event.phrase ? ' as a phrase' : ''} ${place}${event.saved ? ', already saved' : ''}`,
          detail: key && !event.side ? ['Side not recorded, as before 17/11: taken from how the card was shown'] : [],
        })
        lookupRows.set(event.id, row)
      }
    } else if (event.type === 'explained') {
      const row = lookupRows.get(String(event.of))
      if (!row) continue
      row.detail = [...(row.detail ?? []), `Explained as ${event.lemma || 'no single dictionary form'}${event.partOfSpeech ? `, ${event.partOfSpeech}` : ''}${event.phrase ? `, part of ${event.phrase}` : ''}, after ${duration(Number(event.ms) || 0)}${event.why === 'tap' ? '' : `, asked for by ${event.why === 'save' ? 'Save' : 'More'}`}`]
      const lines = (taken.get(event.id) ?? []).map(modelLine)
      // The lookup counted once its word was known: the reason it wasn't counted no longer holds.
      if (lines.length) row.model = [...new Set([...(row.model ?? []).filter(line => !line.startsWith('Not counted: Mila couldn’t tell') && !line.startsWith('Not counted: the phrase')), ...lines])]
    } else if (event.type === 'closed') {
      const row = lookupRows.get(String(event.of))
      if (row) row.detail = [...(row.detail ?? []), `Open ${duration(Number(event.ms) || 0)}; ${typeof event.waitMs === 'number' ? `meaning showed after ${duration(event.waitMs)}` : 'no meaning showed'}${event.details ? '; details opened' : ''}; ${ENDINGS[String(event.how)] ?? String(event.how)}`]
    } else if (event.type === 'answer' && key) {
      const final = look.answers.has(event)
      const prediction = final ? ctx.predict(event) : null
      const total = typeof event.ms === 'number' ? seconds(event.ms) : null
      const front = fronts.get(where)
      push(event, {
        icon: event.knew ? 'right' : 'wrong',
        text: `${event.revised ? 'Changed the answer: ' : ''}${event.quiz ? (event.knew ? `Chose right: ${event.chosen}` : `Chose ${event.chosen}, not ${event.answer}`) : event.knew ? 'Knew it' : 'Didn’t know it'}${event.primed ? ', just after seeing the word' : ''}`,
        detail: [
          ...(total !== null ? [front !== undefined && front <= total ? `${sayTime(total)} on the card: ${sayTime(front)} on the question side, ${sayTime(total - front)} on the answer side` : `${sayTime(total)} on the card`] : []),
          ...(Array.isArray(event.asked) && event.asked.length ? [`With the Hebrew of ${plural(event.asked.length, 'other word')} given as hints`] : []),
          ...(prediction ? [`Mila expected ${pct(prediction.p)} for ${doing(prediction.channel)} it, likely ${pct(prediction.low)} to ${pct(prediction.high)}. Card history: ${historyText(prediction)}.`] : []),
        ],
        insight: (prediction ? surprise(prediction, event, look) : undefined) ?? ambiguous(event, entry, look),
      })
    } else if (event.type === 'save') {
      const lookup = list.find(other => other.id === event.of) as Ev | undefined
      // The saved word's id (`saved`, since 17/11; before, it was lost under the event's own id).
      // An expression saved from a word is the expression its explanation found, not the word.
      const phrase = event.phrase && lookup ? look.explained.get(lookup.id)?.phrase : undefined
      const lemma = typeof phrase === 'string' && phrase ? phrase : lookup ? look.lemmaOf(lookup) : ''
      const saved = (typeof event.saved === 'string' ? look.byId.get(event.saved) : undefined) ?? look.entryOf(lemma)
      const name = saved ? saved.lemmaPlain || saved.lemma : lemma || 'a word'
      push(event, { icon: 'save', words: saved ? [look.ref(name, saved)] : [], text: `Saved ${name}${event.phrase ? ' as an expression' : ''}`, insight: saved ? commonSave(saved, event, look) : undefined })
    } else if (event.type === 'unsave') {
      push(event, { icon: 'unsave', text: 'Undid a save' })
    } else if (event.type === 'read') {
      push(event, { icon: 'book', text: `Opened ${(typeof event.text === 'string' && ctx.texts.get(event.text)?.title) || 'a passage'}` })
    } else if (event.type === 'select') {
      const doc = typeof event.text === 'string' ? ctx.texts.get(event.text) : undefined
      const sentence = doc?.chunks?.[Number(event.segment)]?.text
      push(event, { icon: 'sentence', text: `Read sentence ${Number(event.segment) + 1}${event.english === 'all' ? ', with its English showing' : ''}`, detail: sentence ? [sentence] : [] })
    } else if (event.type === 'view') {
      push(event, { icon: 'scroll', text: `Scrolled to about ${pct(Number(event.from) || 0)} to ${pct(Number(event.to) || 0)} of the passage` })
    } else if (event.type === 'plan') {
      const cards = Array.isArray(event.cards) ? event.cards as { key: string; slot: string; rank: number }[] : []
      const count = (slot: string) => cards.filter(card => card.slot === slot).length
      push(event, {
        icon: 'plan', text: `Planned ${event.from ? 'another' : 'a'} round${event.planner === 'unified' ? ' by the Unified order' : ''}: ${plural(cards.length, 'card')}, ${[count('review') && `${count('review')} reviews`, count('early') && `${count('early')} not yet due`, count('new') && `${count('new')} new`, count('familiar') && `${count('familiar')} familiar checks`, count('checkpoint') && `${count('checkpoint')} checkpoints`].filter(Boolean).join(', ')}`,
        detail: [...(Array.isArray(event.budget) ? event.budget as string[] : []), ...(typeof event.left === 'number' ? [`${event.left} more cards considered and left out, with why, in Upcoming`] : [])],
      })
    } else if (event.type === 'end') {
      push(event, { icon: 'stop', text: `Ended the round: ${plural(Number(event.answered) || 0, 'card')} answered` })
    }
  }
  // Insights over the whole session: help with common words not saved, words met while reading.
  const extra: Row[] = []
  const help = helpGaps(list, look)
  if (help) extra.push({ at: help.at, icon: 'insight', text: help.insight.label, insight: help.insight })
  const met = metWhileReading(list, ctx, look)
  if (met) extra.push({ at: list[list.length - 1].at, icon: 'insight', text: met.label, insight: met })
  const changed = estimatesChanged(before, after, list)
  if (changed.length) extra.push({ at: list[list.length - 1].at, icon: 'model', text: 'What Mila now thinks, changed by this session', detail: changed })
  for (const row of rows) if (row.model) row.model = [...new Set(row.model)]
  return { summary, rows: [...rows, ...extra] }
}
const historyText = (prediction: Prediction) => (prediction.cardAnswers ? `${pct(prediction.cardSoFar)} from ${plural(prediction.cardAnswers, 'answer')}` : 'no answers yet, 50% by default')

// Heuristics (named so they can be argued with): each an observation, what it may mean, what could
// be done, what Study did, and what happened after. The card's word is shown once, on its card.
function surprise(prediction: Prediction, event: Ev, look: ReturnType<typeof lookups>): Insight | undefined {
  const wrong = prediction.p >= SURE && !event.knew ? 'missed' : prediction.p <= 1 - SURE && event.knew ? 'knew' : null
  if (!wrong) return undefined
  const counted = prediction.evidence.filter(item => item.weight > 0)
  return {
    rule: 'surprise', label: wrong === 'missed' ? 'Mila was confident, and wrong' : 'Mila expected a miss',
    observation: `${wrong === 'missed' ? 'Didn’t know' : 'Knew'} ${prediction.lemma}, ${cardLabel(prediction.key)}, ${doing(prediction.channel)} it`,
    interpretation: `The model gave ${pct(prediction.p)}; card history: ${historyText(prediction)}. Its estimate rested on ${counted.length ? counted.map(item => `${item.text.charAt(0).toLowerCase()}${item.text.slice(1)}${item.dated ? '' : ', date only'}`).join('; ') : 'its starting assumption only, from how common the word is'}.`,
    opportunity: 'Check whether that evidence should count as much as it did',
    outcome: look.outcome(prediction.wordId, event.at),
  }
}
function ambiguous(event: Ev, entry: InsightEntry | undefined, look: ReturnType<typeof lookups>): Insight | undefined {
  if (event.knew || event.front !== 'en' || !Array.isArray(event.asked) || !event.asked.length || !entry) return undefined
  return {
    rule: 'ambiguous-miss', label: 'A miss that may not be about the word',
    observation: `Didn’t know ${entry.lemmaPlain || entry.lemma} after asking for the Hebrew of ${plural(event.asked.length, 'other word')} in its sentence`,
    interpretation: 'One swipe can’t say whether the card’s word or the rest of the sentence was missed; it counts against the card’s word in full',
    opportunity: 'Design candidate: a swipe for the card’s word only, or marking which words were missed',
    decision: 'None: counted as a miss', acted: false, outcome: look.outcome(entry.id, event.at),
  }
}
function commonSave(entry: InsightEntry, event: Ev, look: ReturnType<typeof lookups>): Insight | undefined {
  const rank = look.rankOfEntry(entry)
  if (!rank || rank > COMMON_RANK) return undefined
  const shown = look.shownAfter(entry.id, event.at)
  return {
    rule: 'common-save', label: 'A common word saved',
    observation: `Saved ${entry.lemmaPlain || entry.lemma}, ${rankText(rank)}`,
    interpretation: 'A common word looked up and saved is likely a real gap, and one that comes up often',
    opportunity: 'Bring it into Study soon',
    decision: shown ? `Study brought it in on ${day(shown.at)}: ${plainWhy(shown.why)}` : 'Not studied yet. Study brings in the most common saved words first, those ranked 3,000 or better, three new words a round',
    acted: !!shown, outcome: look.outcome(entry.id, event.at),
  }
}
function helpGaps(list: Ev[], look: ReturnType<typeof lookups>): { at: number; insight: Insight } | null {
  const asked = list.filter(event => event.type === 'lookup' && event.help === 'english')
  const gaps = new Map<string, { lemma: string; rank: number; english: string }>()
  for (const event of asked) {
    const lemma = look.lemmaOf(event)
    if (!lemma || look.entryOf(lemma)) continue
    const rank = rankOf(lemma, String(event.word))
    if (rank && rank <= COMMON_RANK) gaps.set(lemmaKeyOf(lemma), { lemma, rank, english: String(event.english ?? '') })
  }
  if (!gaps.size) return null
  const items = [...gaps.values()]
  return {
    at: asked[asked.length - 1].at,
    insight: {
      rule: 'help-gap', label: `Needed a hint for ${plural(items.length, 'common word')} not saved`,
      observation: items.map(item => `“${item.english}” → ${item.lemma}, ${rankText(item.rank)}`).join('; '),
      interpretation: 'Each was needed once while building a sentence: a possible gap in producing it, not proof of not knowing it',
      opportunity: 'Could be offered as words to learn',
      decision: 'None: Mila doesn’t add words to study on its own', acted: false, words: items.map(item => ({ lemma: item.lemma })),
    },
  }
}
function metWhileReading(list: Ev[], ctx: Context, look: ReturnType<typeof lookups>): Insight | null {
  const selects = list.filter(event => event.type === 'select' && typeof event.text === 'string')
  if (!selects.length) return null
  const match = savedFormMatcher(ctx.entries as LearnerEntry[])
  const lookedUp = new Set(list.filter(event => event.type === 'lookup').map(event => lemmaKeyOf(look.lemmaOf(event))))
  const met = new Map<string, number>()
  for (const event of selects) {
    const text = ctx.texts.get(event.text as string)?.chunks?.[Number(event.segment)]?.text ?? ''
    for (const token of text.split(/[\s־]+/)) for (const key of match(token.replace(/[^א-ת֑-ׇ'"׳״]/g, ''))) if (!lookedUp.has(key)) met.set(key, (met.get(key) ?? 0) + 1)
  }
  if (!met.size) return null
  const words = [...met.keys()].map(key => look.byKey.get(key)).filter((entry): entry is InsightEntry => !!entry)
  return {
    rule: 'met-in-reading', label: `Met ${plural(words.length, 'saved word')} while reading, without looking them up`,
    observation: `In the ${plural(new Set(selects.map(event => `${event.text}:${event.segment}`)).size, 'sentence')} selected: ${words.slice(0, 12).map(entry => entry.lemmaPlain || entry.lemma).join(', ')}${words.length > 12 ? '…' : ''}`,
    interpretation: 'Exposure only: kept apart, not counted as knowing them, since reading past a word isn’t understanding it',
    words: words.map(entry => look.ref(entry.lemma, entry)),
  }
}
function estimatesChanged(before: LearnerState, after: LearnerState, list: Ev[]) {
  const ids = new Set(list.map(event => event.id))
  const old = new Map(before.words.map(word => [word.key, word]))
  const lines: string[] = []
  for (const word of after.words) {
    if (!word.evidence.some(item => item.from?.some(id => ids.has(id)))) continue
    const was = old.get(word.key)
    for (const channel of ['recognition', 'production'] as const) {
      const from = was?.[channel].p ?? word.prior[channel], to = word[channel].p
      if (Math.abs(to - from) >= 0.03) lines.push(`${word.lemma}: ${doing(channel)} ${pct(from)} → ${pct(to)}, likely ${pct(word[channel].low)} to ${pct(word[channel].high)} now`)
    }
  }
  return lines
}

// One word: what Mila thinks it knows (with every piece of evidence and where it came from), how
// important the word seems, and what Study's own rules say about when it comes up: three things,
// kept apart.
export function wordTrace(id: string, ctx: Context, extra: { exposure?: { read: number; texts: number }; lookedUp?: { count: number; last: number }; predictions: Prediction[]; memories?: Map<string, Memory> }) {
  const look = lookups(ctx)
  const entry = look.byId.get(id) ?? look.entryOf(id)
  const state = ctx.stateAt(ctx.now)
  const key = lemmaKeyOf(entry ? entry.lemmaPlain || entry.lemma : id)
  const word = state.words.find(item => item.key === key)
  if (!entry && !word) return null
  const sessionOf = new Map(ctx.events.map(event => [event.id, event.session]))
  const lemma = entry?.lemmaPlain || entry?.lemma || word!.lemma
  const related = entry ? ctx.entries.filter(other => other.id !== entry.id && (
    (entry.root && other.root === entry.root) || lemmaKeyOf(other.lemmaPlain || other.lemma).split(' ').includes(key) || key.split(' ').includes(lemmaKeyOf(other.lemmaPlain || other.lemma)))) : []
  return {
    word: { id: entry?.id, lemma, gloss: entry?.gloss, partOfSpeech: entry?.partOfSpeech, saved: !!entry },
    knowledge: word ? {
      recognition: word.recognition, production: word.production, prior: word.prior, band: word.band, answers: word.answers,
      evidence: word.evidence.slice(0, 40).map(item => ({ ...evidenceLineOf(item), channel: item.channel, sessions: [...new Set((item.from ?? []).map(from => sessionOf.get(from)).filter(Boolean))] })),
    } : null,
    importance: {
      rank: entry ? look.rankOfEntry(entry) : word?.rank, rankText: rankText(entry ? look.rankOfEntry(entry) : word?.rank),
      saves: entry?.encounters?.length ?? 0, lookedUpAgain: extra.lookedUp?.count ?? 0, readTimes: extra.exposure?.read ?? 0, readTexts: extra.exposure?.texts ?? 0,
      themes: entry?.categories ?? [], register: entry?.register, level: entry?.level,
    },
    scheduling: entry ? {
      cards: cardsOfEntry(entry as LearnerEntry).map(card => {
        const memory = extra.memories?.get(card.key)
        return {
          key: card.key, label: cardLabel(card.key), state: studyState(card.results.results ?? [], card.results.primed ?? []), results: card.results.results ?? [], last: card.results.last ?? null,
          ...(memory ? { memory: { recall: Math.round(100 * retrievability((ctx.now - memory.last) / 86_400_000, memory.s)) / 100, stability: Math.round(memory.s * 10) / 10, reviews: memory.reviews, undated: memory.undated } } : {}),
        }
      }),
      known: entry.known ?? [],
      lastShown: (() => { const shown = [...ctx.events].reverse().find(event => event.type === 'show' && typeof event.key === 'string' && parseCardKey(event.key).wordId === entry.id); return shown ? { at: shown.at, why: shown.why ? plainWhy(shown.why) : null } : null })(),
    } : null,
    surprises: extra.predictions.filter(item => item.wordId === entry?.id && ((item.p >= SURE && !item.knew) || (item.p <= 1 - SURE && item.knew))),
    related: related.slice(0, 12).map(other => ({ id: other.id, lemma: other.lemmaPlain || other.lemma, why: entry?.root && other.root === entry.root ? `same root, ${entry.root}` : 'one is part of the other' })),
  }
}

// How the model is doing: its predictions of recent answers against what happened, against the
// card's own history and against a constant at the overall rate; how its predictions compare with
// what happened, range by range and by direction; its confident misses; and where the data itself
// is unsure.
const RANGES: [number, number][] = [[0, 0.1], [0.1, 0.25], [0.25, 0.5], [0.5, 0.75], [0.75, 1.01]]
// `memory`: the memory model's expected recall before each answer (lib/memory.ts, FSRS), by answer
// id, with the days since the card's previous answer.
export function modelChecks(predictions: Prediction[], events: Ev[], entries: InsightEntry[], unpredicted: number, memory: Map<string, { r: number; days: number; guessed: boolean }> = new Map()) {
  const loss = (p: number, knew: boolean) => -Math.log(Math.min(0.99, Math.max(0.01, knew ? p : 1 - p)))
  const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)
  const round = (x: number, by = 1000) => Math.round(x * by) / by
  const rate = predictions.length ? predictions.filter(item => item.knew).length / predictions.length : 0.5
  const holds = events.filter(event => event.type === 'hold')
  const cardLookups = events.filter(event => event.type === 'lookup' && typeof event.key === 'string' && event.help !== 'english')
  const kept = entries.reduce((sum, entry) => sum + cardsOfEntry(entry as LearnerEntry).reduce((s, card) => s + (card.results.results?.length ?? 0), 0), 0)
  const calibration = (['production', 'recognition', 'either'] as const).flatMap(channel => RANGES.map(([low, high]) => {
    const inside = predictions.filter(item => item.channel === channel && item.p >= low && item.p < high)
    return inside.length ? { channel, range: `${Math.round(low * 100)}–${Math.min(100, Math.round(high * 100))}%`, n: inside.length, predicted: round(mean(inside.map(item => item.p)), 100), actual: round(inside.filter(item => item.knew).length / inside.length, 100), card: round(mean(inside.map(item => item.cardSoFar)), 100) } : null
  }).filter((item): item is NonNullable<typeof item> => !!item))
  // The three on the same answers: those a day or more after the card's previous answer, which is
  // what the memory model is a model of (same-day repeats it expects to be all but certain), and
  // only where that previous answer's time was recorded (an older result's date is a guess).
  const withMemory = predictions.filter(item => (memory.get(item.answer)?.days ?? 0) >= 1 && !memory.get(item.answer)!.guessed)
  const sameDay = predictions.filter(item => memory.has(item.answer) && memory.get(item.answer)!.days < 1).length
  const guessed = predictions.filter(item => memory.has(item.answer) && memory.get(item.answer)!.days >= 1 && memory.get(item.answer)!.guessed).length
  const rOf = (item: Prediction) => memory.get(item.answer)!.r
  const lossOn = (list: Prediction[], p: (item: Prediction) => number) => (list.length ? round(mean(list.map(item => loss(p(item), item.knew)))) : null)
  const memoryCalibration = RANGES.map(([low, high]) => {
    const inside = withMemory.filter(item => rOf(item) >= low && rOf(item) < high)
    return inside.length ? { range: `${Math.round(low * 100)}–${Math.min(100, Math.round(high * 100))}%`, n: inside.length, predicted: round(mean(inside.map(rOf)), 100), actual: round(inside.filter(item => item.knew).length / inside.length, 100) } : null
  }).filter((item): item is NonNullable<typeof item> => !!item)
  return {
    shadow: shadowChecks(events),
    memory: {
      answers: withMemory.length, sameDay, guessed,
      loss: { memory: lossOn(withMemory, rOf), model: lossOn(withMemory, item => item.p), card: lossOn(withMemory, item => item.cardSoFar) },
      calibration: memoryCalibration,
    },
    retention: retentionOf(events),
    answers: predictions.length, unpredicted,
    right: predictions.filter(item => item.knew).length,
    expected: round(mean(predictions.map(item => item.p)), 100),
    rate: round(rate, 100),
    loss: { model: round(mean(predictions.map(item => loss(item.p, item.knew)))), card: round(mean(predictions.map(item => loss(item.cardSoFar, item.knew)))), base: round(mean(predictions.map(item => loss(rate, item.knew)))) },
    calibration,
    surprises: predictions.filter(item => (item.p >= SURE && !item.knew) || (item.p <= 1 - SURE && item.knew)).sort((a, b) => b.at - a.at),
    data: [
      { label: 'Events that reached the server over 10 minutes late', value: events.filter(event => typeof event.receivedAt === 'number' && event.receivedAt - event.at > LATE_MS).length },
      { label: 'Answers that don’t record which side was shown first, from before 14/11', value: predictions.filter(item => item.channel === 'either').length, of: predictions.length },
      { label: 'Lookups on cards without their side recorded, taken from how the card was shown', value: cardLookups.filter(event => !event.side).length },
      { label: 'Hints that found nothing', value: holds.filter(event => event.found === 'unknown' || event.found === 'failed').length, of: holds.length },
      { label: 'Card results kept on cards, the last few per card; older ones have a date only, no time', value: kept },
      { label: 'Study sessions with no recorded end', value: new Set(events.filter(event => event.type === 'start').map(event => event.session)).size - new Set(events.filter(event => event.type === 'end').map(event => event.session)).size },
    ],
  }
}

// Recall on a later day: unprimed answers on a card answered on an earlier day, by how long since
// that earlier answer. A baseline for the current scheduler, before any change, to compare with
// later; not a measure of a scheduler on its own (it chooses when cards come back).
export function retentionOf(events: Ev[]) {
  const answers = [...finalAnswers(events)].sort((a, b) => a.at - b.at)
  const dayOf = (at: number) => Math.floor(at / 86_400_000)
  const buckets: [string, number, number][] = [['next day', 1, 1], ['2 to 6 days', 2, 6], ['7 days or more', 7, Infinity]]
  const found = buckets.map(([label]) => ({ label, n: 0, right: 0 }))
  const byCard = new Map<string, Ev[]>()
  for (const answer of answers) {
    const before = byCard.get(answer.key as string) ?? []
    const earlier = [...before].reverse().find(other => dayOf(other.at) < dayOf(answer.at))
    if (earlier && !answer.primed) {
      const gap = dayOf(answer.at) - dayOf(earlier.at)
      const i = buckets.findIndex(([, low, high]) => gap >= low && gap <= high)
      if (i >= 0) { found[i].n++; if (answer.knew) found[i].right++ }
    }
    byCard.set(answer.key as string, [...before, answer])
  }
  return found.map(item => ({ ...item, rate: item.n ? Math.round(100 * item.right / item.n) / 100 : null }))
}

// The shadow score (mobile lib/scoring.ts) set against what happened after each round was planned:
// for each word a plan scored (the first plan of a day for it), whether it was shown in the next 7
// days and how its next unprimed answer went. Two checks, neither of them learning value: whether
// `need` goes with missing (a word scored as needing practice should be missed more), and what
// became of the words the score and Study disagreed on. Words Study chose are answered in the same
// round, so they are shown more by construction: compare like with like.
export function shadowChecks(events: Ev[], now = Date.now()) {
  const answers = [...finalAnswers(events)].filter(event => !event.primed).sort((a, b) => a.at - b.at)
  const shows = events.filter(event => event.type === 'show')
  const wordOf = (key: unknown) => (typeof key === 'string' ? parseCardKey(key).wordId : '')
  type Logged = { id: string; p: string; s: number; n: number; sr: number; r: number; c: boolean; w: boolean }
  const seen = new Set<string>()
  const items: (Logged & { at: number; shown: boolean; next: boolean | null })[] = []
  let version = ''
  for (const plan of events.filter(event => event.type === 'plan' && event.shadow)) {
    const shadow = plan.shadow as { v: string; words: Logged[] }
    version = shadow.v
    for (const word of shadow.words ?? []) {
      const id = `${day(plan.at)}:${word.p}:${word.id}`
      if (seen.has(id)) continue
      seen.add(id)
      const until = plan.at + 7 * 86_400_000
      const next = answers.find(answer => answer.at > plan.at && answer.at <= until && wordOf(answer.key) === word.id)
      items.push({ ...word, at: plan.at, shown: shows.some(show => show.at > plan.at && show.at <= until && wordOf(show.key) === word.id), next: next ? !!next.knew : null })
    }
  }
  const missRate = (list: typeof items) => { const answered = list.filter(item => item.next !== null); return { answered: answered.length, missed: answered.length ? Math.round(100 * answered.filter(item => !item.next).length / answered.length) / 100 : null } }
  const needBins: [string, number, number][] = [['under 0.4', 0, 0.4], ['0.4 to 0.6', 0.4, 0.6], ['0.6 and over', 0.6, 2]]
  const groups: [string, (item: Logged) => boolean][] = [['Both would take', item => item.c && item.w], ['Score only', item => !item.c && item.w], ['Study only', item => item.c && !item.w], ['Neither', item => !item.c && !item.w]]
  return {
    version, plans: events.filter(event => event.type === 'plan' && event.shadow).length, words: items.length, pending: items.filter(item => now - item.at < 7 * 86_400_000).length,
    need: needBins.map(([label, low, high]) => { const list = items.filter(item => item.p !== 'new' && item.n >= low && item.n < high); return { label, n: list.length, need: list.length ? Math.round(100 * list.reduce((sum, item) => sum + item.n, 0) / list.length) / 100 : null, ...missRate(list) } }),
    groups: groups.map(([label, test]) => { const list = items.filter(test); return { label, n: list.length, shown: list.length ? Math.round(100 * list.filter(item => item.shown).length / list.length) / 100 : null, ...missRate(list) } }),
  }
}

// The card's own history, smoothed: (right + 1) / (answers + 2), so no answers is 50%, one miss
// 33%, two misses 25%, one right 67%.
export const predictionFor = (answer: Ev, word: LearnerState['words'][number] | undefined, history: { right: number; all: number }): Omit<Prediction, 'answer'> | null => {
  if (!word || typeof answer.key !== 'string') return null
  const channel = answer.quiz ? 'recognition' : channelOf(answer.front)
  const of = channel === 'either' ? { p: (word.recognition.p + word.production.p) / 2, low: Math.min(word.recognition.low, word.production.low), high: Math.max(word.recognition.high, word.production.high) } : word[channel]
  const counted = word.evidence.filter(item => item.weight > 0 && (channel === 'either' || item.channel === channel || item.channel === 'either'))
  return {
    at: answer.at, key: answer.key, wordId: parseCardKey(answer.key).wordId, lemma: word.lemma, channel, knew: !!answer.knew,
    p: of.p, low: of.low, high: of.high, prior: channel === 'production' ? word.prior.production : word.prior.recognition,
    cardSoFar: Math.round(((history.right + 1) / (history.all + 2)) * 100) / 100, cardAnswers: history.all,
    evidence: counted.slice(0, 6).map(evidenceLineOf),
  }
}

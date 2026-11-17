import { rankOf } from './frequency.ts'
import { studyState } from './calibration.ts'
import { cardsOfEntry, lemmaKeyOf, parseCardKey, savedFormMatcher, type Evidence, type LearnerEntry, type LearnerEvent, type LearnerState } from './learner.ts'

// Learning Insights (admin only, the app's Account → Learning Insights): what Mila observed of a
// learner, told session by session, what it took from it (the learner model's evidence, each piece
// traced to the events it came from), and a few plain, labelled heuristics that say what a
// learning opportunity might be and what Study actually did about it. It reads and never decides:
// nothing here changes what Study does, and nothing is stored but predictions already worked out
// (insights.ts keeps those per model version). Observations (events), interpretations (the model,
// versioned) and heuristics (named, versioned here) stay apart so each can be judged on its own.
export const INSIGHTS_VERSION = 'insights-v0'

// A gap longer than this without anything happening isn't counted as time spent (a phone put
// down); going to the background ends time spent at once.
export const IDLE_MS = 120_000
// How common a word must be for its save or need to be called out (frequency rank).
export const COMMON_RANK = 3000
// A prediction this sure that turned out wrong is a surprise.
export const SURE = 0.75

export type Ev = LearnerEvent & { id: string; receivedAt?: number }
type Form = { key: string; stage: string; slot: string; results?: boolean[]; primed?: boolean[]; last?: number; sentence?: string; translation?: string; variants?: { sentence?: string; translation?: string }[] }
export type InsightEntry = Omit<LearnerEntry, 'forms'> & { forms?: Form[]; categories?: string[]; register?: string; level?: string; root?: string; known?: string[] }
export type TextDoc = { id?: string; textId?: string; title?: string; chunks?: { text?: string; translation?: string }[] }
export type WordRef = { id?: string; lemma: string }
// One prediction of an answer, as Mila would have made it just before it.
export type Prediction = { answer: string; at: number; key: string; wordId: string; lemma: string; channel: 'recognition' | 'production' | 'either'; knew: boolean; p: number; low: number; high: number; prior: number; cardSoFar: number; cardAnswers: number; evidence: string[] }
export type Insight = { rule: string; label: string; observation: string; interpretation: string; opportunity?: string; decision?: string; acted?: boolean; outcome?: string; words?: WordRef[] }
export type Row = { at: number; gapMs?: number; icon: string; text: string; detail?: string[]; words?: WordRef[]; model?: string[]; flags?: string[]; insight?: Insight }
export type SessionSummary = { id: string; kind: 'study' | 'reading'; title: string; start: number; end: number; activeMs: number; endedBy: string; counts: Record<string, number>; late: number }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
export const duration = (ms: number) => (ms < 1000 ? 'under a second' : ms < 60_000 ? `${Math.round(ms / 1000)} s` : ms < 3_600_000 ? `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s` : `${(ms / 3_600_000).toFixed(1)} h`)
const pct = (p: number) => `${Math.round(p * 100)}%`
const day = (at: number) => new Date(at).toISOString().slice(0, 10)
const rankText = (rank?: number) => (!rank ? 'not in the frequency list' : rank <= 1000 ? `very common (#${rank})` : rank <= COMMON_RANK ? `common (#${rank})` : rank <= 10000 ? `less common (#${rank})` : `rare (#${rank})`)
export const cardLabel = (key: string) => {
  const card = parseCardKey(key)
  if (card.kind === 'word') return 'word card'
  if (card.kind === 'checkpoint') return `${card.stage} checkpoint`
  return card.stage === 'meanings' ? `meaning ${card.slot.replace('sense', '')}` : `${card.stage} ${card.slot}`
}
const sideOf = (front: unknown) => (front === 'en' ? 'English first' : front === 'he' ? 'Hebrew first' : 'side not recorded')
const channelOf = (front: unknown) => (front === 'en' ? 'production' : front === 'he' ? 'recognition' : 'either') as Prediction['channel']

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

export function sessionsOf(events: Ev[], texts: Map<string, TextDoc>, now = Date.now()): SessionSummary[] {
  const background = backgroundSpans(events, now)
  const bySession = new Map<string, Ev[]>()
  for (const event of events) if (event.type !== 'app') (bySession.get(event.session) ?? bySession.set(event.session, []).get(event.session)!).push(event)
  const answers = finalAnswers(events)
  return [...bySession.entries()].map(([id, list]): SessionSummary => {
    const study = isStudy(list)
    const start = list[0].at, end = list[list.length - 1].at
    let activeMs = 0
    for (let i = 1; i < list.length; i++) activeMs += spent(list[i - 1].at, list[i].at, background)
    const last = list[list.length - 1]
    const left = background.find(([from]) => from >= end && from - end <= IDLE_MS)
    const endedBy = last.type === 'end' ? 'finished' : left ? 'left the app' : now - end < IDLE_MS ? 'still going' : 'no end recorded'
    const count = (type: string) => list.filter(event => event.type === type).length
    const text = list.find(event => typeof event.text === 'string')?.text as string | undefined
    const title = study ? 'Study' : (text && texts.get(text)?.title) || 'Reading'
    const mine = list.filter(event => answers.has(event))
    return {
      id, kind: study ? 'study' : 'reading', title, start, end, activeMs, endedBy,
      counts: study
        ? <Record<string, number>>{ cards: count('show'), answers: mine.length, right: mine.filter(event => event.knew).length, holds: count('hold') || list.filter(event => event.type === 'lookup' && event.help === 'english').length, lookups: list.filter(event => event.type === 'lookup' && event.help !== 'english').length, saves: count('save') }
        : { sentences: new Set(list.filter(event => event.type === 'select').map(event => event.segment)).size, lookups: count('lookup'), saves: count('save') },
      late: list.filter(event => typeof event.receivedAt === 'number' && event.receivedAt - event.at > 3_600_000).length,
    }
  }).sort((a, b) => b.start - a.start)
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
  const closed = new Map(ctx.events.filter(event => event.type === 'closed').map(event => [String(event.of), event]))
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
    return since.length ? `${plural(since.length, 'answer')} since, ${since.filter(event => event.knew).length} right${since.some(event => event.primed) ? ` (${since.filter(event => event.primed).length} primed)` : ''}` : 'No answers since'
  }
  return { byId, byKey, explained, closed, lemmaOf, entryOf, rankOfEntry, ref, answers, shownAfter, outcome }
}

// Evidence the model took from each event, by event id, from a state that includes them.
function evidenceByEvent(state: LearnerState) {
  const index = new Map<string, { lemma: string; id?: string; evidence: Evidence }[]>()
  for (const word of state.words) for (const evidence of word.evidence) for (const from of evidence.from ?? []) {
    (index.get(from) ?? index.set(from, []).get(from)!).push({ lemma: word.lemma, id: word.id, evidence })
  }
  return index
}
export const evidenceLine = ({ lemma, evidence }: { lemma: string; evidence: Evidence }) => evidence.weight === 0
  ? `${lemma}: noted, not counted (${evidence.what})`
  : `${lemma}: ${evidence.knew ? 'for' : 'against'} ${evidence.channel === 'either' ? 'knowing it' : evidence.channel === 'production' ? 'producing it' : 'recognizing it'}, weight ${Math.round(evidence.weight * 100) / 100}`

// A session told event by event, with the evidence taken from each and the insights it gave.
export function sessionStory(id: string, ctx: Context): { summary: SessionSummary; rows: Row[] } | null {
  const list = ctx.events.filter(event => event.session === id)
  if (!list.length) return null
  const summary = sessionsOf(list.concat(ctx.events.filter(event => event.type === 'app')), ctx.texts, ctx.now).find(item => item.id === id)!
  const look = lookups(ctx)
  const before = ctx.stateAt(list[0].at)
  const after = ctx.stateAt(list[list.length - 1].at + 1)
  const taken = evidenceByEvent(after)
  const background = backgroundSpans(ctx.events, ctx.now)
  const hasHolds = list.some(event => event.type === 'hold')
  const shows = new Map<number, Ev>()
  const rows: Row[] = []
  const lookupRows = new Map<string, Row>()
  let previous = 0
  const push = (event: Ev, row: Omit<Row, 'at' | 'gapMs'>) => {
    const late = typeof event.receivedAt === 'number' && event.receivedAt - event.at > 3_600_000
    const away = background.find(([from, to]) => from > previous && to <= event.at && previous > 0)
    rows.push({
      at: event.at, ...(previous ? { gapMs: event.at - previous } : {}), ...row,
      model: [...(row.model ?? []), ...(taken.get(event.id) ?? []).map(evidenceLine)],
      flags: [...(row.flags ?? []), ...(late ? [`reached the server ${duration(event.receivedAt! - event.at)} later`] : []), ...(away ? [`after ${duration(away[1] - away[0])} away from the app`] : [])],
    })
    previous = event.at
    return rows[rows.length - 1]
  }
  for (const event of list) {
    const key = typeof event.key === 'string' ? event.key : null
    const entry = key ? look.byId.get(parseCardKey(key).wordId) : undefined
    const word = entry ? [look.ref(entry.lemma, entry)] : []
    if (event.type === 'start') {
      push(event, { icon: 'play', text: `${event.resumed ? 'Went on with a round' : 'Started a round'}: ${plural(Number(event.cards) || 0, 'card')}, ${sideOf(event.front === 'mixed' ? null : event.front).replace('side not recorded', 'mixed sides')}, ${event.order === 'shuffle' ? 'shuffled' : 'smart order'}`, detail: [`${event.started ?? '?'} words started, ${event.unstarted ?? '?'} waiting, ${event.saved ?? '?'} saved`] })
    } else if (event.type === 'show' && key) {
      shows.set(Number(event.position), event)
      const form = entry?.forms?.find(item => `${entry.id}:${item.key}` === key)
      const sentence = typeof event.variant === 'number' && event.variant > 0 ? form?.variants?.[event.variant - 1] : form
      push(event, {
        icon: 'card', words: word,
        text: `Card: ${entry?.lemmaPlain || entry?.lemma || event.lemma} · ${cardLabel(key)} · ${event.quiz ? 'fill in the blank' : sideOf(event.front)}`,
        detail: [
          ...(sentence?.sentence ? [`${event.front === 'en' && sentence.translation ? sentence.translation : sentence.sentence}`] : []),
          `Why this card: ${event.why ?? 'not recorded'}`,
          ...(event.exerciseWhy ? [`Why asked this way: ${event.exerciseWhy}`] : []),
          ...(event.sentence ? [`Which sentence: ${event.sentence}${event.sentenceNew ? ' (new to this card)' : ''}`] : []),
        ],
      })
    } else if (event.type === 'reveal') {
      push(event, { icon: 'flip', text: `Turned over after ${duration(Number(event.ms) || 0)}` })
    } else if (event.type === 'hold') {
      const found = event.found
      push(event, {
        icon: 'hold', text: `Held “${event.english}” → ${found === 'hebrew' ? event.hebrew : found === 'none' ? 'no separate Hebrew word' : found === 'target' ? 'part of the word being recalled' : found === 'failed' ? 'couldn’t be looked up' : 'not matched (shown nothing)'}`,
        detail: [event.from === 'late' ? `The card wasn’t prepared: asked for then, ${duration(Number(event.waitMs) || 0)}` : 'From the card’s own word data, at once'],
        flags: found === 'unknown' || found === 'failed' ? ['help that found nothing'] : [],
      })
    } else if (event.type === 'lookup') {
      const lemma = look.lemmaOf(event)
      const target = look.entryOf(lemma)
      if (event.help === 'english') {
        if (hasHolds) { const last = rows[rows.length - 1]; last.model = [...(last.model ?? []), ...(taken.get(event.id) ?? []).map(evidenceLine)]; continue }
        push(event, { icon: 'hold', words: [look.ref(lemma, target)], text: `Held “${event.english}” for its Hebrew: ${event.word}` })
      } else {
        const where = key ? `on the ${event.side === 'front' ? 'question side' : event.side === 'back' ? 'answer side' : 'card'}` : 'while reading'
        const row = push(event, {
          icon: 'lookup', words: [look.ref(lemma, target)],
          text: `Looked up ${event.word}${event.phrase ? ' (a phrase)' : ''} ${where}${event.saved ? ' — already saved' : ''}`,
          detail: [...(key && !event.side ? ['Side not recorded (before 2026-11-17): taken from how the card was shown'] : [])],
        })
        lookupRows.set(event.id, row)
      }
    } else if (event.type === 'explained') {
      const row = lookupRows.get(String(event.of))
      if (row) row.detail = [...(row.detail ?? []), `Explained as ${event.lemma || 'no single dictionary form'}${event.partOfSpeech ? ` (${event.partOfSpeech})` : ''}${event.phrase ? `, part of ${event.phrase}` : ''} after ${duration(Number(event.ms) || 0)}${event.why === 'tap' ? '' : ` (asked by ${event.why})`}`]
      if (row) row.model = [...(row.model ?? []), ...(taken.get(event.id) ?? []).map(evidenceLine)]
    } else if (event.type === 'closed') {
      const row = lookupRows.get(String(event.of))
      if (row) row.detail = [...(row.detail ?? []), `Open ${duration(Number(event.ms) || 0)}${typeof event.waitMs === 'number' ? `, meaning shown after ${duration(event.waitMs)}` : ', no meaning shown'}${event.details ? ', details opened' : ''}; ended by ${event.how}`]
    } else if (event.type === 'answer' && key) {
      const final = look.answers.has(event)
      const shown = shows.get(Number(event.position))
      const prediction = final ? ctx.predict(event) : null
      push(event, {
        icon: event.knew ? 'right' : 'wrong', words: word,
        text: `${event.revised ? 'Changed the answer: ' : ''}${event.quiz ? (event.knew ? `Chose right: ${event.chosen}` : `Chose ${event.chosen}, not ${event.answer}`) : event.knew ? 'Knew it' : 'Didn’t know it'}${event.primed ? ' (primed)' : ''}`,
        detail: [
          ...(typeof event.ms === 'number' ? [`${duration(event.ms)} on the card${shown ? backSide(list, shown, event) : ''}`] : []),
          ...(Array.isArray(event.asked) && event.asked.length ? [`With the Hebrew of ${plural(event.asked.length, 'other word')} given`] : []),
          ...(event.primed ? ['Primed: the word was just shown, so it counts a quarter'] : []),
          ...(prediction ? [`Mila expected ${pct(prediction.p)} (${prediction.channel}, range ${pct(prediction.low)}–${pct(prediction.high)}); the card’s own history said ${pct(prediction.cardSoFar)}`] : []),
        ],
        ...(prediction ? { insight: surprise(prediction, event, look) ?? ambiguous(event, entry, look) } : { insight: ambiguous(event, entry, look) }),
      })
    } else if (event.type === 'save') {
      const lookup = list.find(other => other.id === event.of) as Ev | undefined
      // The saved word's id (`saved`, since 2026-11-17; before, it was lost under the event's own id).
      const lemma = lookup ? look.lemmaOf(lookup) : ''
      const saved = (typeof event.saved === 'string' ? look.byId.get(event.saved) : undefined) ?? look.entryOf(lemma)
      const name = saved ? saved.lemmaPlain || saved.lemma : lemma || 'a word'
      push(event, { icon: 'save', words: saved ? [look.ref(name, saved)] : [], text: `Saved ${name}${event.phrase ? ' (as an expression)' : ''}`, insight: saved ? commonSave(saved, event, look) : undefined })
    } else if (event.type === 'unsave') {
      push(event, { icon: 'unsave', text: 'Undid a save' })
    } else if (event.type === 'read') {
      push(event, { icon: 'book', text: `Opened ${(typeof event.text === 'string' && ctx.texts.get(event.text)?.title) || 'a passage'}` })
    } else if (event.type === 'select') {
      const doc = typeof event.text === 'string' ? ctx.texts.get(event.text) : undefined
      const sentence = doc?.chunks?.[Number(event.segment)]?.text
      push(event, { icon: 'sentence', text: `Read sentence ${Number(event.segment) + 1}${event.english === 'all' ? ' (English showing)' : ''}`, detail: sentence ? [sentence] : [] })
    } else if (event.type === 'view') {
      push(event, { icon: 'scroll', text: `Scrolled to about ${pct(Number(event.from) || 0)}–${pct(Number(event.to) || 0)} of the passage` })
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
  // Evidence from a lookup and its explanation is one piece: said once.
  for (const row of rows) if (row.model) row.model = [...new Set(row.model)]
  return { summary, rows: [...rows, ...extra] }
}

// Of the time on a card, how much was on its answer side (from turning it over to answering).
const backSide = (list: Ev[], shown: Ev, answer: Ev) => {
  const reveal = list.find(event => event.type === 'reveal' && event.position === shown.position && event.at >= shown.at && event.at <= answer.at)
  return reveal ? `, ${duration(answer.at - reveal.at)} of it on the answer side` : ''
}

// Heuristics (named so they can be argued with): each an observation, what it may mean, what could
// be done, what Study did, and what happened after.
function surprise(prediction: Prediction, event: Ev, look: ReturnType<typeof lookups>): Insight | undefined {
  const wrong = prediction.p >= SURE && !event.knew ? 'missed' : prediction.p <= 1 - SURE && event.knew ? 'knew' : null
  if (!wrong) return undefined
  return {
    rule: 'surprise', label: wrong === 'missed' ? 'Mila was confident, and wrong' : 'Mila expected a miss',
    observation: `${wrong === 'missed' ? 'Didn’t know' : 'Knew'} ${prediction.lemma} (${cardLabel(prediction.key)}, ${prediction.channel})`,
    interpretation: `The model gave ${pct(prediction.p)}; the card’s own history ${pct(prediction.cardSoFar)} from ${plural(prediction.cardAnswers, 'answer')}. Its estimate rested on: ${prediction.evidence.length ? prediction.evidence.join('; ') : 'its starting assumption only (how common the word is)'}`,
    opportunity: 'Check whether that evidence should count as much as it did',
    outcome: look.outcome(prediction.wordId, event.at), words: [{ id: prediction.wordId, lemma: prediction.lemma }],
  }
}
function ambiguous(event: Ev, entry: InsightEntry | undefined, look: ReturnType<typeof lookups>): Insight | undefined {
  if (event.knew || event.front !== 'en' || !Array.isArray(event.asked) || !event.asked.length || !entry) return undefined
  return {
    rule: 'ambiguous-miss', label: 'A miss that may not be about the word',
    observation: `Didn’t know ${entry.lemmaPlain || entry.lemma} after asking for the Hebrew of ${plural(event.asked.length, 'other word')} in its sentence`,
    interpretation: 'One swipe can’t say whether the card’s word or the rest of the sentence was missed; it counts against the card’s word in full',
    opportunity: 'Design candidate: a swipe for the card’s word only, or marking which words were missed',
    decision: 'None (counted as a miss)', acted: false, outcome: look.outcome(entry.id, event.at), words: [look.ref(entry.lemma, entry)],
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
    decision: shown ? `Study brought it in on ${day(shown.at)}: ${shown.why ?? ''}` : 'Not studied yet. Study brings in the most common saved words first (rank ≤ 3,000), three new words a round',
    acted: !!shown, outcome: look.outcome(entry.id, event.at), words: [look.ref(entry.lemma, entry)],
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
      rule: 'help-gap', label: `Needed help with ${plural(items.length, 'common word')} not saved`,
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
    observation: `In the ${plural(new Set(selects.map(event => event.segment)).size, 'sentence')} selected: ${words.slice(0, 12).map(entry => entry.lemmaPlain || entry.lemma).join(', ')}${words.length > 12 ? '…' : ''}`,
    interpretation: 'Exposure only: kept apart, not counted as knowing them (reading past a word isn’t understanding it)',
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
      if (Math.abs(to - from) >= 0.03) lines.push(`${word.lemma}: ${channel} ${pct(from)} → ${pct(to)} (range now ${pct(word[channel].low)}–${pct(word[channel].high)})`)
    }
  }
  return lines
}

// One word: what Mila thinks it knows (with every piece of evidence and where it came from), how
// important the word seems, and what Study's own rules say about when it comes up: three things,
// kept apart.
export function wordTrace(id: string, ctx: Context, extra: { exposure?: { read: number; texts: number }; lookedUp?: { count: number; last: number }; predictions: Prediction[] }) {
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
      evidence: word.evidence.slice(0, 40).map(item => ({ at: item.at, kind: item.kind ?? 'answer', channel: item.channel, knew: item.knew, weight: item.weight, what: item.what, dated: item.dated !== false, sessions: [...new Set((item.from ?? []).map(from => sessionOf.get(from)).filter(Boolean))] })),
    } : null,
    importance: {
      rank: entry ? look.rankOfEntry(entry) : word?.rank, rankText: rankText(entry ? look.rankOfEntry(entry) : word?.rank),
      saves: entry?.encounters?.length ?? 0, lookedUpAgain: extra.lookedUp?.count ?? 0, readTimes: extra.exposure?.read ?? 0, readTexts: extra.exposure?.texts ?? 0,
      themes: entry?.categories ?? [], register: entry?.register, level: entry?.level,
    },
    scheduling: entry ? {
      cards: cardsOfEntry(entry as LearnerEntry).map(card => ({ key: card.key, label: cardLabel(card.key), state: studyState(card.results.results ?? [], card.results.primed ?? []), results: card.results.results ?? [], last: card.results.last ?? null })),
      known: entry.known ?? [],
      lastShown: (() => { const shown = [...ctx.events].reverse().find(event => event.type === 'show' && typeof event.key === 'string' && parseCardKey(event.key).wordId === entry.id); return shown ? { at: shown.at, why: shown.why ?? null } : null })(),
    } : null,
    surprises: extra.predictions.filter(item => item.wordId === entry?.id && ((item.p >= SURE && !item.knew) || (item.p <= 1 - SURE && item.knew))),
    related: related.slice(0, 12).map(other => ({ id: other.id, lemma: other.lemmaPlain || other.lemma, why: entry?.root && other.root === entry.root ? `same root (${entry.root})` : 'one is part of the other' })),
  }
}

// How the model is doing: its predictions of recent answers against what happened and against the
// card's own history, its confident misses, and where the data itself is unsure.
export function modelChecks(predictions: Prediction[], events: Ev[], entries: InsightEntry[], unpredicted: number) {
  const loss = (p: number, knew: boolean) => -Math.log(Math.min(0.99, Math.max(0.01, knew ? p : 1 - p)))
  const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)
  const holds = events.filter(event => event.type === 'hold')
  const cardLookups = events.filter(event => event.type === 'lookup' && typeof event.key === 'string' && event.help !== 'english')
  const kept = entries.reduce((sum, entry) => sum + cardsOfEntry(entry as LearnerEntry).reduce((s, card) => s + (card.results.results?.length ?? 0), 0), 0)
  return {
    answers: predictions.length, unpredicted,
    right: predictions.filter(item => item.knew).length,
    expected: Math.round(mean(predictions.map(item => item.p)) * 100) / 100,
    loss: { model: Math.round(mean(predictions.map(item => loss(item.p, item.knew))) * 1000) / 1000, card: Math.round(mean(predictions.map(item => loss(item.cardSoFar, item.knew))) * 1000) / 1000 },
    surprises: predictions.filter(item => (item.p >= SURE && !item.knew) || (item.p <= 1 - SURE && item.knew)).sort((a, b) => b.at - a.at),
    data: [
      { label: 'Events that reached the server over an hour late', value: events.filter(event => typeof event.receivedAt === 'number' && event.receivedAt - event.at > 3_600_000).length },
      { label: 'Lookups on cards without their side recorded (taken from how the card was shown)', value: cardLookups.filter(event => !event.side).length },
      { label: 'Holds that found nothing', value: holds.filter(event => event.found === 'unknown' || event.found === 'failed').length, of: holds.length },
      { label: 'Card results kept on cards (the last few per card; older ones have no events)', value: kept },
      { label: 'Study sessions with no recorded end', value: new Set(events.filter(event => event.type === 'start').map(event => event.session)).size - new Set(events.filter(event => event.type === 'end').map(event => event.session)).size },
    ],
  }
}

export const predictionFor = (answer: Ev, word: LearnerState['words'][number] | undefined, history: { right: number; all: number }): Omit<Prediction, 'answer'> | null => {
  if (!word || typeof answer.key !== 'string') return null
  const channel = answer.quiz ? 'recognition' : channelOf(answer.front)
  const of = channel === 'either' ? { p: (word.recognition.p + word.production.p) / 2, low: Math.min(word.recognition.low, word.production.low), high: Math.max(word.recognition.high, word.production.high) } : word[channel]
  const counted = word.evidence.filter(item => item.weight > 0 && (channel === 'either' || item.channel === channel || item.channel === 'either'))
  return {
    at: answer.at, key: answer.key, wordId: parseCardKey(answer.key).wordId, lemma: word.lemma, channel, knew: !!answer.knew,
    p: of.p, low: of.low, high: of.high, prior: channel === 'production' ? word.prior.production : word.prior.recognition,
    cardSoFar: Math.round(((history.right + 1) / (history.all + 2)) * 100) / 100, cardAnswers: history.all,
    evidence: counted.slice(0, 5).map(item => `${item.what} (${day(item.at)}, weight ${Math.round(item.weight * 100) / 100})`),
  }
}

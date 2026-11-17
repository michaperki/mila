import { isListed, PREFIXES, plainWord, rankedForm, rankOf } from './frequency.ts'

// What Mila can tell of a learner's Hebrew, from what it has seen them do: a first, deliberately
// simple model, kept apart from what is decided with it (lib/profile.ts) so it can be replaced.
//
// Each word has two estimates, recognition (reading it, Hebrew first) and production (saying it,
// English first), each the chance the learner knows it, with how sure that is: a Beta
// distribution started from how common the word is and how many words the learner knows
// (`Level`), then moved by evidence. Evidence is weighed, not believed: an answer recalled
// without being primed counts fully, a primed one a quarter, a looked-up word counts against
// knowing it then, and older evidence counts less (half every EVIDENCE_HALF_LIFE days), since
// learning goes on. Answers from before Study recorded which side came first count half to each.
// A card missed after another of its words was looked up is noted against the card, with no
// weight: what made it hard isn't known. Grammar (a stage's form for a person or number, as
// cards are written: `verb:past:2sg.f`) is estimated the same way from the cards of every word,
// starting from how the learner does on cards overall. Nothing here is stored: it is worked out
// afresh from the saved words and study events, so a better model can be run on the same history.

// learner-v1.1: ranges from the Beta distribution itself (they collapsed to 0–0% near the ends),
// starting assumptions never surer than PRIOR_FLOOR, older results dated no later than they can
// have been and marked undated, and lookups without a dictionary form matched by spelling.
// learner-v1.2: a blank filled from choices counts by what it tested (answered), not as a card
// recalled from whichever side its showing had.
// learner-v1.3: help on a card shown in English. A Hebrew word given for an English word held
// (mobile lib/english-help.ts, a lookup with `help: 'english'`) counts against producing that
// word, not reading it: it wasn't there when the learner was building the sentence. It isn't
// noted against the card, and the card's own answer counts as before: the help was with another
// word, and never showed it. A word not asked for is no evidence.
// learner-v1.4: evidence says where it came from (`from`, the events; `kind`, what sort of
// observation), for Learning Insights. A Hebrew word tapped on the answer side of a card shown in
// English is noted, not counted: after turning over, a tap there is mostly checking how the
// sentence says what it says, not failing to read it. A phrase selected and explained counts for
// the expression it was explained as (before, phrase lookups were left out).
export const MODEL_VERSION = 'learner-v1.4'
export const WEIGHTS = {
  answer: 1, // an answer recalled or missed, not primed
  primed: 0.25, // the same, just after the word's Hebrew was shown (lib/forms.ts isPrimed)
  quiz: 0.6, // an answer picked from choices, by its weight above
  formCard: 0.5, // a form card's answer, for the word (the rest is the form's: grammar)
  lookup: 0.7, // the word looked up while reading (or saved from a page, before lookups were kept)
  cardLookup: 0.5, // the word looked up on a card in Study
  askedFor: 0.5, // a Hebrew word asked for from its English on a card shown in English (production)
  either: 0.5, // evidence that doesn't say which side came first, for each side
  prior: 2, // how many answers' worth the starting estimate is
  productionPrior: 0.6, // producing a word is harder than recognizing it: the prior chance, scaled
}
// A starting assumption is never taken as surer than this either way: it comes from how common a
// word is and a rough level, which say little about one word (calibration found words it put near
// 0% answered right half the time). Not fitted: a round bound on how much an assumption can claim.
export const PRIOR_FLOOR = 0.05
export const EVIDENCE_HALF_LIFE = 30 // days
const DAY = 86_400_000

export type Results = { results?: boolean[]; primed?: boolean[]; last?: number }
export type LearnerEntry = Results & {
  id: string; lemma: string; lemmaPlain?: string; gloss?: string; partOfSpeech?: string; head?: { partOfSpeech?: string }
  createdAt?: number | string; encounters?: { surface?: string; at?: number; sourceRef?: { textId: string; chunkId: string } }[]
  forms?: (Results & { key: string; stage: string; slot: string; he?: string })[]
  checkpoints?: Record<string, Results>
}
export type LearnerEvent = { session: string; seq: number; at: number; type: string } & Record<string, unknown>

// How many of the most common words the learner knows (the rank at which a word is as likely
// known as not), with a range and where it came from.
export type Level = { words: number; low: number; high: number; basis: string }
export type Channel = 'recognition' | 'production'
// `dated: false`: an older card result whose date wasn't kept; `at` is the latest it can have been.
// `kind`: an answer recorded as an event, an older card result (kept on the card, not as an event),
// help asked for on a card shown in English, a lookup, a save from a page before lookups were
// recorded, or a note (no weight). `from`: the ids of the events it comes from.
export type EvidenceKind = 'answer' | 'result' | 'help' | 'lookup' | 'save' | 'note'
export type Evidence = { at: number; channel: Channel | 'either'; knew: boolean; weight: number; what: string; uncertain?: boolean; dated?: false; kind?: EvidenceKind; from?: string[] }
// The chance known, with an 80% range, and how much evidence (in answers' worth) is behind it.
export type Estimate = { p: number; low: number; high: number; evidence: number }
// known: likely known (recognition at least 75%, and surely over 55%); acquiring: saved and being
// studied, not yet known; met: saved, not yet studied; unfamiliar: looked up, never saved. Words
// never met have no band: how common they are says how likely they are known (priorKnown).
export type Band = 'known' | 'acquiring' | 'met' | 'unfamiliar'
export type WordState = {
  key: string; lemma: string; id?: string; gloss?: string; partOfSpeech?: string; rank?: number
  // The form the rank was found for, and what the estimates started from before any evidence.
  rankForm?: string; prior: { recognition: number; production: number }
  // answers: every answer counted; datedAnswers: those recorded with their time.
  saved: boolean; answers: number; datedAnswers: number; lastAt: number
  recognition: Estimate; production: Estimate; band: Band; evidence: Evidence[]
}
export type SkillState = { key: string; label: string; estimate: Estimate; answers: number; words: string[] }
export type LearnerState = { version: string; at: number; level: Level; words: WordState[]; grammar: SkillState[]; overall: Estimate }

export const lemmaKeyOf = (lemma: string) => plainWord(lemma).replace(/[׳'"״]/g, '').replace(/[\s־-]+/g, ' ')

// The chance a word of this rank is known by a learner of this level: half at the level, about
// nine in ten at a third of it, one in ten at three times it.
export const priorKnown = (rank: number | undefined, level: Level) =>
  1 / (1 + Math.exp((Math.log(rank ?? 60000) - Math.log(level.words)) / 0.5))
// The rank below which words are most likely known (four in five).
export const commonUpTo = (level: Level) => Math.round(level.words * Math.exp(-0.5 * Math.log(4)))

const clampPrior = (p: number, floor = PRIOR_FLOOR) => Math.min(1 - floor, Math.max(floor, p))

// The regularized incomplete beta function (Numerical Recipes' continued fraction), for exact
// quantiles of the Beta distribution an estimate is.
function logGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5)
  let sum = 1.000000000190015
  for (const k of c) sum += k / ++y
  return -t + Math.log(2.5066282746310005 * sum / x)
}
function betaFraction(a: number, b: number, x: number) {
  let c = 1, d = 1 - (a + b) * x / (a + 1)
  if (Math.abs(d) < 1e-30) d = 1e-30
  d = 1 / d
  let h = d
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2))
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d; h *= d * c
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1))
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d
    const step = d * c
    h *= step
    if (Math.abs(step - 1) < 3e-10) break
  }
  return h
}
export function betaCdf(x: number, a: number, b: number) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? front * betaFraction(a, b, x) / a : 1 - front * betaFraction(b, a, 1 - x) / b
}
export function betaQuantile(q: number, a: number, b: number) {
  let lo = 0, hi = 1
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (betaCdf(mid, a, b) < q) lo = mid; else hi = mid }
  return (lo + hi) / 2
}

export function estimate(prior: number, evidence: Evidence[], channel: Channel, now: number): Estimate {
  let a = prior * WEIGHTS.prior
  let b = (1 - prior) * WEIGHTS.prior
  let total = 0
  for (const item of evidence) {
    if (item.channel !== channel && item.channel !== 'either') continue
    const weight = item.weight * (item.channel === 'either' ? WEIGHTS.either : 1) * 0.5 ** (Math.max(0, now - item.at) / (EVIDENCE_HALF_LIFE * DAY))
    if (item.knew) a += weight; else b += weight
    total += weight
  }
  const p = a / (a + b)
  const round = (x: number) => Math.round(x * 100) / 100
  return { p: round(p), low: round(betaQuantile(0.1, a, b)), high: round(betaQuantile(0.9, a, b)), evidence: round(total) }
}

// The cards of a saved word, with their kept results.
export const cardsOfEntry = (entry: LearnerEntry) => [
  { key: `${entry.id}:word`, card: { kind: 'word' } as { kind: string; stage?: string; slot?: string }, results: entry as Results },
  ...(entry.forms || []).map(form => ({ key: `${entry.id}:${form.key}`, card: { kind: 'form', stage: form.stage, slot: form.slot }, results: form as Results })),
  ...Object.entries(entry.checkpoints || {}).map(([stage, results]) => ({ key: `${entry.id}:checkpoint:${stage}`, card: { kind: 'checkpoint', stage }, results })),
]
// Each card's results from before Study recorded answers as events. A card keeps only its last few
// results and the date of the latest, so those beyond the answers recorded are older ones, and
// their date isn't known: they are dated at the latest they can have been (just before the card's
// first recorded answer, or its last date if none was recorded), and marked undated. An answer
// given while its event was still waiting on the phone would also look like one of these.
export type Earlier = { results: boolean[]; primed: boolean[]; at: number }
export function earlierResults(entries: LearnerEntry[], recordedAt: Map<string, number[]>) {
  const earlier = new Map<string, Earlier>()
  for (const entry of entries) {
    for (const { key, results } of cardsOfEntry(entry)) {
      const kept = results.results || []
      const recorded = recordedAt.get(key) ?? []
      const count = Math.max(0, kept.length - recorded.length)
      if (!count) continue
      const at = recorded.length ? Math.min(results.last ?? Infinity, Math.min(...recorded) - 60_000) : results.last ?? 0
      earlier.set(key, { results: kept.slice(0, count), primed: kept.slice(0, count).map((_, i) => !!results.primed?.[i]), at })
    }
  }
  return earlier
}
// Which saved words a written form is (by the forms each is known in: its dictionary form, the
// forms it was met in and its cards' forms), as written or, for a form that isn't a word of its
// own, without a prefix (so כלב isn't taken for כ + לב). `strict: false` tries without a prefix
// even a form that is a word of its own (בניתוח, listed, is ב + ניתוח): for a word the learner
// tapped, where a saved word inside it is the likelier reading.
export function savedFormMatcher(entries: LearnerEntry[], { strict = true } = {}) {
  const byForm = new Map<string, Set<string>>()
  for (const entry of entries) {
    const key = lemmaKeyOf(entry.lemmaPlain || entry.lemma)
    if (key.includes(' ')) continue
    for (const form of [entry.lemmaPlain, entry.lemma, ...(entry.encounters || []).map(met => met.surface), ...(entry.forms || []).map(item => item.he)]) {
      const plain = form ? lemmaKeyOf(form) : ''
      if (!plain || plain.includes(' ')) continue
      if (!byForm.has(plain)) byForm.set(plain, new Set())
      byForm.get(plain)!.add(key)
    }
  }
  return (word: string): string[] => {
    const token = lemmaKeyOf(word)
    const own = byForm.get(token)
    if (own) return [...own]
    if (strict && isListed(token)) return []
    for (const prefix of PREFIXES) {
      if (!token.startsWith(prefix) || token.length - prefix.length < 2) continue
      const found = byForm.get(token.slice(prefix.length))
      if (found) return [...found]
    }
    return []
  }
}

// Which word a card key is of, and what kind of card: `${wordId}:word`, `${wordId}:${stage}:${slot}`
// or `${wordId}:checkpoint:${stage}` (apps/mobile/src/lib/forms.ts cardKey).
export function parseCardKey(key: string) {
  const [wordId, ...rest] = key.split(':')
  if (rest[0] === 'word') return { wordId, kind: 'word' as const }
  if (rest[0] === 'checkpoint') return { wordId, kind: 'checkpoint' as const, stage: rest[1] }
  return { wordId, kind: 'form' as const, stage: rest[0], slot: rest[1] }
}
const kindOf = (entry: LearnerEntry) => {
  const pos = entry.partOfSpeech === 'expression' ? entry.head?.partOfSpeech : entry.partOfSpeech
  return pos === 'verb' || pos === 'adjective' || pos === 'noun' ? pos : 'other'
}
// Cards that show the word itself (its meanings, or the word card) rather than one of its forms.
const isWordCard = (stage?: string) => !stage || stage === 'meanings'

// `earlier`: the cards' results from before events, as lib/calibration.ts gives them for a moment
// in the past (by default worked out here, earlierResults). `priorFloor`: PRIOR_FLOOR, or 0 for
// learner-v1's unbounded assumptions (kept for comparison).
export function learnerState(entries: LearnerEntry[], events: LearnerEvent[], level: Level, now = Date.now(), { earlier: given, priorFloor = PRIOR_FLOOR }: { earlier?: Map<string, Earlier>; priorFloor?: number } = {}): LearnerState {
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const words = new Map<string, { lemma: string; entry?: LearnerEntry; evidence: Evidence[]; answers: number; dated: number; forms: string[] }>()
  const word = (lemma: string, entry?: LearnerEntry) => {
    const key = lemmaKeyOf(entry?.lemmaPlain || lemma)
    let found = words.get(key)
    if (!found) words.set(key, found = { lemma: entry?.lemmaPlain || plainWord(lemma), entry, evidence: [], answers: 0, dated: 0, forms: [] })
    if (entry && !found.entry) found.entry = entry
    return found
  }
  const skills = new Map<string, { label: string; evidence: Evidence[]; answers: number; words: Set<string> }>()
  const skill = (key: string, label: string) => {
    let found = skills.get(key)
    if (!found) skills.set(key, found = { label, evidence: [], answers: 0, words: new Set() })
    return found
  }
  const allAnswers: Evidence[] = []
  for (const entry of entries) word(entry.lemma, entry)

  // An answer: to its word (in full for its meanings and word card, half for a form card) and to
  // the form's grammar. A blank filled from choices (`tests`) says less than a recalled answer
  // (WEIGHTS.quiz), and what it says depends on what it tested: the word's meaning in context (to
  // reading it), or which of its forms the sentence needs (to the grammar only: choosing the wrong
  // form isn't not knowing the word).
  const answered = (entry: LearnerEntry, card: { kind: string; stage?: string; slot?: string }, item: Omit<Evidence, 'weight' | 'what' | 'kind'> & { primed?: boolean; quiz?: boolean; tests?: 'word' | 'form'; asked?: number }) => {
    const base = (item.primed ? WEIGHTS.primed : WEIGHTS.answer) * (item.quiz ? WEIGHTS.quiz : 1)
    const label = card.kind === 'word' ? 'word card' : card.kind === 'checkpoint' ? `${card.stage} checkpoint` : `${card.stage} ${card.slot}`
    const side = item.channel === 'production' ? 'English first' : item.channel === 'recognition' ? 'Hebrew first' : 'side not recorded'
    const what = `${item.knew ? 'knew' : 'missed'} ${label} (${side}${item.primed ? ', primed' : ''}${item.quiz ? `, choices${item.tests ? `: ${item.tests}` : ''}` : ''}${item.asked ? `, Hebrew for ${item.asked} ${item.asked === 1 ? 'word' : 'words'} around it given` : ''}${item.dated === false ? ', older result: date not kept' : ''})`
    const own = word(entry.lemma, entry)
    const undated = item.dated === false ? { dated: false as const, kind: 'result' as const } : { kind: 'answer' as const, ...(item.from ? { from: item.from } : {}) }
    if (item.tests !== 'form') own.evidence.push({ at: item.at, channel: item.channel, knew: item.knew, weight: base * (isWordCard(card.stage) && card.kind !== 'checkpoint' ? 1 : WEIGHTS.formCard), what, ...undated })
    own.answers++
    if (item.dated !== false) own.dated++
    const evidence = { at: item.at, channel: item.channel, knew: item.knew, weight: base, what: `${own.lemma}: ${what}`, ...undated }
    allAnswers.push(evidence)
    if (card.kind === 'word' || isWordCard(card.stage)) return
    const kind = kindOf(entry)
    const key = card.kind === 'checkpoint' ? `${kind}:${card.stage}:checkpoint` : `${kind}:${card.stage}:${card.slot}`
    const found = skill(key, card.kind === 'checkpoint' ? `${kind} ${card.stage}, whole tense` : `${kind} ${card.stage}, ${card.slot}`)
    found.evidence.push(evidence); found.answers++; found.words.add(own.lemma)
  }

  // Answers Study has recorded, with which side came first (from the answer, or the card's show).
  const sorted = [...events].sort((a, b) => a.at - b.at || a.seq - b.seq)
  // A changed answer replaces the one given before on the same card.
  const final = new Map<string, LearnerEvent>()
  for (const event of sorted) if (event.type === 'answer') final.set(`${event.session}:${event.position}:${event.key}`, event)
  const shownFront = new Map<string, string>()
  // The side each card was last shown first in a session, for lookups made on it.
  const cardFront = new Map<string, string>()
  const lookupFront = new Map<string, string>()
  const recordedAt = new Map<string, number[]>()
  const lookups = new Map<string, LearnerEvent>()
  const resolved = new Set<string>()
  let readerLogSince = Infinity
  for (const event of sorted) {
    if (event.type === 'show') {
      shownFront.set(`${event.session}:${event.position}`, String(event.front))
      if (typeof event.key === 'string') cardFront.set(`${event.session}:${event.key}`, String(event.front))
    }
    if (event.type === 'answer' && typeof event.key === 'string') {
      if (final.get(`${event.session}:${event.position}:${event.key}`) !== event) continue
      const card = parseCardKey(event.key)
      const entry = byId.get(card.wordId)
      if (!entry) continue
      const front = (event.front as string | undefined) ?? shownFront.get(`${event.session}:${event.position}`)
      recordedAt.set(event.key, [...(recordedAt.get(event.key) ?? []), event.at])
      const tests = event.exercise === 'choice' && (event.tests === 'word' || event.tests === 'form') ? event.tests : undefined
      const channel = tests ? 'recognition' : front === 'en' ? 'production' : front === 'he' ? 'recognition' : 'either'
      answered(entry, card, { at: event.at, knew: !!event.knew, primed: !!event.primed, quiz: !!event.quiz, channel, tests, asked: Array.isArray(event.asked) ? event.asked.length : 0, from: [String(event.id)] })
    }
    if (event.type === 'lookup') {
      // The same word tapped again in the same place within seconds (while its meaning loads) is
      // one lookup, not two.
      const again = [...lookups.values()].some(other => other.word === event.word && other.key === event.key && other.text === event.text
        && other.segment === event.segment && other.place === event.place && event.at - other.at < 10_000)
      if (again) continue
      lookups.set(String(event.id), event)
      if (typeof event.key === 'string') {
        const front = typeof event.front === 'string' ? event.front : cardFront.get(`${event.session}:${event.key}`)
        if (front) lookupFront.set(String(event.id), front)
      }
      if (event.text) readerLogSince = Math.min(readerLogSince, event.at)
      if (event.lemma && typeof event.lemma === 'string' && !event.own) { lookedUp(event, event.lemma); resolved.add(String(event.id)) }
    }
    if (event.type === 'explained' && typeof event.lemma === 'string') {
      const lookup = lookups.get(String(event.of))
      if (lookup && !resolved.has(String(lookup.id)) && !lookup.own) {
        // A phrase selected counts for the expression it was explained as.
        const phrase = lookup.phrase ? (typeof event.phrase === 'string' && event.phrase) || event.lemma : null
        // A phrase explained without a dictionary form (a stretch that isn't one) says nothing.
        if (phrase ?? event.lemma) lookedUp(lookup, phrase ?? event.lemma, phrase ? ' (a phrase selected)' : '', undefined, String(event.id))
        resolved.add(String(lookup.id))
      }
    }
  }
  // A lookup whose dictionary form never came (a card's word met only by its sentence's quick
  // meanings, or an explanation that didn't arrive) is the saved word it is spelled as, if it is
  // exactly one; otherwise it is left out.
  const spelledAs = savedFormMatcher(entries, { strict: false })
  for (const lookup of lookups.values()) {
    if (resolved.has(String(lookup.id)) || lookup.own || lookup.phrase || typeof lookup.word !== 'string') continue
    const keys = spelledAs(lookup.word)
    const entry = keys.length === 1 ? entries.find(item => lemmaKeyOf(item.lemmaPlain || item.lemma) === keys[0]) : undefined
    if (entry) lookedUp(lookup, entry.lemma, ' (word found by its spelling)', entry)
  }
  function lookedUp(event: LearnerEvent, lemma: string, how = '', known?: LearnerEntry, explained?: string) {
    const entry = known ?? [...byId.values()].find(item => lemmaKeyOf(item.lemmaPlain || item.lemma) === lemmaKeyOf(lemma))
    const onCard = typeof event.key === 'string'
    const fromEnglish = event.help === 'english'
    // Tapped on a card shown in English (its Hebrew is only on the answer side): checking, noted.
    const checking = onCard && !fromEnglish && lookupFront.get(String(event.id)) === 'en'
    const from = [String(event.id), ...(explained ? [explained] : [])]
    if (checking) {
      word(lemma, entry).evidence.push({ at: event.at, channel: 'recognition', knew: false, weight: 0, uncertain: true, kind: 'note', from, what: `tapped on the answer side of a card shown in English (${String(event.word)}): checking, not counted${how}` })
      return
    }
    word(lemma, entry).evidence.push({
      at: event.at, channel: fromEnglish ? 'production' : 'recognition', knew: false, weight: fromEnglish ? WEIGHTS.askedFor : onCard ? WEIGHTS.cardLookup : WEIGHTS.lookup,
      kind: fromEnglish ? 'help' : 'lookup', from,
      what: (fromEnglish ? `asked for on a card shown in English, for "${String(event.english ?? '')}" (${String(event.word)})` : onCard ? `looked up on a card in Study (${String(event.word)})` : `looked up while reading (${String(event.word)})`) + how,
    })
    // The card it was looked up on (after answering): noted, not counted, as what may have made
    // it hard. Help asked from the English came before the answer, and was with another word.
    if (onCard && !fromEnglish) {
      const target = byId.get(parseCardKey(event.key as string).wordId)
      if (target && lemmaKeyOf(target.lemmaPlain || target.lemma) !== lemmaKeyOf(lemma)) {
        word(target.lemma, target).evidence.push({ at: event.at, channel: 'either', knew: false, weight: 0, uncertain: true, kind: 'note', from, what: `${plainWord(lemma)} was looked up on this card: maybe why it was hard, maybe not` })
      }
    }
  }

  // What was kept before events: each card's older results (earlierResults), and each time the
  // word was saved from a page, before lookups were recorded.
  const earlier = given ?? earlierResults(entries, recordedAt)
  for (const entry of entries) {
    for (const { key, card } of cardsOfEntry(entry)) {
      const before = earlier.get(key)
      if (!before || before.at >= now) continue
      before.results.forEach((knew, i) => answered(entry, card, { at: before.at, knew, primed: before.primed[i], channel: 'either', dated: false }))
    }
    const own = word(entry.lemma, entry)
    for (const met of entry.encounters || []) {
      if ((met.at ?? 0) >= readerLogSince) continue
      own.evidence.push({ at: met.at ?? now, channel: 'recognition', knew: false, weight: WEIGHTS.lookup, kind: 'save', what: `saved from a page (${met.surface ?? ''})` })
    }
  }

  const overall = estimate(0.5, allAnswers, 'recognition', now)
  const states: WordState[] = [...words.entries()].map(([key, item]) => {
    const ranked = rankedForm(item.entry?.lemmaPlain || item.lemma, ...(item.entry?.encounters || []).map(met => met.surface), ...(item.entry?.forms || []).map(form => form.he))
    const rank = ranked?.rank
    const prior = clampPrior(priorKnown(rank, level), priorFloor)
    const productionPrior = clampPrior(priorKnown(rank, level) * WEIGHTS.productionPrior, priorFloor)
    const recognition = estimate(prior, item.evidence, 'recognition', now)
    const production = estimate(productionPrior, item.evidence, 'production', now)
    // The latest evidence with a known date (an older result's date is only a bound).
    const lastAt = Math.max(0, ...item.evidence.filter(evidence => evidence.dated !== false).map(evidence => evidence.at))
    const saved = !!item.entry
    const band: Band = recognition.p >= 0.75 && recognition.low >= 0.55 ? 'known'
      : saved && item.answers > 0 ? 'acquiring' : saved ? 'met' : 'unfamiliar'
    return {
      key, lemma: item.entry?.lemma || item.lemma, ...(item.entry ? { id: item.entry.id, gloss: item.entry.gloss, partOfSpeech: item.entry.partOfSpeech } : {}),
      ...(ranked ? { rank: ranked.rank, rankForm: ranked.form } : {}),
      prior: { recognition: Math.round(prior * 100) / 100, production: Math.round(productionPrior * 100) / 100 }, saved, answers: item.answers, datedAnswers: item.dated, lastAt, recognition, production, band,
      evidence: item.evidence.sort((a, b) => b.at - a.at),
    }
  })
  // A grammar slot starts from how the learner does on cards overall.
  const grammar: SkillState[] = [...skills.entries()].map(([key, item]) => ({
    key, label: item.label, answers: item.answers, words: [...item.words],
    estimate: estimate(overall.p, item.evidence.map(evidence => ({ ...evidence, channel: 'recognition' as const })), 'recognition', now),
  })).sort((a, b) => a.estimate.p - b.estimate.p)
  return { version: MODEL_VERSION, at: now, level, words: states, grammar, overall }
}

// A first guess at the level, before a vocabulary check: words are looked up mostly where what is
// known runs out, so the level is put at the most common quarter of the words saved from reading
// (ranged from the tenth to the half). Rough; a vocabulary check replaces it (levelFromCheck).
export function levelFromSaves(entries: LearnerEntry[]): Level {
  const ranks = entries.filter(entry => entry.encounters?.length)
    .map(entry => rankOf(entry.lemmaPlain || entry.lemma, ...(entry.encounters || []).map(met => met.surface)) ?? 60000)
    .sort((a, b) => a - b)
  if (ranks.length < 10) return { words: 2000, low: 500, high: 8000, basis: 'default (too few saved words to guess from)' }
  const at = (q: number) => ranks[Math.floor(q * (ranks.length - 1))]
  return { words: at(0.25), low: at(0.1), high: at(0.5), basis: `guessed from ${ranks.length} words saved while reading` }
}

// The level from a vocabulary check: words from across the frequency list answered known or not,
// with made-up words among them to see how often "known" is said of a word that isn't one. The
// level is the one that best explains the answers, a "known" being a word known or a guess (at
// the rate the made-up words show), and its range those that explain them nearly as well.
export function levelFromCheck(answers: { rank: number; known: boolean }[], madeUp: { known: boolean }[]): Level {
  const guess = Math.min(0.5, (madeUp.filter(item => item.known).length + 0.5) / (madeUp.length + 1))
  const likelihood = (words: number) => answers.reduce((sum, { rank, known }) => {
    const knows = priorKnown(rank, { words, low: 0, high: 0, basis: '' })
    const yes = knows + (1 - knows) * guess
    return sum + Math.log(known ? yes : 1 - yes)
  }, 0)
  const grid = Array.from({ length: 123 }, (_, i) => Math.round(100 * 1.05 ** i))
  const scored = grid.map(words => ({ words, score: likelihood(words) }))
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a))
  // About an 80% range: within 0.82 of the best log-likelihood.
  const near = scored.filter(item => item.score >= best.score - 0.82).map(item => item.words)
  return {
    words: best.words, low: Math.min(...near), high: Math.max(...near),
    basis: `vocabulary check: ${answers.filter(item => item.known).length} of ${answers.length} words known, ${madeUp.filter(item => item.known).length} of ${madeUp.length} made-up words said known`,
  }
}

import { type Card, cardKey, cardName, cardsInPlay, checkpointStages, COMMON_RANK, type Considered, dueOf, type Include, isKnownWord, isMet, mix, type Plan, planRound, ProgressRules, type Slot, spread, stateOf, studyPool } from './forms.ts'
import { HORIZON, MEMORY_VERSION, practiceNow } from './memory.ts'
import type { CardMemory, Results, VocabEntry } from './types'

// Study's shadow score (2026-11-17): what a proposed way of prioritizing would put first in each
// part of a round, beside what Study actually chose (lib/forms.ts planRound), so the two can be
// compared before the score decides anything. It never changes a round: Study's rules still
// choose; this only ranks the same candidates and says why (Learning Insights → Upcoming), and
// each round's plan logs it (practice.tsx) to be set against what happened after (insights.ts).
//
// The score is a few named parts, each between 0 and about 1, never one opaque number:
// - usefulness: how common the word is in Hebrew (frequency rank), plus a little for each time it
//   was looked up again after saving;
// - reading: how often it comes up in what was read (the saved passages, as far as read);
// - need: how likely it isn't recalled yet, from the word's own answers, smoothed so one answer
//   moves it little, with an answer just after seeing the word (primed) counted a quarter; a swipe
//   is the learner's own call, so this is weak evidence, not a measure of knowing the word;
// - timing: due today is best, long overdue still high, not due low (lib/forms.ts dueOf); for a
//   new word, how much room the reviews waiting leave; for a familiar check, how long it rested;
// - recent: first studied in the last few days, so worth meeting again in sentences over the next
//   days (the word → sentence sequence within a round stays as it is: followUps);
// - uncertainty: few answers to go by.
// score = (usefulness + reading) × timing × need + RECENT × (usefulness + reading) × recent
//         + UNSURE × uncertainty
// Learning value isn't predicting answers well: the score is a guess at where practice helps most,
// to be judged by what is remembered days later, not by how well `need` predicts the next swipe.
export const SCORE_VERSION = 'score-v0'
const RECENT = 0.3
const UNSURE = 0.15
const RECENT_DAYS = 4
const DAY = 86_400_000

export type Part = 'review' | 'early' | 'new' | 'familiar'
export type ScoreParts = { usefulness: number; reading: number; need: number; timing: number; recent: number; uncertainty: number }
// `study`: what Study did with the word in this part (chosen, its rank there, its reason);
// `scoreRank`: its place by score in the same part; `scoreWould`: within as many words as Study
// took in that part; `disagree`: the two differ.
export type Candidate = {
  wordId: string; lemma: string; part: Part; score: number; parts: ScoreParts
  terms: { core: number; recent: number; uncertainty: number }
  evidence: { answers: number; right: number; primed: number }
  notes: string[]
  study: { chosen: boolean; rank: number; why: string }
  scoreRank: number; scoreWould: boolean; disagree: 'score-only' | 'study-only' | null
}

const round2 = (x: number) => Math.round(x * 100) / 100
const usefulnessOf = (entry: VocabEntry) => Math.min(1.3, (!entry.rank ? 0.3 : entry.rank <= 1000 ? 1 : entry.rank <= COMMON_RANK ? 0.8 : entry.rank <= 10000 ? 0.5 : 0.3) + Math.min(0.3, 0.1 * (entry.lookedUp?.count ?? 0)))
const readingOf = (entry: VocabEntry) => Math.min(0.3, 0.03 * (entry.reading?.read ?? 0))
// The word's answers, as kept on its cards (the last few of each): right and all, a primed answer
// counted a quarter.
export function evidenceOf(entry: VocabEntry) {
  const records: Results[] = [entry, ...(entry.forms || [])]
  let right = 0, all = 0, answers = 0, primed = 0, knew = 0
  for (const record of records) (record.results || []).forEach((result, i) => {
    const weight = record.primed?.[i] ? 0.25 : 1
    all += weight; answers++
    if (record.primed?.[i]) primed++
    if (result) { right += weight; knew++ }
  })
  return { need: 1 - (right + 1) / (all + 2), uncertainty: 2 / (all + 2), answers, right: knew, primed }
}
const recentOf = (entry: VocabEntry, now: number) => (entry.firstStudied ? Math.max(0, 1 - (now - entry.firstStudied) / (RECENT_DAYS * DAY)) : 0)

export function scoreOf(entry: VocabEntry, part: Part, now: number, context: { backlog: number; lastSeen?: number }) {
  const evidence = evidenceOf(entry)
  const due = dueOf(entry, now)
  const timing = part === 'new' ? 1 / (1 + context.backlog / 10)
    : part === 'familiar' ? Math.min(1, (now - (context.lastSeen ?? 0)) / (2 * ProgressRules.familiarRestDays * DAY))
      : due.due ? 0.6 + 0.4 / (1 + due.overdue) : 0.2
  // A word not started has no answers: it was saved after being looked up, so most likely not known.
  const need = part === 'new' ? 0.75 : evidence.need
  const parts: ScoreParts = { usefulness: usefulnessOf(entry), reading: readingOf(entry), need, timing, recent: part === 'new' ? 0 : recentOf(entry, now), uncertainty: part === 'new' ? 1 : evidence.uncertainty }
  const value = parts.usefulness + parts.reading
  const terms = { core: value * parts.timing * parts.need, recent: RECENT * value * parts.recent, uncertainty: UNSURE * parts.uncertainty }
  const notes = [
    entry.rank ? `${entry.rank <= COMMON_RANK ? 'common' : entry.rank <= 10000 ? 'less common' : 'rare'} #${entry.rank}` : 'not ranked',
    ...(entry.lookedUp?.count ? [`looked up again ${entry.lookedUp.count}×`] : []),
    ...(entry.reading?.read ? [`read ${entry.reading.read}× in ${entry.reading.texts} ${entry.reading.texts === 1 ? 'passage' : 'passages'}`] : []),
    part === 'new' ? 'not started' : evidence.answers ? `${evidence.right} of ${evidence.answers} right${evidence.primed ? `, ${evidence.primed} primed` : ''}` : 'no answers kept',
    ...(part === 'review' || part === 'early' ? [due.due ? (due.overdue < 1 / due.days ? 'due today' : `due ${Math.round(due.overdue * due.days)}d`) : 'not due'] : []),
    ...(parts.recent > 0 ? [`new ${Math.max(0, Math.floor((now - entry.firstStudied!) / DAY))}d ago`] : []),
  ]
  return { score: round2(terms.core + terms.recent + terms.uncertainty), parts: Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, round2(value)])) as ScoreParts, terms: { core: round2(terms.core), recent: round2(terms.recent), uncertainty: round2(terms.uncertainty) }, evidence: { answers: evidence.answers, right: evidence.right, primed: evidence.primed }, notes }
}

// Every word a round considered, by part, scored and ranked beside Study's choice. New words: every
// word not started (Study's rank is its place in the order they come in). Checkpoints and a
// shuffled round aren't scored.
export function shadowRanking(plan: Plan, entries: VocabEntry[], include: Include, now = Date.now()): Candidate[] {
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const words = new Map<string, { part: Part; chosen: boolean; rank: number; why: string; lastSeen?: number }>()
  for (const item of plan.considered) {
    if (item.slot === 'checkpoint' || item.slot === 'shuffled') continue
    const id = `${item.slot}:${item.wordId}`
    const was = words.get(id)
    if (!was) words.set(id, { part: item.slot, chosen: item.chosen, rank: item.rank, why: item.why })
    else if (item.chosen && !was.chosen) words.set(id, { ...was, chosen: true, rank: Math.min(was.rank, item.rank), why: item.why })
  }
  const { unstarted } = studyPool(entries, include, now)
  unstarted.forEach((intake, i) => { if (!words.has(`new:${intake.entry.id}`)) words.set(`new:${intake.entry.id}`, { part: 'new', chosen: false, rank: i + 1, why: 'waits its turn among new words' }) })
  const backlog = plan.considered.filter(item => item.slot === 'review' && !item.chosen && item.why.startsWith('due, but')).length
  const lastSeenOf = (entry: VocabEntry) => Math.max(entry.last ?? 0, ...(entry.forms || []).map(form => form.last ?? 0))
  const scored = [...words.entries()].flatMap(([id, study]) => {
    const entry = byId.get(id.slice(study.part.length + 1))
    if (!entry) return []
    return [{ wordId: entry.id, lemma: entry.lemmaPlain || entry.lemma, part: study.part, ...scoreOf(entry, study.part, now, { backlog, lastSeen: lastSeenOf(entry) }), study: { chosen: study.chosen, rank: study.rank, why: study.why } }]
  })
  const out: Candidate[] = []
  for (const part of ['review', 'early', 'new', 'familiar'] as Part[]) {
    const inPart = scored.filter(item => item.part === part).sort((a, b) => b.score - a.score || a.study.rank - b.study.rank)
    const budget = inPart.filter(item => item.study.chosen).length
    inPart.forEach((item, i) => {
      const scoreWould = i < budget
      out.push({ ...item, scoreRank: i + 1, scoreWould, disagree: scoreWould && !item.study.chosen ? 'score-only' : !scoreWould && item.study.chosen ? 'study-only' : null })
    })
  }
  return out
}

// What a round's plan logs of the shadow score: the words either would take, and the next few by
// score, compactly (practice.tsx; read back by insights.ts to set against what happened after).
export const shadowLog = (candidates: Candidate[], unified?: Unified) => ({
  v: SCORE_VERSION,
  ...(unified ? { u: unified.activities.filter(item => item.would || item.rank <= 30).map(item => ({ id: item.wordId, k: item.kind, v: item.value, r: item.knowledge.recall, w: item.would })) } : {}),
  words: candidates.filter(item => item.study.chosen || item.scoreWould || item.scoreRank <= (candidates.filter(other => other.part === item.part && other.study.chosen).length + 5))
    .map(item => ({ id: item.wordId, p: item.part, s: item.score, n: item.parts.need, sr: item.scoreRank, r: item.study.rank, c: item.study.chosen, w: item.scoreWould })),
})

// The unified ranking (2026-11-17, unified-v0): instead of fixed parts of a round, every thing
// Study could do next as one list, by its value now. Three things kept apart for each:
// - knowledge: how likely the word is recalled now (its memory, FSRS: lib/memory.ts, in which a
//   right answer just after seeing the word counts as seeing it, not recalling it; for a word not
//   started, assumed low: it was saved after being looked up), beside its own answers' rate;
// - confidence: how much that rests on (answers kept, and how many of them have no time);
// - value: what practising it now would add to recall a month on (practiceNow), times how useful
//   the word is, per card it takes.
// Activities: a review; reinforcing a word first studied in the last few days (the same formula:
// a new memory gains most from being met again, which is why the word → sentence sequence works);
// a familiar check (a word whose answered cards are all familiar); a new word, which takes about
// three cards as it comes in, and is valued by an assumed path: about six cards to bring it from
// unknown to recalled half the time a month on. Only cards in play are practised (cardsInPlay):
// for each word its card that would gain most, or, where that is the word card of a word already
// met with a sentence card not yet answered, that sentence card (the word met again in context).
// The round is filled by value to ProgressRules.roundSize cards, one activity a word, with at least
// one new word for variety. A shadow beside Study's plan, or the plan itself when Study's order is
// set to Unified (planUnified).
export const UNIFIED_VERSION = 'unified-v0'
const NEW_KNOWN = 0.2 // a saved word not studied yet: likely not known (it was looked up)
const NEW_LEARNED = 0.6 // ...and where about NEW_CARDS cards of studying bring it, a month on
const NEW_CARDS = 6
const NEW_TAKES = 3 // cards a new word takes as it comes in (word card, meaning, present)
export type ActivityKind = 'review' | 'reinforce' | 'new' | 'check'
export type Activity = {
  wordId: string; lemma: string; kind: ActivityKind; key: string; card: string; value: number; cards: number; rank: number; would: boolean
  knowledge: { recall: number; source: 'memory' | 'assumed'; history: number | null; stability: number | null }
  confidence: { label: 'low' | 'some' | 'good'; answers: number; undated: number }
  worth: { usefulness: number; reading: number; gain: number }
  notes: string[]
  study: { taken: boolean; part: Part | null; why: string | null }
}
export type Unified = { activities: Activity[]; would: Record<ActivityKind, number>; study: Record<ActivityKind, number>; cards: number; version: string; memory: string; horizon: number }
const RECENT_FOR = RECENT_DAYS * DAY

export function unifiedRanking(plan: Plan | null, entries: VocabEntry[], include: Include, now = Date.now()): Unified {
  const { unstarted } = studyPool(entries, include, now)
  const waiting = new Set(unstarted.map(item => item.entry.id))
  const studyOf = new Map<string, { part: Part; why: string; taken: boolean }>()
  for (const item of plan?.considered ?? []) {
    if (item.slot === 'checkpoint' || item.slot === 'shuffled') continue
    const was = studyOf.get(item.wordId)
    if (!was || (item.chosen && !was.taken)) studyOf.set(item.wordId, { part: item.slot, why: item.why, taken: item.chosen })
  }
  const activities: Omit<Activity, 'rank' | 'would'>[] = []
  for (const entry of entries) {
    if (isKnownWord(entry)) continue
    const usefulness = usefulnessOf(entry), reading = readingOf(entry)
    const study = studyOf.get(entry.id)
    const base = { wordId: entry.id, lemma: entry.lemmaPlain || entry.lemma, study: { taken: !!study?.taken, part: study?.part ?? null, why: study?.why ?? null } }
    const usefulNotes = [entry.rank ? `${entry.rank <= COMMON_RANK ? 'common' : entry.rank <= 10000 ? 'less common' : 'rare'} #${entry.rank}` : 'not ranked', ...(entry.reading?.read ? [`read ${entry.reading.read}×`] : [])]
    if (waiting.has(entry.id)) {
      const first = cardsInPlay(entry, include)[0]
      if (!first) continue
      const gain = (NEW_LEARNED - NEW_KNOWN) / NEW_CARDS
      activities.push({ ...base, kind: 'new', key: cardKey(first), card: 'word card, then its sentences', value: round2((usefulness + reading) * gain), cards: NEW_TAKES,
        knowledge: { recall: NEW_KNOWN, source: 'assumed', history: null, stability: null }, confidence: { label: 'low', answers: 0, undated: 0 },
        worth: { usefulness: round2(usefulness), reading: round2(reading), gain: round2(gain) }, notes: [...usefulNotes, 'not started'] })
      continue
    }
    // Its cards in play that have a memory, the one practising would help most first.
    const inPlay = cardsInPlay(entry, include)
    const remembered = inPlay.map(card => ({ card, memory: card.form ? card.form.memory : entry.memory, results: (card.form ?? entry) as Results }))
      .filter((item): item is { card: Card; memory: CardMemory; results: Results } => !!item.memory)
    if (!remembered.length) continue
    const best = remembered.map(item => ({ ...item, ...practiceNow(item.memory, now) })).sort((a, b) => b.gain - a.gain)[0]
    // The word card of a word met: practised in a sentence it hasn't been answered on, if it has one.
    const sentence = !best.card.form && isMet(entry) ? inPlay.find(card => card.form && !card.form.results?.length) : undefined
    const card = sentence ?? best.card
    const answered = inPlay.filter(item => (item.form ?? entry).results?.length)
    const allFamiliar = answered.length > 0 && answered.every(item => stateOf((item.form ?? entry) as Results) === 'familiar')
    const kind: ActivityKind = entry.firstStudied && now - entry.firstStudied < RECENT_FOR ? 'reinforce' : allFamiliar ? 'check' : 'review'
    const evidence = evidenceOf(entry)
    const undated = remembered.reduce((sum, item) => sum + item.memory.undated, 0)
    const label = evidence.answers < 3 || undated * 2 > evidence.answers ? 'low' : evidence.answers >= 6 ? 'good' : 'some'
    activities.push({ ...base, kind, key: cardKey(card), card: `${cardName(card)}${sentence ? ', a sentence not yet answered' : ''}`, value: round2((usefulness + reading) * best.gain), cards: 1,
      knowledge: { recall: round2(best.r), source: 'memory', history: round2(1 - evidence.need), stability: round2(best.memory.s) },
      confidence: { label, answers: evidence.answers, undated },
      worth: { usefulness: round2(usefulness), reading: round2(reading), gain: round2(best.gain) },
      notes: [...usefulNotes, `recall now ${Math.round(best.r * 100)}%`, `holds ${best.memory.s < 1 ? 'under a day' : `${Math.round(best.memory.s)} days`} at 90%`, `${evidence.right} of ${evidence.answers} right`] })
  }
  const ranked = activities.sort((a, b) => b.value - a.value)
  // Fill a round by value, one activity a word, at least one new word.
  const budget = ProgressRules.roundSize
  let used = 0
  const would = new Set<string>()
  for (const item of ranked) if (used + item.cards <= budget) { would.add(item.wordId); used += item.cards }
  if (!ranked.some(item => item.kind === 'new' && would.has(item.wordId))) {
    const firstNew = ranked.find(item => item.kind === 'new')
    const lastTaken = [...ranked].reverse().filter(item => would.has(item.wordId) && item.kind !== 'new')
    if (firstNew) { let freed = 0; for (const item of lastTaken) { if (freed >= firstNew.cards) break; would.delete(item.wordId); freed += item.cards } would.add(firstNew.wordId) }
  }
  const out = ranked.map((item, i) => ({ ...item, rank: i + 1, would: would.has(item.wordId) }))
  const count = (test: (item: Activity) => boolean) => Object.fromEntries((['review', 'reinforce', 'new', 'check'] as ActivityKind[]).map(kind => [kind, out.filter(item => item.kind === kind && test(item)).length])) as Record<ActivityKind, number>
  return { activities: out, would: count(item => item.would), study: count(item => item.study.taken), cards: out.filter(item => item.would).reduce((sum, item) => sum + item.cards, 0), version: UNIFIED_VERSION, memory: MEMORY_VERSION, horizon: HORIZON }
}

// A round planned by the unified ranking (Study → Settings → Try → Plan rounds by: Unified): the
// activities it would take, in order of value, each as its card, new words as their word card (the
// word → sentence sequence follows during the round as ever: followUps) placed early, the cards of
// one word kept apart (spread), and the checkpoints Study would offer for those words after. How
// each card is asked (flashcard, fill in the blank) and which of its sentences are Study's as ever.
// Returns a Plan like planRound's, its cards' `why` saying they were chosen this way.
const KIND_WORDS: Record<ActivityKind, string> = { review: 'review', reinforce: 'reinforce: first studied lately', new: 'new word', check: 'familiar check' }
const SLOT_OF: Record<ActivityKind, Slot> = { review: 'review', reinforce: 'review', new: 'new', check: 'familiar' }
export function planUnified(entries: VocabEntry[], { include }: { include: Include }, now = Date.now()): Plan {
  const standard = planRound(entries, { include, order: 'smart' }, now)
  const unified = unifiedRanking(standard, entries, include, now)
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const cardOf = (item: Activity): Card | null => {
    const entry = byId.get(item.wordId)
    const card = entry && cardsInPlay(entry, include).find(other => cardKey(other) === item.key)
    return card ? { ...card, why: `unified · ${KIND_WORDS[item.kind]} · recall ${item.knowledge.source === 'assumed' ? 'assumed' : 'now'} ${Math.round(item.knowledge.recall * 100)}%` } : null
  }
  const taken = unified.activities.filter(item => item.would)
  const practice = taken.filter(item => item.kind !== 'new').map(cardOf).filter((card): card is Card => !!card)
  const incoming = taken.filter(item => item.kind === 'new').map(cardOf).filter((card): card is Card => !!card)
  const points = practice.flatMap(card => checkpointStages(card.entry, now).filter(() => include === 'both').map(stage => ({ entry: card.entry, form: null, checkpoint: stage, why: 'checkpoint · its stage is familiar, not yet ready' })))
  const cards = spread([...mix(practice, incoming, 0.5), ...points])
  const considered: Considered[] = unified.activities.slice(0, 80).map(item => ({
    key: item.key, wordId: item.wordId, lemma: item.lemma, card: item.card, slot: SLOT_OF[item.kind], chosen: item.would,
    why: item.would ? `${KIND_WORDS[item.kind]}: value ${item.value.toFixed(2)}` : `value ${item.value.toFixed(2)}, below what fits in a round of ${ProgressRules.roundSize} cards`,
    factors: item.notes, rank: item.rank,
  }))
  points.forEach((card, i) => considered.push({ key: cardKey(card), wordId: card.entry.id, lemma: card.entry.lemmaPlain || card.entry.lemma, card: cardName(card), slot: 'checkpoint', chosen: true, why: 'its stage is familiar, not yet ready', factors: [], rank: i + 1 }))
  return {
    cards, considered,
    budget: [
      `Unified order (experimental): ${unified.would.review} reviews, ${unified.would.reinforce} words first studied lately, ${unified.would.new} new, ${unified.would.check} familiar checks, chosen by value now`,
      `Value: what practising now would add to recall ${HORIZON} days on (memory model ${MEMORY_VERSION}), times how useful the word is`,
      `Kept as in standard Study: new words early, the word → sentence sequence as they are answered, a word’s cards kept apart, checkpoints, and how each card is asked`,
    ],
  }
}

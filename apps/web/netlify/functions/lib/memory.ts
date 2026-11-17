import { earlierResults, type LearnerEntry, type LearnerEvent } from './learner.ts'

// A memory model per card, for Study's shadow ranking and Learning Insights (2026-11-17): FSRS-5
// (the open spaced-repetition model; its published default parameters, fitted on many learners'
// reviews, since one learner's few hundred answers can't fit their own). Each card's answers are
// replayed in order: `stability` is how many days until recall would fall to 90% (how slowly the
// card is forgotten), `difficulty` 1 to 10, and recall now follows from stability and the days
// since the last answer (retrievability). A right answer is graded Good, a miss Again: a swipe is
// the learner's own call, so the model sees no shades. Answers just after seeing the word (primed)
// are same-day reviews, which FSRS-5 gives only a short-term effect.
//
// Nothing is stored: it is worked out from the evidence on every fetch (vocab.ts relevanceOf), so a
// better model, or a recalculation of every card's schedule, runs on the same history with nothing
// to migrate. Older results kept on cards from before answers were recorded (2026-11-05) have no
// time: they come from before the first recorded answer of all, so they are replayed a day apart,
// ending a day before it (not minutes before the card's own first recorded answer, which would make
// them same-day reviews), and counted in `undated`, so how much of a card's memory rests on guessed
// dates can be seen.
//
// FSRS is a model of recall over days: minutes after an answer it expects near-certain recall,
// which says nothing about a card missed again later in the same round. Its expectations are only
// compared with answers a day or more after the card's previous one (`expected` keeps `days`), and
// fairly only where that previous answer's time was recorded (`guessed`: it was an older result,
// so the gap is a guess).
// The phone recomputes recall from stability and time (mobile lib/memory.ts, kept in step).
export const MEMORY_VERSION = 'fsrs-5-default'
export const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621]
const DECAY = -0.5
const FACTOR = 19 / 81
const DAY = 86_400_000

export type Memory = { s: number; d: number; last: number; reviews: number; lapses: number; undated: number }
export const retrievability = (days: number, stability: number) => (1 + FACTOR * Math.max(0, days) / stability) ** DECAY
const clampD = (d: number) => Math.min(10, Math.max(1, d))
const initialD = (grade: number) => clampD(W[4] - Math.exp(W[5] * (grade - 1)) + 1)
// One review: the card's memory after an answer graded `grade` (1 Again, 3 Good), `days` after the
// one before.
export function review(memory: Pick<Memory, 's' | 'd'> | null, grade: 1 | 3, days: number): { s: number; d: number } {
  if (!memory) return { s: W[grade - 1], d: initialD(grade) }
  const { s, d } = memory
  const next = clampD(W[7] * initialD(4) + (1 - W[7]) * (d + (-W[6] * (grade - 3)) * (10 - d) / 9))
  if (days < 1) return { s: s * Math.exp(W[17] * (grade - 3 + W[18])), d: next }
  const r = retrievability(days, s)
  if (grade === 1) return { s: Math.min(s, W[11] * d ** -W[12] * ((s + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - r))), d: next }
  return { s: s * (Math.exp(W[8]) * (11 - d) * s ** -W[9] * (Math.exp(W[10] * (1 - r)) - 1) + 1), d: next }
}

type Review = { at: number; knew: boolean; id?: string; undated?: boolean }
// A card's reviews replayed: its memory after the last, and before each recorded answer what the
// model expected (recall then), for checking it against what happened.
export function replay(reviews: Review[]) {
  let memory: Memory | null = null
  const expected: { id: string; at: number; r: number; days: number; guessed: boolean }[] = []
  let previousUndated = false
  for (const item of [...reviews].sort((a, b) => a.at - b.at)) {
    const before = memory as Memory | null
    const days = before ? (item.at - before.last) / DAY : 0
    if (before && item.id) expected.push({ id: item.id, at: item.at, r: retrievability(days, before.s), days, guessed: previousUndated })
    previousUndated = !!item.undated
    const next = review(before, item.knew ? 3 : 1, days)
    memory = { ...next, last: item.at, reviews: (before?.reviews ?? 0) + 1, lapses: (before?.lapses ?? 0) + (item.knew ? 0 : 1), undated: (before?.undated ?? 0) + (item.undated ? 1 : 0) }
  }
  return { memory, expected }
}

// Every card's memory, by card key (`${wordId}:word`, `${wordId}:${form}`), from the recorded
// answers (a changed answer replaces the one before it) and the older results kept on cards.
export function memoriesOf(entries: LearnerEntry[], answers: LearnerEvent[]) {
  const final = new Map<string, LearnerEvent>()
  for (const answer of answers) if (answer.type === 'answer' && typeof answer.key === 'string') final.set(`${answer.session}:${answer.position}:${answer.key}`, answer)
  const byKey = new Map<string, Review[]>()
  for (const answer of final.values()) (byKey.get(answer.key as string) ?? byKey.set(answer.key as string, []).get(answer.key as string)!).push({ at: answer.at, knew: !!answer.knew, id: String(answer.id) })
  const recordedAt = new Map([...byKey].map(([key, list]) => [key, list.map(item => item.at)]))
  const firstRecorded = Math.min(...[...final.values()].map(answer => answer.at))
  for (const [key, before] of earlierResults(entries, recordedAt)) {
    const list = byKey.get(key) ?? byKey.set(key, []).get(key)!
    const end = Math.min(before.at, Number.isFinite(firstRecorded) ? firstRecorded - DAY : before.at)
    before.results.forEach((knew, i) => list.push({ at: end - (before.results.length - 1 - i) * DAY, knew, undated: true }))
  }
  const memories = new Map<string, Memory>()
  const expected = new Map<string, { r: number; days: number; guessed: boolean }>()
  for (const [key, list] of byKey) {
    const { memory, expected: made } = replay(list)
    if (memory) memories.set(key, memory)
    for (const item of made) expected.set(item.id, { r: item.r, days: item.days, guessed: item.guessed })
  }
  return { memories, expected }
}

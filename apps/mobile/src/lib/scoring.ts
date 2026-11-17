import { COMMON_RANK, dueOf, type Include, type Plan, ProgressRules, studyPool } from './forms.ts'
import type { Results, VocabEntry } from './types'

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
export const shadowLog = (candidates: Candidate[]) => ({
  v: SCORE_VERSION,
  words: candidates.filter(item => item.study.chosen || item.scoreWould || item.scoreRank <= (candidates.filter(other => other.part === item.part && other.study.chosen).length + 5))
    .map(item => ({ id: item.wordId, p: item.part, s: item.score, n: item.parts.need, sr: item.scoreRank, r: item.study.rank, c: item.study.chosen, w: item.scoreWould })),
})

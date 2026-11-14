import { learnerState, levelFromSaves, parseCardKey, type LearnerEntry, type LearnerEvent, type Level, type Results } from './learner.ts'

// Does the learner model predict how the learner answers? Each recorded answer is predicted again
// as if at the moment before it was given, from only what was known then: the words saved by then,
// with the encounters they had, the events before it, and the cards' results from before events
// were recorded, each dated no later than it can have been (lib/learner.ts keptAreEarlier). The
// model's prediction is set beside simpler ones (baselines), also using only what came before,
// and each is scored against what happened. This measures prediction, not teaching: a model can
// predict answers well and still choose badly what to study.
//
// Predictions:
// - model: the learner model, from a level guessed from the saves made by then (levelFromSaves)
// - model, check level: the same from the vocabulary check's level, which was taken later: it
//   looks ahead, and is shown only to see how much the level matters
// - frequency only: the model's starting assumption alone, with no evidence
// - overall so far: how often answers before it were right
// - card so far / word so far: how often this card's / this word's answers before it were right
// - Study's rule: how often answers were right before it on cards in the same state under
//   Study's own rule (new, learning, familiar: apps/mobile/src/lib/forms.ts cardState)
// - primed or not so far: how often primed (or unprimed) answers before it were right
// Each rate starts at one in two (one right and one wrong assumed), so none is ever 0 or 1.

export type Prediction = {
  id: string; at: number; key: string; wordId: string; lemma: string; kind: string; stage?: string
  knew: boolean; primed: boolean; sequence: boolean; front?: string
  rank?: number; savedDaysBefore?: number; cardAnswersBefore: number; wordAnswersBefore: number; encountersBefore: number
  p: Record<string, number>
}
export const PREDICTORS = ['model', 'model, check level', 'frequency only', 'overall so far', 'card so far', 'word so far', "Study's rule", 'primed or not so far']

const rate = (right: number, all: number) => (right + 1) / (all + 2)
// Study's rule for a card's state (apps/mobile/src/lib/forms.ts cardState, ProgressRules.familiarAfter 2).
export function studyState(results: boolean[], primed: boolean[]): 'new' | 'learning' | 'familiar' {
  if (!results.length) return 'new'
  const from = results.length - 2
  const latest = results.slice(-2)
  return latest.length === 2 && latest.every(Boolean) && latest.some((knew, i) => knew && !primed[from + i]) ? 'familiar' : 'learning'
}
const createdOf = (entry: LearnerEntry) => {
  const created = typeof entry.createdAt === 'string' ? Date.parse(entry.createdAt) : entry.createdAt
  return Number.isFinite(created) ? created as number : Math.min(...(entry.encounters || []).map(met => met.at ?? Infinity))
}

export function replay(entries: LearnerEntry[], events: LearnerEvent[], { checkLevel }: { checkLevel?: Level } = {}): Prediction[] {
  const sorted = [...events].sort((a, b) => a.at - b.at || a.seq - b.seq)
  const final = new Map<string, LearnerEvent>()
  for (const event of sorted) if (event.type === 'answer') final.set(`${event.session}:${event.position}:${event.key}`, event)
  const answers = sorted.filter(event => event.type === 'answer' && typeof event.key === 'string' && final.get(`${event.session}:${event.position}:${event.key}`) === event)
  const byId = new Map(entries.map(entry => [entry.id, entry]))

  // Each card's results from before events: what its kept results hold beyond the answers
  // recorded, dated at the latest they can have been.
  type Earlier = { results: boolean[]; primed: boolean[]; at: number }
  const recordedOf = new Map<string, LearnerEvent[]>()
  for (const answer of answers) { const key = answer.key as string; if (!recordedOf.has(key)) recordedOf.set(key, []); recordedOf.get(key)!.push(answer) }
  const earlier = new Map<string, Earlier>()
  const cardsOf = (entry: LearnerEntry) => [
    { key: `${entry.id}:word`, results: entry as Results },
    ...(entry.forms || []).map(form => ({ key: `${entry.id}:${form.key}`, results: form as Results })),
    ...Object.entries(entry.checkpoints || {}).map(([stage, results]) => ({ key: `${entry.id}:checkpoint:${stage}`, results })),
  ]
  for (const entry of entries) {
    for (const { key, results } of cardsOf(entry)) {
      const kept = results.results || []
      const recorded = recordedOf.get(key) ?? []
      const count = Math.max(0, kept.length - recorded.length)
      if (!count) continue
      const at = recorded.length ? Math.min(results.last ?? Infinity, recorded[0].at - 60_000) : results.last ?? 0
      earlier.set(key, { results: kept.slice(0, count), primed: kept.slice(0, count).map((_, i) => !!results.primed?.[i]), at })
    }
  }
  const asOf = (t: number) => entries.filter(entry => !(createdOf(entry) > t)).map(entry => {
    const keep = (key: string, results: Results): Results => {
      const before = earlier.get(key)
      return before && before.at < t ? { results: before.results, primed: before.primed, last: before.at } : { results: [], primed: [], last: undefined }
    }
    return {
      ...entry, ...keep(`${entry.id}:word`, entry),
      encounters: (entry.encounters || []).filter(met => (met.at ?? 0) < t),
      forms: (entry.forms || []).map(form => ({ ...form, ...keep(`${entry.id}:${form.key}`, form) })),
      checkpoints: Object.fromEntries(Object.entries(entry.checkpoints || {}).map(([stage, results]) => [stage, keep(`${entry.id}:checkpoint:${stage}`, results)])),
    }
  })

  const predictions: Prediction[] = []
  for (const answer of answers) {
    const t = answer.at
    const key = answer.key as string
    const card = parseCardKey(key)
    const entry = byId.get(card.wordId)
    if (!entry) continue
    // Every answer known before this one, with its card, word and Study state then.
    const past: { key: string; wordId: string; knew: boolean; primed: boolean; state: string }[] = []
    const history = new Map<string, { results: boolean[]; primed: boolean[] }>()
    const timeline: { at: number; key: string; knew: boolean; primed: boolean }[] = []
    for (const [cardKey, before] of earlier) if (before.at < t) before.results.forEach((knew, i) => timeline.push({ at: before.at, key: cardKey, knew, primed: before.primed[i] }))
    for (const other of answers) if (other.at < t) timeline.push({ at: other.at, key: other.key as string, knew: !!other.knew, primed: !!other.primed })
    timeline.sort((a, b) => a.at - b.at)
    for (const item of timeline) {
      const own = history.get(item.key) ?? { results: [], primed: [] }
      past.push({ key: item.key, wordId: parseCardKey(item.key).wordId, knew: item.knew, primed: item.primed, state: studyState(own.results, own.primed) })
      history.set(item.key, { results: [...own.results, item.knew], primed: [...own.primed, item.primed] })
    }
    const mine = history.get(key) ?? { results: [], primed: [] }
    const state = studyState(mine.results, mine.primed)
    const count = (list: typeof past) => rate(list.filter(item => item.knew).length, list.length)

    const entriesThen = asOf(t)
    const eventsThen = sorted.filter(event => event.at < t)
    const channel = (word: { recognition: { p: number }; production: { p: number } }) =>
      answer.front === 'en' ? word.production.p : answer.front === 'he' ? word.recognition.p : (word.recognition.p + word.production.p) / 2
    const modelAt = (level: Level) => {
      const word = learnerState(entriesThen, eventsThen, level, t, { keptAreEarlier: true }).words.find(item => item.id === entry.id)
      return word ? { p: channel(word), prior: answer.front === 'en' ? word.prior.production : answer.front === 'he' ? word.prior.recognition : (word.prior.recognition + word.prior.production) / 2, rank: word.rank } : null
    }
    const model = modelAt(levelFromSaves(entriesThen))
    const checked = checkLevel ? modelAt(checkLevel) : null
    const created = createdOf(entry)
    predictions.push({
      id: String(answer.id), at: t, key, wordId: entry.id, lemma: entry.lemmaPlain || entry.lemma, kind: card.kind, stage: 'stage' in card ? card.stage : undefined,
      knew: !!answer.knew, primed: !!answer.primed, sequence: !!answer.sequence, ...(answer.front ? { front: String(answer.front) } : {}),
      ...(model?.rank ? { rank: model.rank } : {}), ...(Number.isFinite(created) ? { savedDaysBefore: Math.round((t - created) / 864e5 * 10) / 10 } : {}),
      cardAnswersBefore: mine.results.length, wordAnswersBefore: past.filter(item => item.wordId === entry.id).length,
      encountersBefore: (entry.encounters || []).filter(met => (met.at ?? 0) < t).length,
      p: {
        model: model?.p ?? 0.5,
        ...(checked ? { 'model, check level': checked.p } : {}),
        'frequency only': model?.prior ?? 0.5,
        'overall so far': count(past),
        'card so far': rate(mine.results.filter(Boolean).length, mine.results.length),
        'word so far': count(past.filter(item => item.wordId === entry.id)),
        "Study's rule": count(past.filter(item => item.state === state)),
        'primed or not so far': count(past.filter(item => item.primed === !!answer.primed)),
      },
    })
  }
  return predictions
}

// How well one predictor did: log loss (lower is better; always saying one in two scores 0.693),
// Brier score (lower is better; 0.25 for one in two), how well it ranks right answers above wrong
// ones (AUC: 0.5 is chance), its average prediction against how often answers were right, and
// 80% ranges for the log loss and for its difference from `against`, by resampling the answers.
export type Score = {
  name: string; n: number; logLoss: number; brier: number; auc: number | null; meanP: number; observed: number
  logLossRange: [number, number]; vsBaseline?: { name: string; diff: number; range: [number, number]; better: number }
  bins: { from: number; to: number; n: number; meanP: number; observed: number }[]
}
const clip = (p: number) => Math.min(0.99, Math.max(0.01, p))
const logLoss = (list: { p: number; y: boolean }[]) => list.reduce((s, { p, y }) => s - Math.log(y ? clip(p) : 1 - clip(p)), 0) / list.length
const brier = (list: { p: number; y: boolean }[]) => list.reduce((s, { p, y }) => s + (p - (y ? 1 : 0)) ** 2, 0) / list.length
function auc(list: { p: number; y: boolean }[]) {
  const pos = list.filter(item => item.y), neg = list.filter(item => !item.y)
  if (!pos.length || !neg.length) return null
  let wins = 0
  for (const a of pos) for (const b of neg) wins += a.p > b.p ? 1 : a.p === b.p ? 0.5 : 0
  return wins / (pos.length * neg.length)
}
const quantile = (values: number[], q: number) => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(q * (s.length - 1))] }

export function score(predictions: Prediction[], name: string, against = 'overall so far', resamples = 1000): Score {
  const list = predictions.filter(item => name in item.p).map(item => ({ p: item.p[name], y: item.knew, base: item.p[against] }))
  let seed = 11
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const losses: number[] = [], diffs: number[] = []
  for (let r = 0; r < resamples && list.length; r++) {
    const sample = list.map(() => list[Math.floor(random() * list.length)])
    const own = logLoss(sample)
    losses.push(own)
    diffs.push(own - logLoss(sample.map(item => ({ p: item.base, y: item.y }))))
  }
  const edges = [0, 0.2, 0.4, 0.6, 0.8, 1.0001]
  const bins = edges.slice(0, -1).map((from, i) => {
    const inBin = list.filter(item => item.p >= from && item.p < edges[i + 1])
    return { from, to: Math.min(1, edges[i + 1]), n: inBin.length, meanP: inBin.length ? inBin.reduce((s, item) => s + item.p, 0) / inBin.length : 0, observed: inBin.length ? inBin.filter(item => item.y).length / inBin.length : 0 }
  })
  const round = (x: number) => Math.round(x * 1000) / 1000
  return {
    name, n: list.length, logLoss: round(logLoss(list)), brier: round(brier(list)), auc: auc(list) === null ? null : round(auc(list)!),
    meanP: round(list.reduce((s, item) => s + item.p, 0) / list.length), observed: round(list.filter(item => item.y).length / list.length),
    logLossRange: [round(quantile(losses, 0.1)), round(quantile(losses, 0.9))],
    ...(name !== against ? { vsBaseline: { name: against, diff: round(logLoss(list) - logLoss(list.map(item => ({ p: item.base, y: item.y })))), range: [round(quantile(diffs, 0.1)), round(quantile(diffs, 0.9))] as [number, number], better: round(diffs.filter(d => d < 0).length / diffs.length) } } : {}),
    bins,
  }
}

// The scores of every predictor on part of the answers (all, primed, by card kind…).
export function scoreBy(predictions: Prediction[], groups: Record<string, (item: Prediction) => boolean>) {
  return Object.entries(groups).map(([group, test]) => {
    const part = predictions.filter(test)
    return { group, n: part.length, right: part.filter(item => item.knew).length, scores: part.length >= 5 ? PREDICTORS.filter(name => part.some(item => name in item.p)).map(name => score(part, name, 'overall so far', 300)) : [] }
  })
}

// Exploratory: answers split by a feature, to see what goes with knowing (not what causes it).
export function splitBy(predictions: Prediction[], label: string, of: (item: Prediction) => string | null) {
  const groups = new Map<string, Prediction[]>()
  for (const item of predictions) { const key = of(item); if (key === null) continue; if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(item) }
  return { label, groups: [...groups.entries()].map(([value, list]) => ({ value, n: list.length, right: list.filter(item => item.knew).length, meanModel: Math.round(list.reduce((s, item) => s + item.p.model, 0) / list.length * 100) / 100 })) }
}


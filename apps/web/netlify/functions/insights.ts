import type { Handler } from '@netlify/functions'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { getDb } from './lib/mongo'
import { isAdmin } from './lib/ai-usage'
import { earlierResults, learnerState, lemmaKeyOf, levelFromSaves, MODEL_VERSION, type LearnerEntry, type LearnerState } from './lib/learner'
import { readingExposure } from './lib/exposure'
import { relevanceOf } from './lib/relevance'
import { finalAnswers, INSIGHTS_VERSION, modelChecks, predictionFor, sessionsOf, sessionStory, wordTrace, type Context, type Ev, type InsightEntry, type Prediction, type TextDoc } from './lib/insights'

// Learning Insights for the developers (ADMIN_EMAILS, as Account → AI spend): their own study and
// reading as Mila saw and read it (lib/insights.ts). Read-only, but for the model's predictions of
// answers, which take a while to work out and are kept per model version (insightPredictions).
// GET                  the sessions of the last `days` (30)
// GET ?session=<id>    one session, told event by event
// GET ?word=<id>       one word: knowledge, importance and scheduling, with the evidence
// GET ?checks=1        the model's predictions of recent answers against what happened
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
const DAY = 86_400_000
// Time to spend working out predictions not yet kept, in one request; the rest come next time.
const BUDGET_MS = 4000
const VERSION = `${MODEL_VERSION}/${INSIGHTS_VERSION}`
let indexReady: Promise<unknown> | null = null

const createdOf = (entry: LearnerEntry) => {
  const created = typeof entry.createdAt === 'string' ? Date.parse(entry.createdAt) : entry.createdAt
  return Number.isFinite(created) ? created as number : Math.min(...(entry.encounters || []).map(met => met.at ?? Infinity))
}

export const handler: Handler = async (event) => {
  const requestId = randomUUID()
  if (event.httpMethod !== 'GET') return reply(405, { message: 'Use GET.' })
  try {
    const auth = verifyAuth(event)
    if (!isAdmin(auth.email)) return reply(403, { message: 'Not available.' })
    const query = event.queryStringParameters ?? {}
    const db = await getDb()
    const now = Date.now()
    const [entries, events, texts] = await Promise.all([
      db.collection('vocab').find({ userId: auth.userId }).project<InsightEntry>({ _id: 0, userId: 0, 'encounters.analysis': 0, 'forms.glosses': 0, 'forms.cues': 0, 'forms.variants.glosses': 0, 'forms.variants.cues': 0 }).toArray(),
      db.collection('studyEvents').find({ userId: auth.userId }).project<Ev>({ _id: 0, userId: 0 }).sort({ at: 1, seq: 1 }).toArray(),
      db.collection('texts').find({ userId: auth.userId }).project<TextDoc>({ _id: 0, id: 1, textId: 1, title: 1, 'chunks.text': 1 }).toArray(),
    ])
    const textsById = new Map(texts.map(text => [text.textId || text.id || '', text]))
    const learnerEntries = entries as unknown as LearnerEntry[]

    if (!query.session && !query.word && !query.checks) {
      const days = Math.min(365, Number(query.days) || 30)
      const sessions = sessionsOf(events, textsById, now).filter(item => item.end > now - days * DAY)
      return reply(200, { version: VERSION, days, sessions, events: events.length, lastEventAt: events[events.length - 1]?.at ?? null })
    }

    // The model as it stood at a moment: the words saved by then, the events before it, and the
    // cards' results from before events (dated from every answer recorded, as calibration does).
    const answers = finalAnswers(events)
    const recordedAt = new Map<string, number[]>()
    for (const answer of answers) recordedAt.set(answer.key as string, [...(recordedAt.get(answer.key as string) ?? []), answer.at])
    const earlier = earlierResults(learnerEntries, recordedAt)
    const states = new Map<number, LearnerState>()
    const stateAt = (at: number) => {
      if (!states.has(at)) {
        const then = learnerEntries.filter(entry => !(createdOf(entry) > at)).map(entry => ({ ...entry, encounters: (entry.encounters || []).filter(met => (met.at ?? 0) < at) }))
        states.set(at, learnerState(then, events.filter(item => item.at < at), levelFromSaves(then), at, { earlier }))
      }
      return states.get(at)!
    }
    const ordered = [...answers].sort((a, b) => a.at - b.at)
    const predictNow = (answer: Ev): Prediction | null => {
      const entry = learnerEntries.find(item => item.id === String(answer.key).split(':')[0])
      if (!entry) return null
      const word = stateAt(answer.at).words.find(item => item.id === entry.id)
      const before = ordered.filter(other => other.key === answer.key && other.at < answer.at)
      const kept = earlier.get(answer.key as string)
      const right = before.filter(other => other.knew).length + (kept && kept.at < answer.at ? kept.results.filter(Boolean).length : 0)
      const all = before.length + (kept && kept.at < answer.at ? kept.results.length : 0)
      const made = predictionFor(answer, word, { right, all })
      return made ? { answer: answer.id, ...made } : null
    }
    // Kept predictions, worked out for the answers asked for (within the time budget).
    const cache = db.collection('insightPredictions')
    indexReady ??= cache.createIndex({ userId: 1, version: 1, answer: 1 }, { unique: true }).catch(error => { indexReady = null; throw error })
    await indexReady
    const predictions = async (wanted: Ev[]) => {
      const kept = new Map((await cache.find({ userId: auth.userId, version: VERSION, answer: { $in: wanted.map(item => item.id) } }).project<{ prediction: Prediction | null; answer: string }>({ _id: 0, prediction: 1, answer: 1 }).toArray()).map(item => [item.answer, item.prediction]))
      const started = Date.now()
      const fresh: { answer: string; prediction: Prediction | null }[] = []
      for (const answer of wanted) {
        if (kept.has(answer.id) || Date.now() - started > BUDGET_MS) continue
        const prediction = predictNow(answer)
        kept.set(answer.id, prediction); fresh.push({ answer: answer.id, prediction })
      }
      if (fresh.length) await cache.bulkWrite(fresh.map(item => ({ updateOne: { filter: { userId: auth.userId, version: VERSION, answer: item.answer }, update: { $set: { prediction: item.prediction, at: now } }, upsert: true } })), { ordered: false })
      return { kept, missing: wanted.filter(item => !kept.has(item.id)).length }
    }

    if (query.session) {
      // One session, or reading sessions on the same passage told as one (ids joined by +).
      const ids = new Set(query.session.split('+'))
      const mine = ordered.filter(answer => ids.has(answer.session))
      const { kept } = await predictions(mine)
      const ctx: Context = { events, entries, texts: textsById, now, stateAt, predict: answer => kept.get(answer.id) ?? null }
      const story = sessionStory(query.session, ctx)
      return story ? reply(200, { version: VERSION, ...story }) : reply(404, { message: 'No such session.' })
    }
    if (query.word) {
      const id = query.word
      const entry = entries.find(item => item.id === id)
      const mine = ordered.filter(answer => String(answer.key).split(':')[0] === id)
      const { kept } = await predictions(mine)
      const ctx: Context = { events, entries, texts: textsById, now, stateAt, predict: answer => kept.get(answer.id) ?? null }
      const key = lemmaKeyOf(entry ? entry.lemmaPlain || entry.lemma : id)
      const exposure = readingExposure(texts as never, learnerEntries).words.get(key)
      const lookedUp = entry ? (relevanceOf([entry], events.filter(item => item.type === 'lookup' || item.type === 'explained')) as { lookedUp?: { count: number; last: number } }[])[0]?.lookedUp : undefined
      const trace = wordTrace(id, ctx, { exposure, lookedUp, predictions: [...kept.values()].filter((item): item is Prediction => !!item) })
      return trace ? reply(200, { version: VERSION, ...trace }) : reply(404, { message: 'No such word.' })
    }
    const days = Math.min(365, Number(query.days) || 30)
    const recent = ordered.filter(answer => answer.at > now - days * DAY)
    const { kept, missing } = await predictions(recent)
    const made = recent.map(answer => kept.get(answer.id)).filter((item): item is Prediction => !!item)
    return reply(200, { version: VERSION, days, ...modelChecks(made, events, entries, missing) })
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    console.error('Insights failed', { requestId, name: (error as Error).name, message: (error as Error).message })
    return reply(503, { message: 'Insights are unavailable right now.', requestId })
  }
}

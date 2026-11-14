// The Learner Intelligence Dashboard: one HTML page showing what Mila has observed of a learner,
// what it derives from that, and what the learner model (lib/learner.ts) estimates, kept apart so
// each estimate can be traced to its evidence and its assumptions. Runs from apps/web:
//
//   node --experimental-strip-types scripts/learner-dashboard.mjs [--user <id>]
//
// Writes scripts/eval-out/personalize/dashboard.html (open it in a browser; it needs no server).
// Read-only and free: no AI calls, nothing written to the database. The level comes from the
// vocabulary check if one was scored (scripts/personalize.mjs level score), else from the saves.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'
import { readingExposure } from '../netlify/functions/lib/exposure.ts'
import { PREDICTORS, replay, score, scoreBy, splitBy } from '../netlify/functions/lib/calibration.ts'
import { commonUpTo, EVIDENCE_HALF_LIFE, learnerState, levelFromSaves, MODEL_VERSION, parseCardKey, WEIGHTS, lemmaKeyOf } from '../netlify/functions/lib/learner.ts'

const envFile = [new URL('../.env', import.meta.url), new URL('../../../.env', import.meta.url)].find(url => existsSync(url) && /MONGODB_URI=/.test(readFileSync(url, 'utf8')))
const env = Object.fromEntries(readFileSync(envFile, 'utf8').split('\n')
  .map(line => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]))
const arg = name => { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1] }
const out = new URL('./eval-out/personalize/', import.meta.url)
mkdirSync(out, { recursive: true })
const kept = name => (existsSync(new URL(name, out)) ? JSON.parse(readFileSync(new URL(name, out), 'utf8')) : null)

const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
try {
  const db = client.db(env.MONGODB_DB_NAME || 'mila')
  const userId = arg('--user') ?? (await db.collection('vocab').aggregate([{ $group: { _id: '$userId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 }]).toArray())[0]?._id
  const entries = await db.collection('vocab').find({ userId }).project({ _id: 0, userId: 0, 'encounters.analysis': 0, 'forms.glosses': 0, 'forms.cues': 0 }).toArray()
  const events = await db.collection('studyEvents').find({ userId }).project({ _id: 0, userId: 0 }).sort({ at: 1 }).toArray()
  const texts = await db.collection('texts').find({ userId }).project({ _id: 0, id: 1, textId: 1, title: 1, chunks: 1, furthestSegment: 1, lastSegment: 1 }).toArray()
  const now = Date.now()
  const level = kept('level.json') ?? levelFromSaves(entries)
  const state = learnerState(entries, events, level, now)
  const exposure = readingExposure(texts, entries)

  // Raw observations, by word: answers by card key, lookups by the word they turned out to be
  // (from the card or the explanation), saves by entry id.
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const keyOfId = id => { const entry = byId.get(id); return entry ? lemmaKeyOf(entry.lemmaPlain || entry.lemma) : null }
  const observed = new Map()
  const note = (key, event) => { if (!key) return; if (!observed.has(key)) observed.set(key, []); observed.get(key).push(event) }
  const explainedOf = new Map(events.filter(event => event.type === 'explained').map(event => [event.of, event]))
  const slim = ({ session: _session, seq: _seq, receivedAt: _received, app: _app, ...event }) => event
  for (const event of events) {
    if (['show', 'reveal', 'answer'].includes(event.type) && event.key) note(keyOfId(parseCardKey(event.key).wordId), slim(event))
    if (event.type === 'lookup') {
      const lemma = event.lemma || explainedOf.get(event.id)?.lemma
      note(lemma ? lemmaKeyOf(lemma) : null, slim({ ...event, ...(explainedOf.get(event.id) ? { explained: slim(explainedOf.get(event.id)) } : {}) }))
      if (event.key) note(keyOfId(parseCardKey(event.key).wordId), slim({ ...event, type: 'lookup on this card', lemma }))
    }
    if (event.type === 'save' || event.type === 'unsave') note(keyOfId(event.id), slim(event))
  }

  const words = state.words.map(word => {
    const entry = word.id ? byId.get(word.id) : null
    const seen = exposure.words.get(word.key)
    return {
      ...word,
      ...(entry ? {
        root: entry.root, binyan: entry.binyan, createdAt: typeof entry.createdAt === 'string' ? Date.parse(entry.createdAt) : entry.createdAt,
        encounters: (entry.encounters || []).map(met => ({ surface: met.surface, context: met.context, meaning: met.meaning, at: met.at })),
        cards: [
          ...(entry.results?.length ? [{ key: 'word', stage: 'word card', slot: '', he: entry.lemma, results: entry.results, primed: entry.primed, last: entry.last }] : []),
          ...(entry.forms || []).map(form => ({ key: form.key, stage: form.stage, slot: form.slot, he: form.he, sentence: form.sentence, results: form.results, primed: form.primed, last: form.last, usage: form.usage })),
        ],
      } : {}),
      exposure: seen ? { total: seen.total, read: seen.read, texts: seen.texts, forms: seen.forms } : null,
      observed: observed.get(word.key) ?? [],
    }
  })

  // The dataset: what is recorded, how much, since when, and how complete.
  const types = {}
  for (const event of events) {
    const type = (types[event.type] ??= { count: 0, first: event.at, last: event.at, days: new Set() })
    type.count++; type.first = Math.min(type.first, event.at); type.last = Math.max(type.last, event.at); type.days.add(new Date(event.at).toISOString().slice(0, 10))
  }
  const answers = events.filter(event => event.type === 'answer')
  const lookups = events.filter(event => event.type === 'lookup')
  const perDay = {}
  for (const event of events) { const day = new Date(event.at).toISOString().slice(0, 10); (perDay[day] ??= {})[event.type] = (perDay[day][event.type] ?? 0) + 1 }
  const keptResults = entries.reduce((sum, entry) => sum + (entry.results?.length ?? 0) + (entry.forms || []).reduce((s, form) => s + (form.results?.length ?? 0), 0), 0)
  const dataset = {
    types: Object.fromEntries(Object.entries(types).map(([type, item]) => [type, { ...item, days: item.days.size }])),
    perDay,
    sessions: new Set(events.map(event => event.session)).size,
    checks: {
      answers: answers.length,
      answersWithSide: answers.filter(event => event.front).length,
      lastAnswerWithoutSide: Math.max(0, ...answers.filter(event => !event.front).map(event => event.at)),
      firstAnswerWithSide: Math.min(...answers.filter(event => event.front).map(event => event.at), Infinity),
      lookups: lookups.length, readerLookups: lookups.filter(event => event.text).length, cardLookups: lookups.filter(event => event.key).length,
      explained: events.filter(event => event.type === 'explained').length,
      explainedLinked: events.filter(event => event.type === 'explained' && lookups.some(lookup => lookup.id === event.of)).length,
      selects: (types.select?.count ?? 0), reads: (types.read?.count ?? 0), saves: (types.save?.count ?? 0),
      keptResults, savedWords: entries.length, encounters: entries.reduce((sum, entry) => sum + (entry.encounters?.length ?? 0), 0),
      texts: exposure.texts, duplicates: exposure.duplicates, withoutProgress: exposure.withoutProgress, tokens: exposure.tokens, readTokens: exposure.readTokens,
    },
  }
  const levelCheck = (() => {
    const items = kept('level-items.json')
    if (!items || !existsSync(new URL('level-check.md', out))) return null
    const marks = readFileSync(new URL('level-check.md', out), 'utf8').split('\n').map(line => line.match(/^\s*(\d+)\.\s*\[(.)\]/)).filter(Boolean)
    return items.map((item, i) => ({ ...item, mark: marks[i]?.[2] ?? ' ' }))
  })()

  // Calibration: every answer predicted again from what was known just before it (lib/calibration.ts).
  const checkLevel = kept('level.json')
  const predictions = replay(entries, events, checkLevel ? { checkLevel } : {})
  const keyOfPrediction = item => keyOfId(item.wordId)
  const readCount = item => exposure.words.get(keyOfPrediction(item))?.read ?? 0
  const calibration = {
    n: predictions.length, right: predictions.filter(item => item.knew).length,
    first: Math.min(...predictions.map(item => item.at)), last: Math.max(...predictions.map(item => item.at)),
    scores: PREDICTORS.filter(name => predictions.some(item => name in item.p)).map(name => score(predictions, name)),
    groups: scoreBy(predictions, {
      'not primed': item => !item.primed, primed: item => item.primed,
      'word card': item => item.kind === 'word', 'meanings card': item => item.stage === 'meanings', 'form card': item => item.kind !== 'word' && item.stage !== 'meanings',
      "card's first answer": item => item.cardAnswersBefore === 0, 'card answered before': item => item.cardAnswersBefore > 0,
      'English first': item => item.front === 'en', 'Hebrew first': item => item.front === 'he',
    }),
    splits: [
      splitBy(predictions, 'Rank of the word in spoken Hebrew', item => (item.rank == null ? 'not listed' : item.rank <= 1000 ? '1–1,000' : item.rank <= 5000 ? '1,001–5,000' : 'over 5,000')),
      splitBy(predictions, 'Times read in your passages (today\'s count: looks ahead)', item => { const n = readCount(item); return n === 0 ? 'none found' : n === 1 ? 'once' : n <= 3 ? '2–3' : '4+' }),
      splitBy(predictions, 'Days since the word was saved', item => (item.savedDaysBefore == null ? null : item.savedDaysBefore < 7 ? 'under a week' : item.savedDaysBefore < 21 ? '1–3 weeks' : '3+ weeks')),
      splitBy(predictions, 'Primed (just saw the Hebrew)', item => (item.primed ? 'primed' : 'not primed')),
      splitBy(predictions, 'In a learning sequence', item => (item.sequence ? 'in sequence' : 'on its own')),
      splitBy(predictions, 'Answers on this card before', item => (item.cardAnswersBefore === 0 ? 'none' : item.cardAnswersBefore === 1 ? 'one' : 'two or more')),
    ],
    answers: predictions.map(item => ({ at: item.at, lemma: item.lemma, key: keyOfPrediction(item), kind: item.kind, stage: item.stage, knew: item.knew, primed: item.primed, p: item.p })),
  }

  const data = {
    generated: now, version: MODEL_VERSION, level, commonUpTo: commonUpTo(level), weights: WEIGHTS, halfLife: EVIDENCE_HALF_LIFE,
    overall: state.overall, grammar: state.grammar, words, dataset, levelCheck,
    unmatched: exposure.unmatched.slice(0, 80), textsCount: exposure.texts, calibration,
  }
  const template = readFileSync(new URL('./learner-dashboard.html', import.meta.url), 'utf8')
  const html = template.replace('__DATA__', JSON.stringify(data).replace(/</g, '\\u003c'))
  writeFileSync(new URL('dashboard.html', out), html)
  console.log(`Wrote ${new URL('dashboard.html', out).pathname} (${Math.round(html.length / 1024)} KB): ${words.length} words, ${events.length} events, ${exposure.texts} passages (${exposure.duplicates} saved twice, counted once).`)
} finally { await client.close() }

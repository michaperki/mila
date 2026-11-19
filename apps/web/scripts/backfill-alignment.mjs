// One-off (STUDY-4, approved by Mike 2026-11-16 at about $0.50–1): which English words each Hebrew
// word of a card's sentence says, for the cards being studied now, so holding an English word on
// them (mobile lib/english-help.ts) needs no request. Cards written since 2026-11-16 have it from
// the writer (glosses `t`); this gives it to the older ones in use: answered in the last 30 days
// or shown in the last 14, each with its new sentences. Not the rest of the collection.
//
// `node scripts/backfill-alignment.mjs <email>`: what it would do, and an estimate (no calls).
// `... <email> --run`: asks through the Message Batches API (half price), as the app's
// sentence-glosses asks it with a card's English, then writes `t` onto each sentence's glosses
// (or, for a sentence without glosses, glosses with its quick meanings and `t`, its own word
// left out, as the writer leaves it out). Only where `t` is missing; every paid request is
// recorded in aiUsage; what each sentence had before is kept in a file beside this one.
import { readFileSync, writeFileSync } from 'fs'
import { MongoClient } from 'mongodb'

// Paid calls without the enforced cap (lib/spend.mjs, 2026-11-19): it refuses to run until it is
// moved onto cappedBatch (or a hard cap like it), so no run can cost more than was approved.
console.log('This script predates enforced spending caps: move it onto scripts/lib/spend.mjs cappedBatch before running it again.'); process.exit(1)

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const [email, flag] = process.argv.slice(2)
if (!email) { console.log('Usage: node scripts/backfill-alignment.mjs <email> [--run]'); process.exit(1) }
const DAY = 86_400_000, now = Date.now()
const MODEL = 'claude-opus-5-5', PRICE = { input: 4, output: 20 }, BATCH = 0.5

// As sentence-glosses.ts asks it (SYSTEM, the schema with inTranslation, the message).
const SYSTEM = 'You help an English-speaking learner read modern Hebrew. Given a sentence and its numbered words, give each word\'s meaning as used in this sentence, briefly and in plain English. The text may come from OCR; read a misrecognized word as the word that is most likely printed.'
const schema = { type: 'object', additionalProperties: false, required: ['meanings'], properties: { meanings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'meaning', 'inTranslation'], properties: {
  n: { type: 'integer', description: 'The word\'s number.' },
  meaning: { type: 'string', description: 'Its meaning in this sentence in 1 to 4 English words, including attached prefixes and suffixes ("and in the house", "his"). For a word that is part of an expression, its meaning within the expression.' },
  inTranslation: { type: 'string', description: 'The words of the English translation that say this word, copied exactly from it and in its order ("quietly", "to him"), or "" if no words of the translation say it on their own.' } } } } } }
const bare = w => w.replace(/^[\s.,!?;:״"'׳()[\]{}«»\-–—]+|[\s.,!?;:״"'׳()[\]{}«»\-–—]+$/g, '')
const plainHe = w => bare(w).replace(/[֑-ׇ]/g, '')
const api = (path, init = {}) => fetch(`https://api.anthropic.com/v1/${path}`, { ...init, headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', ...(init.headers || {}) } })

const client = await MongoClient.connect(env.MONGODB_URI)
const db = client.db(env.MONGODB_DB_NAME)
const user = await db.collection('users').findOne({ email })
if (!user) { console.log('No such account.'); process.exit(1) }
const { userId } = user
const shown = new Set(await db.collection('studyEvents').distinct('key', { userId, type: 'show', at: { $gte: now - 14 * DAY } }))

// The sentences to do: each card in use and each of its new sentences still without `t`.
const todo = []
for (const entry of await db.collection('vocab').find({ userId, archived: { $ne: true } }, { projection: { id: 1, forms: 1 } }).toArray()) {
  for (const form of entry.forms || []) {
    if (!(form.last > now - 30 * DAY) && !shown.has(`${entry.id}:${form.key}`)) continue
    const sentences = [{ variant: -1, ...form }, ...(form.variants || []).map((item, variant) => ({ variant, ...item }))]
    for (const item of sentences) {
      if (!item.translation || !item.sentence || item.glosses?.some(g => 't' in g)) continue
      todo.push({ id: entry.id, key: form.key, variant: item.variant, at: item.at, sentence: item.sentence, translation: item.translation, mark: item.mark, glosses: item.glosses })
    }
  }
}
const estimate = todo.length * 0.0065 * BATCH
console.log(`${todo.length} sentences on cards in use without it; about $${estimate.toFixed(2)} at batch price.`)
if (flag !== '--run' || !todo.length) { await client.close(); process.exit(0) }

const requests = todo.map((item, i) => {
  const words = item.sentence.split(/\s+/).filter(Boolean).map(bare)
  return { custom_id: `s${i}`, params: { model: MODEL, max_tokens: 3000, output_config: { effort: 'low', format: { type: 'json_schema', schema } }, system: SYSTEM,
    messages: [{ role: 'user', content: `Sentence: ${item.sentence}\nEnglish translation: ${item.translation}\nWords:\n${words.map((w, n) => `${n + 1}. ${w}`).join('\n')}` }] } }
})
const created = await (await api('messages/batches', { method: 'POST', body: JSON.stringify({ requests }) })).json()
if (!created.id) { console.log('Batch not created:', JSON.stringify(created).slice(0, 300)); process.exit(1) }
console.log('Batch', created.id)
let batch = created
while (batch.processing_status !== 'ended') {
  await new Promise(resolve => setTimeout(resolve, 15000))
  batch = await (await api(`messages/batches/${created.id}`)).json()
  console.log(' ', batch.processing_status, JSON.stringify(batch.request_counts))
}
const lines = (await (await api(`messages/batches/${created.id}/results`)).text()).trim().split('\n').map(line => JSON.parse(line))

// The words of a card's own (marked) form, by place, which glosses leave out as the writer does.
const ownPlaces = (sentence, mark) => {
  const marks = (mark || '').split(/\s+/).map(plainHe).filter(Boolean)
  const places = new Set()
  sentence.split(/\s+/).filter(Boolean).forEach((word, i) => { if (marks.includes(plainHe(word))) places.add(i) })
  return places
}
const before = []
let cost = 0, written = 0, failed = 0
for (const line of lines) {
  const item = todo[Number(line.custom_id.slice(1))]
  if (line.result.type !== 'succeeded') { failed++; continue }
  const message = line.result.message
  const callCost = (message.usage.input_tokens * PRICE.input + message.usage.output_tokens * PRICE.output) / 1e6 * BATCH
  cost += callCost
  await db.collection('aiUsage').insertOne({ userId, feature: 'glosses', provider: 'anthropic', model: message.model, cost: callCost, ms: 0, batch: created.id,
    inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, cacheReadTokens: 0, cacheWriteTokens: 0, at: new Date() })
  const answer = JSON.parse(message.content.find(block => block.type === 'text').text).meanings
  const words = item.sentence.split(/\s+/).filter(Boolean)
  const of = n => answer.find(a => a.n === n + 1)
  const own = ownPlaces(item.sentence, item.mark)
  const glosses = item.glosses?.length
    ? item.glosses.map(g => ({ ...g, t: of(g.i)?.inTranslation?.trim() ?? '' }))
    : words.map((_, i) => i).filter(i => !own.has(i) && of(i)?.meaning).map(i => ({ i, lemma: '', en: of(i).meaning.trim(), t: of(i).inTranslation?.trim() ?? '' }))
  const path = item.variant < 0 ? 'forms.$[card].glosses' : `forms.$[card].variants.${item.variant}.glosses`
  const filter = item.variant < 0 ? { 'card.key': item.key } : { 'card.key': item.key, [`card.variants.${item.variant}.at`]: item.at }
  const result = await db.collection('vocab').updateOne({ userId, id: item.id }, { $set: { [path]: glosses } }, { arrayFilters: [filter] })
  if (result.modifiedCount) { written++; before.push({ id: item.id, key: item.key, variant: item.variant, glosses: item.glosses ?? null }) }
}
const file = new URL(`./alignment-backup-${now}.json`, import.meta.url)
writeFileSync(file, JSON.stringify(before))
console.log(`Written ${written} of ${todo.length}; ${failed} failed; cost $${cost.toFixed(4)}. What they had before: ${file.pathname}`)
await client.close()

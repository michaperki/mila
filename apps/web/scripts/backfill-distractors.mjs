// One-off (Phase A, 2026-11-19; to run only with Mike's approval of its estimate): distractors for
// the meaning cards of the words being studied, written for each sentence's own form of the word
// (שְׁלֵמָה, not שָׁלֵם), so these cards can be a fill in the blank with one right answer and no
// English (apps/mobile/src/lib/forms.ts blankAnswer). Cards written since 2026-11-19 have them from
// the writer (`distractorsFor`); older ones have none, or dictionary-form ones that fit only a
// sentence with the dictionary form in it. Without them a card is asked as a flashcard.
//
// `node scripts/backfill-distractors.mjs <email>`: what it would do and the most it could cost (input
// counted exactly, output at each request's max_tokens: lib/spend.mjs). No calls paid.
// `... <email> --cap <dollars>`: only if that most is within the cap Mike approved, asks through
// the Message Batches API (half price), one request a word with
// all its sentences that need them, and writes `distractors` and `distractorsFor` onto each
// sentence whose three are usable (distinct, none the word itself). Every paid request is recorded
// in aiUsage; what each sentence had before is kept in a file beside this one.
import { readFileSync, writeFileSync } from 'fs'
import { MongoClient } from 'mongodb'
import { anthropic, cappedBatch, capOf, costOf } from './lib/spend.mjs'

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const [email] = process.argv.slice(2)
if (!email) { console.log('Usage: node scripts/backfill-distractors.mjs <email> [--cap <dollars>]'); process.exit(1) }
const cap = capOf(process.argv)
const now = Date.now()
const MODEL = 'claude-opus-5-5'
// Output tokens allowed a request: the run of 19/11 averaged about 270 a sentence (with the
// model's thinking), so 400 a sentence and 300 more. A request that needs more is cut short and
// written nothing; the cost can't go past this.
const maxTokensFor = sentences => 300 + 400 * sentences

// The writer's Distractors rule (lib/forms-writer.ts), for a sentence already written.
const SYSTEM = 'You write multiple-choice options for an English-speaking learner of modern Hebrew. The learner sees a Hebrew sentence with one word (or expression) left out and four Hebrew options, without the English, and picks the one that belongs there. For each sentence you are given, write three wrong options that make them think about what the sentence says: common words of the same part of speech, related in some way (the same situation, a near meaning, a similar look or sound), but that mean something clearly different, so that someone who knows the missing word picks it. The sentence alone must rule each one out: never a synonym, never a word that would also make a natural sentence there, never a rare word. Write each exactly as it would stand in the gap, in the same form as the missing word as written (the same attached prefix, person, gender, number and tense), fully vocalized, so the form gives nothing away.'
const schema = { type: 'object', additionalProperties: false, required: ['sentences'], properties: { sentences: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'distractors'], properties: {
  n: { type: 'integer', description: 'The sentence\'s number.' },
  distractors: { type: 'array', items: { type: 'string' }, description: 'Three wrong options, each written as it would stand in the gap.' } } } } } }
const api = anthropic(env.ANTHROPIC_API_KEY)

// As the phone compares them (forms.ts sameSpelling): spelling and joining aside.
const loose = text => (text || '').replace(/[֑-ׇ]/g, '').replace(/[־-]/g, ' ').replace(/[^א-ת ]/g, '').replace(/[וי]/g, '').replace(/\s+/g, ' ').trim()
const usable = item => item.distractorsFor ? item.distractors?.length === 3 : item.distractors?.length === 3 && !!loose(item.mark) && loose(item.mark) === loose(item.he)

const client = await MongoClient.connect(env.MONGODB_URI)
const db = client.db(env.MONGODB_DB_NAME)
const user = await db.collection('users').findOne({ email })
if (!user) { console.log('No such account.'); process.exit(1) }
const { userId } = user

// The words being studied (any answer kept), and each of their meaning sentences (a card's own and
// its new ones) without usable distractors.
const words = []
for (const entry of await db.collection('vocab').find({ userId, archived: { $ne: true } }, { projection: { id: 1, lemma: 1, gloss: 1, results: 1, forms: 1 } }).toArray()) {
  if (!entry.results?.length && !entry.forms?.some(form => form.results?.length)) continue
  const todo = []
  for (const form of entry.forms || []) {
    if (form.stage !== 'meanings') continue
    const sentences = [{ variant: -1, ...form }, ...(form.variants || []).map((item, variant) => ({ variant, ...item, he: item.he || form.he }))]
    for (const item of sentences) {
      if (!item.sentence || !item.mark || usable(item)) continue
      todo.push({ key: form.key, variant: item.variant, at: item.at, sentence: item.sentence, translation: item.translation, word: item.said || item.mark, meaning: item.en || form.en, distractors: item.distractors ?? null, distractorsFor: item.distractorsFor ?? null })
    }
  }
  if (todo.length) words.push({ id: entry.id, lemma: entry.lemma, gloss: entry.gloss, todo })
}
const requests = words.map((word, i) => ({ custom_id: `w${i}`, params: { model: MODEL, max_tokens: maxTokensFor(word.todo.length), output_config: { effort: 'low', format: { type: 'json_schema', schema } }, system: SYSTEM,
  messages: [{ role: 'user', content: `The word: ${word.lemma} (${word.gloss})\n\n${word.todo.map((item, n) => `${n + 1}. ${item.sentence}\nThe missing word as written there: ${item.word}\nIt means: ${item.meaning}\nEnglish of the sentence (for you; the learner doesn't see it): ${item.translation}`).join('\n\n')}` }] } }))
const sentences = words.reduce((sum, word) => sum + word.todo.length, 0)

console.log(`${sentences} meaning sentences on ${words.length} words being studied need distractors.`)
const sent = requests.length ? await cappedBatch(api, requests, cap) : null
if (!sent) { await client.close(); process.exit(0) }
const { id: batchId, lines } = sent

const before = []
let cost = 0, written = 0, refused = 0, failed = 0
for (const line of lines) {
  const word = words[Number(line.custom_id.slice(1))]
  if (line.result.type !== 'succeeded') { failed += word.todo.length; continue }
  const message = line.result.message
  const callCost = costOf(message)
  cost += callCost
  await db.collection('aiUsage').insertOne({ userId, feature: 'forms', provider: 'anthropic', model: message.model, cost: callCost, ms: 0, batch: batchId,
    inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, cacheReadTokens: 0, cacheWriteTokens: 0, at: new Date() })
  // Cut short at max_tokens: nothing usable to write.
  if (message.stop_reason === 'max_tokens') { failed += word.todo.length; continue }
  const answer = JSON.parse(message.content.find(block => block.type === 'text').text).sentences
  for (const [n, item] of word.todo.entries()) {
    const given = (answer.find(a => a.n === n + 1)?.distractors || []).map(text => text.trim()).filter(Boolean)
    // Three different words, none of them the missing word itself.
    const ok = given.length === 3 && new Set(given.map(loose)).size === 3 && !given.some(text => loose(text) === loose(item.word))
    if (!ok) { refused++; continue }
    const base = item.variant < 0 ? 'forms.$[card]' : `forms.$[card].variants.${item.variant}`
    const filter = item.variant < 0 ? { 'card.key': item.key } : { 'card.key': item.key, [`card.variants.${item.variant}.at`]: item.at }
    const result = await db.collection('vocab').updateOne({ userId, id: word.id }, { $set: { [`${base}.distractors`]: given, [`${base}.distractorsFor`]: item.word } }, { arrayFilters: [filter] })
    if (result.modifiedCount) { written++; before.push({ id: word.id, key: item.key, variant: item.variant, distractors: item.distractors, distractorsFor: item.distractorsFor }) }
  }
}
const file = new URL(`./distractors-backup-${now}.json`, import.meta.url)
writeFileSync(file, JSON.stringify(before))
console.log(`Written ${written} of ${sentences}; ${refused} refused as unusable; ${failed} failed; cost $${cost.toFixed(4)}. What they had before: ${file.pathname}`)
await client.close()

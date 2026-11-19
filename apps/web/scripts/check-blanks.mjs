// Do the fill in the blank questions have exactly one defensible answer? (2026-11-19, consolidation
// phase C.) Each meaning sentence that can be asked as a fill in the blank (apps/mobile/src/lib/
// forms.ts blankAnswer) is given, as the learner sees it (the Hebrew with the gap, the four options,
// no English and no word of which is meant), to a model that judges each option on its own: would
// a native speaker accept the sentence with it, in meaning and grammar? The question passes only if
// the intended answer fits and nothing else does. The verdict is kept on the sentence (`blankCheck`:
// version, ok, the options that fit, when), and the phone asks a sentence that failed as a
// flashcard. One the check couldn't settle (the request failed or was cut short, or not every
// option was judged) is kept as `inconclusive`, not ok, so it is a flashcard too, and is checked
// again on the next run. Distractors aren't rewritten here: a failed sentence simply isn't a fill in the blank.
//
// `node scripts/check-blanks.mjs <email>`: how many sentences, and the most it could cost (input
// counted, output at max_tokens: lib/spend.mjs). Nothing paid.
// `... <email> --cap <dollars>`: checks them through the Message Batches API, only within the cap.
// `--again`: also sentences checked before (by an older version, or to compare).
// What each sentence had before is kept in a file beside this one.
import { readFileSync, writeFileSync } from 'fs'
import { MongoClient } from 'mongodb'
import { anthropic, cappedBatch, capOf, costOf } from './lib/spend.mjs'

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const [email] = process.argv.slice(2)
if (!email) { console.log('Usage: node scripts/check-blanks.mjs <email> [--cap <dollars>] [--again]'); process.exit(1) }
const cap = capOf(process.argv)
const again = process.argv.includes('--again')
const now = Date.now()
const MODEL = 'claude-opus-5-5', VERSION = 'blank-check-v1'
const maxTokensFor = sentences => 300 + 500 * sentences
const api = anthropic(env.ANTHROPIC_API_KEY)

const SYSTEM = 'You check fill-in-the-blank questions for learners of modern Hebrew. Each question is a Hebrew sentence with a gap (＿＿＿) and four options. Judge every option on its own, as a native speaker would: with it in the gap, is the sentence natural and sensible, in meaning and in grammar? An option fits only if you would accept the sentence from a native speaker without hesitation; a sentence that is grammatical but odd, contradictory or far-fetched in meaning does not fit. You are not told which option was intended and should not guess it: an option that fits fits, even if another fits better.'
const schema = { type: 'object', additionalProperties: false, required: ['questions'], properties: { questions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'options'], properties: {
  n: { type: 'integer' },
  options: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['option', 'fits', 'why'], properties: {
    option: { type: 'string', description: 'The option, copied exactly.' }, fits: { type: 'boolean' }, why: { type: 'string', description: 'A few words: what the sentence would mean with it, or what is wrong.' } } } } } } } } }

// As the phone decides (forms.ts blankAnswer, sameSpelling) and draws the gap (the marked words).
const strip = text => (text || '').replace(/[֑-ׇ]/g, '')
const loose = text => strip(text).replace(/[־-]/g, ' ').replace(/[^א-ת ]/g, '').replace(/[וי]/g, '').replace(/\s+/g, ' ').trim()
const answerOf = item => (item.distractorsFor ? (item.distractors?.length === 3 ? item.distractorsFor : null) : item.distractors?.length === 3 && loose(item.mark) && loose(item.mark) === loose(item.he) ? item.he : null)
const gapped = (sentence, mark) => {
  const marks = new Set(strip(mark).split(/\s+/).map(word => word.replace(/[^א-ת]/g, '')).filter(Boolean))
  const out = []
  for (const word of sentence.split(/\s+/).filter(Boolean)) {
    const bare = strip(word).replace(/[^א-ת]/g, '')
    if (marks.has(bare)) { const tail = word.match(/[.,!?;:״"'׳)\]]+$/)?.[0] ?? ''; if (out[out.length - 1] !== '＿＿＿') out.push(`＿＿＿${tail}`); else if (tail) out[out.length - 1] += tail } else out.push(word)
  }
  return out.join(' ')
}
const shuffled = (items, seed) => { const out = [...items]; let s = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7); for (let i = out.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); [out[i], out[j]] = [out[j], out[i]] } return out }

const client = await MongoClient.connect(env.MONGODB_URI)
const db = client.db(env.MONGODB_DB_NAME)
const user = await db.collection('users').findOne({ email })
if (!user) { console.log('No such account.'); process.exit(1) }
const { userId } = user

// Every meaning sentence of a word being studied that can be a fill in the blank, not yet checked.
const words = []
// Sentences whose gap can't be drawn from their marked words: not sent, kept as inconclusive.
const ungapped = []
for (const entry of await db.collection('vocab').find({ userId, archived: { $ne: true } }, { projection: { id: 1, lemma: 1, results: 1, forms: 1 } }).toArray()) {
  if (!entry.results?.length && !entry.forms?.some(form => form.results?.length)) continue
  const todo = []
  for (const form of entry.forms || []) {
    if (form.stage !== 'meanings') continue
    for (const item of [{ variant: -1, ...form }, ...(form.variants || []).map((other, variant) => ({ variant, ...other, he: other.he || form.he }))]) {
      const answer = answerOf(item)
      if (!answer || !item.sentence || (!again && item.blankCheck?.v === VERSION && !item.blankCheck.inconclusive)) continue
      const gap = gapped(item.sentence, item.mark)
      if (!gap.includes('＿＿＿')) { ungapped.push({ word: { id: entry.id }, item: { key: form.key, variant: item.variant, at: item.at, before: item.blankCheck ?? null } }); continue }
      todo.push({ key: form.key, variant: item.variant, at: item.at, gap, answer, options: shuffled([answer, ...item.distractors.slice(0, 3)], `${entry.id}:${form.key}:${item.variant}`), before: item.blankCheck ?? null })
    }
  }
  if (todo.length) words.push({ id: entry.id, lemma: entry.lemma, todo })
}
const requests = words.map((word, i) => ({ custom_id: `w${i}`, params: { model: MODEL, max_tokens: maxTokensFor(word.todo.length), output_config: { effort: 'low', format: { type: 'json_schema', schema } }, system: SYSTEM,
  messages: [{ role: 'user', content: word.todo.map((item, n) => `${n + 1}. ${item.gap}\nOptions: ${item.options.join(' / ')}`).join('\n\n') }] } }))
console.log(`${words.reduce((sum, word) => sum + word.todo.length, 0)} fill in the blank sentences on ${words.length} words being studied to check${ungapped.length ? `, and ${ungapped.length} whose gap can't be drawn (kept as inconclusive)` : ''}.`)
const sent = requests.length ? await cappedBatch(api, requests, cap) : null
if (!sent) { await client.close(); process.exit(0) }

const before = []
let cost = 0, passed = 0, failed = 0, unread = 0
const keep = async (word, item, check) => {
  const base = item.variant < 0 ? 'forms.$[card]' : `forms.$[card].variants.${item.variant}`
  const filter = item.variant < 0 ? { 'card.key': item.key } : { 'card.key': item.key, [`card.variants.${item.variant}.at`]: item.at }
  const result = await db.collection('vocab').updateOne({ userId, id: word.id }, { $set: { [`${base}.blankCheck`]: { v: VERSION, ...check, at: now } } }, { arrayFilters: [filter] })
  if (result.modifiedCount) before.push({ id: word.id, key: item.key, variant: item.variant, blankCheck: item.before })
}
for (const { word, item } of ungapped) { unread++; await keep(word, item, { ok: false, fits: [], inconclusive: true }) }
const inconclusive = async word => { for (const item of word.todo) { unread++; await keep(word, item, { ok: false, fits: [], inconclusive: true }) } }
const failures = []
for (const line of sent.lines) {
  const word = words[Number(line.custom_id.slice(1))]
  if (line.result.type !== 'succeeded') { await inconclusive(word); continue }
  const message = line.result.message
  cost += costOf(message)
  await db.collection('aiUsage').insertOne({ userId, feature: 'blank-check', provider: 'anthropic', model: message.model, cost: costOf(message), ms: 0, batch: sent.id,
    inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, cacheReadTokens: 0, cacheWriteTokens: 0, at: new Date() })
  if (message.stop_reason === 'max_tokens') { await inconclusive(word); continue }
  const questions = JSON.parse(message.content.find(block => block.type === 'text').text).questions
  for (const [n, item] of word.todo.entries()) {
    const judged = questions.find(question => question.n === n + 1)?.options ?? []
    // Every option judged, matched back by spelling; a question not fully judged is left unchecked.
    const verdicts = item.options.map(option => judged.find(other => loose(other.option) === loose(option)))
    if (verdicts.some(verdict => !verdict)) { unread++; await keep(word, item, { ok: false, fits: [], inconclusive: true }); continue }
    const fits = item.options.filter((_, i) => verdicts[i].fits)
    const ok = fits.length === 1 && loose(fits[0]) === loose(item.answer)
    if (ok) passed++; else { failed++; failures.push(`${strip(word.lemma)}: ${strip(item.gap)} · answer ${strip(item.answer)} · fit: ${fits.map(strip).join(', ') || 'none'} (${verdicts.filter(v => v.fits || loose(v.option) === loose(item.answer)).map(v => `${strip(v.option)}: ${v.why}`).join('; ')})`) }
    await keep(word, item, { ok, fits })
  }
}
const file = new URL(`./blank-check-backup-${now}.json`, import.meta.url)
writeFileSync(file, JSON.stringify(before))
console.log(`Passed ${passed}, failed ${failed}, inconclusive ${unread} (failed and inconclusive are asked as flashcards); cost $${cost.toFixed(4)}. What they had before: ${file.pathname}`)
if (failures.length) console.log(`\nFailed:\n${failures.join('\n')}`)
await client.close()

// Compares ways of writing practice cards on the same words, scored blind by a separate judge:
//   A  the writer before the Hebrew-first prompt (scripts/eval/baseline-writer.ts)
//   B  the writer now (netlify/functions/lib/forms-writer.ts)
//   C  B's cards after a review pass (netlify/functions/lib/forms-review.ts)
// `node --experimental-strip-types scripts/eval-forms.mjs` picks a sample of saved words (kept in
// scripts/eval-out/sample.json, so later runs use the same words), writes each word's meanings and
// one form stage with each writer, judges every card without saying which writer wrote it, and
// writes scripts/eval-out/report.md (scores, cost, time, and every card side by side). Each step
// is kept, so a run that stops goes on from there; `--fresh` starts over on the same words.
// Nothing is written to the database. Reads MONGODB_URI, MONGODB_DB_NAME and ANTHROPIC_API_KEY
// from apps/web/.env; costs a few dollars.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { MongoClient } from 'mongodb'
import { baselineForms } from './eval/baseline-writer.ts'
import { writeForms } from '../netlify/functions/lib/forms-writer.ts'
import { reviewForms } from '../netlify/functions/lib/forms-review.ts'

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')
  .map(line => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]))
const out = new URL('./eval-out/', import.meta.url)
if (process.argv.includes('--fresh')) for (const name of ['A', 'B', 'C', 'judged', 'usage']) rmSync(new URL(`${name}.json`, out), { force: true })
mkdirSync(out, { recursive: true })
const kept = name => (existsSync(new URL(`${name}.json`, out)) ? JSON.parse(readFileSync(new URL(`${name}.json`, out), 'utf8')) : null)
const keep = (name, value) => writeFileSync(new URL(`${name}.json`, out), JSON.stringify(value, null, 1))

// Opus 5.5 prices, $ per million tokens (netlify/functions/lib/ai-usage.ts).
const PRICE = { input: 4, output: 20 }
const usage = kept('usage') ?? {}
function asker(label, effort = 'low') {
  return async ({ system, prompt, schema }) => {
    for (let attempt = 0; ; attempt++) {
      const started = Date.now()
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-opus-5-5', max_tokens: 16000, output_config: { effort, format: { type: 'json_schema', schema } }, system, messages: [{ role: 'user', content: prompt }] }),
      })
      const body = await response.json()
      if (response.ok) {
        const total = (usage[label] ??= { calls: 0, input: 0, output: 0, ms: 0 })
        total.calls++; total.input += body.usage.input_tokens; total.output += body.usage.output_tokens; total.ms += Date.now() - started
        return body
      }
      if (attempt >= 3) throw new Error(body.error?.message || `status ${response.status}`)
      await new Promise(resolve => setTimeout(resolve, 5000 * (attempt + 1)))
    }
  }
}
async function inTurn(items, run, at = 6) {
  let next = 0
  await Promise.all(Array.from({ length: at }, async () => { while (next < items.length) { const item = items[next++]; await run(item) } }))
}

// The words: a spread of kinds picked by a hash of their id (the same on every run), and a few
// whose cards the audit found wrong, scored apart.
const STAGE = { verb: 'present', adjective: 'inflected', noun: 'plural' }
const KNOWN = ['להתחרט', 'לזכות', 'לחלוף', 'לחדול', 'להיעלם', 'מסוים', 'נוסף', 'לשקוע']
// Compared without vowels, or the letters spelling them (מְסֻיָּם is מסוים).
const plain = text => (text || '').replace(/[\u0591-\u05C7]/g, '').replace(/[וי]/g, '')
async function sample() {
  const have = kept('sample')
  if (have) return have
  const client = new MongoClient(env.MONGODB_URI)
  await client.connect()
  const docs = await client.db(env.MONGODB_DB_NAME || 'mila').collection('vocab').find({}).toArray()
  await client.close()
  const kind = doc => { const pos = doc.partOfSpeech === 'expression' ? doc.head?.partOfSpeech : doc.partOfSpeech; return ['verb', 'adjective', 'noun'].includes(pos) ? pos : 'other' }
  const hash = doc => createHash('sha1').update(String(doc.id)).digest('hex')
  const sorted = docs.filter(doc => doc.lemma && doc.gloss).sort((a, b) => hash(a).localeCompare(hash(b)))
  const known = KNOWN.map(word => sorted.find(doc => plain(doc.lemma) === plain(word))).filter(Boolean)
  const rest = sorted.filter(doc => !known.includes(doc))
  const pick = (test, n) => rest.filter(test).slice(0, n)
  const words = [
    ...pick(doc => kind(doc) === 'verb' && doc.partOfSpeech !== 'expression', 8), ...pick(doc => doc.partOfSpeech === 'expression', 2),
    ...pick(doc => kind(doc) === 'adjective', 4), ...pick(doc => kind(doc) === 'noun' && !doc.feminine, 3), ...pick(doc => !!doc.feminine, 2),
    ...pick(doc => kind(doc) === 'other', 3),
  ].map(doc => ({ doc, set: 'random' })).concat(known.map(doc => ({ doc, set: 'known' })))
  const chosen = words.map(({ doc, set }, i) => ({
    n: i, set, stages: ['meanings', ...(STAGE[kind(doc)] ? [STAGE[kind(doc)]] : []), ...(kind(doc) === 'verb' && i % 4 === 0 ? ['past'] : [])],
    entry: Object.fromEntries(['lemma', 'gloss', 'partOfSpeech', 'binyan', 'head', 'pattern', 'feminine', 'constructions', 'governs', 'encounters'].filter(key => doc[key] !== undefined).map(key => [key, doc[key]])),
  }))
  keep('sample', chosen)
  return chosen
}

// Each writer writes a word's stages in turn, as the app does: meanings first, then the form
// stage with the meanings it wrote (its main meaning and sentences not to repeat).
async function written(name, write) {
  const have = kept(name)
  if (have) return have
  const cards = []
  await inTurn(words, async word => {
    let forms = []
    for (const stage of word.stages) {
      try {
        const fresh = await write({ ...word.entry, forms }, stage)
        forms = [...forms, ...fresh]
        cards.push(...fresh.map(form => ({ word: word.n, ...form })))
      } catch (failure) { console.error(`${name} ${word.entry.lemma} ${stage}: ${failure.message}`) }
    }
    process.stdout.write('.')
  })
  keep(name, cards); keep('usage', usage)
  console.log(` ${name}: ${cards.length} cards`)
  return cards
}

const words = await sample()
console.log(`${words.length} words (${words.filter(word => word.set === 'known').length} known to have gone wrong)`)
const A = await written('A', (entry, stage) => baselineForms(entry, stage, asker('A write')))
const B = await written('B', (entry, stage) => writeForms(entry, stage, asker('B write')))
let C = kept('C')
if (!C) {
  C = []
  const byWord = Object.groupBy(B, card => `${card.word}|${card.stage}`)
  await inTurn(Object.values(byWord), async cards => {
    const word = words[cards[0].word]
    try {
      const { forms, fixed } = await reviewForms(word.entry, cards[0].stage, cards, asker('C review'))
      C.push(...forms.map(form => ({ word: word.n, ...form, reviewed: fixed.find(item => item.key === form.key)?.problems })))
    } catch (failure) { console.error(`review ${word.entry.lemma}: ${failure.message}`); C.push(...cards) }
  })
  keep('C', C); keep('usage', usage)
}

// The English as the app shows it (apps/mobile/src/lib/forms.ts cuedTranslation).
function shown(card) {
  const cues = card.cues ?? (card.cue ? [{ cue: card.cue, after: card.cueAfter ?? '' }] : [])
  const first = []; const placed = []
  for (const { cue, after } of cues) {
    const found = after ? new RegExp(`(^|[^\\p{L}])(${after.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\p{L}])`, 'iu').exec(card.translation) : null
    if (!found) { first.push(cue); continue }
    let end = found.index + found[1].length + found[2].length
    while (end < card.translation.length && /[\p{L}'’]/u.test(card.translation[end])) end++
    const same = placed.find(item => item.end === end)
    if (same) same.cue += cue; else placed.push({ end, cue })
  }
  let text = card.translation
  for (const { end, cue } of placed.sort((a, b) => b.end - a.end)) text = `${text.slice(0, end)} ${cue}${text.slice(end)}`
  return first.length ? `${first.join(' ')} ${text}` : text
}

// The judge: a native editor's reading of each card, given in a shuffled order with no word of
// which writer wrote it. Its wording is its own, not the review pass's, though both are Claude.
const JUDGE = `You are a native Israeli Hebrew editor grading flashcards for an English-speaking learner. On an English-first card the learner sees the English (with any emoji shown in it, which says who a word is about: 👨 a man, 👩 a woman, 👦 a boy, 👧 a girl, two faces a group) and says the whole Hebrew sentence; the card's tested form must be in it.

For each card report:
- "open": every Hebrew word whose form depends on the gender or number of a person (or of an animal shown as male or female) that the English as shown leaves open: nothing in it (a name, he/she, a gendered noun, a possessive, an emoji) settles it, and the Hebrew would be written differently otherwise. Not things' grammatical gender. Only words left open.
- "needless": each emoji that settles nothing the Hebrew depends on, or one the English already settles.
- "testedForm": whether the sentence really uses the card's tested form ("yes"), or another form of the word ("no").
- "naturalness": "natural" (an Israeli would plausibly say or write it this way in that context), "stiff" (correct, but an Israeli would more likely say it differently), or "wrong" (an error, a sense the word doesn't have, or something no Israeli would say). Standard, neutral or slightly formal Hebrew that Israelis really use is natural; a sentence is not stiff only because a shorter variant exists.
- "issues" when not natural, from the list, and "comment", one short sentence.
- "translation": whether the English says what the Hebrew says ("faithful", "loose", "wrong").`
const judgeSchema = { type: 'object', additionalProperties: false, required: ['cards'], properties: { cards: { type: 'array', items: { type: 'object', additionalProperties: false,
  required: ['card', 'open', 'needless', 'testedForm', 'naturalness', 'issues', 'comment', 'translation'],
  properties: { card: { type: 'integer' }, open: { type: 'array', items: { type: 'string' } }, needless: { type: 'array', items: { type: 'string' } },
    testedForm: { type: 'string', enum: ['yes', 'no'] }, naturalness: { type: 'string', enum: ['natural', 'stiff', 'wrong'] },
    issues: { type: 'array', items: { type: 'string', enum: ['agreement', 'sense', 'register', 'calque', 'preposition', 'nominalization', 'possessive', 'pronoun', 'word-choice', 'word-order', 'grammar', 'other'] } },
    comment: { type: 'string' }, translation: { type: 'string', enum: ['faithful', 'loose', 'wrong'] } } } } } }
let judged = kept('judged')
if (!judged) {
  // One list of every distinct card, shuffled; a card C left as B wrote it is judged once.
  const all = [...A.map(card => ({ ...card, by: 'A' })), ...B.map(card => ({ ...card, by: 'B' })), ...C.filter(card => card.reviewed).map(card => ({ ...card, by: 'C' }))]
  const order = all.map((card, i) => ({ card, sort: createHash('sha1').update(`${i}${card.sentence}`).digest('hex') })).sort((a, b) => a.sort.localeCompare(b.sort)).map(item => item.card)
  const batches = []
  for (let i = 0; i < order.length; i += 20) batches.push(order.slice(i, i + 20))
  judged = []
  const judge = asker('judge', 'medium')
  await inTurn(batches, async batch => {
    const prompt = batch.map((card, i) => `${i + 1}. word ${words[card.word].entry.lemma} · ${card.stage} ${card.slot} · tested form ${card.he}\n   English shown: ${shown(card)}\n   Hebrew: ${card.sentence}`).join('\n')
    try {
      const reply = await judge({ system: JUDGE, prompt, schema: judgeSchema })
      const grades = JSON.parse(reply.content.filter(block => block.type === 'text').map(block => block.text).join('')).cards
      batch.forEach((card, i) => { const grade = grades.find(item => item.card === i + 1); if (grade) judged.push({ ...card, shown: shown(card), grade }) })
    } catch (failure) { console.error(`judge: ${failure.message}`) }
    process.stdout.write('.')
  })
  keep('judged', judged); keep('usage', usage)
  console.log(` judged ${judged.length}`)
}

// Scores. C's cards are B's, with each one the review rewrote in its rewritten form.
const gradeOf = (by, card) => judged.find(item => item.by === by && item.word === card.word && item.key === card.key)?.grade
const graded = { A: A.map(card => ({ card, grade: gradeOf('A', card) })), B: B.map(card => ({ card, grade: gradeOf('B', card) })),
  C: C.map(card => ({ card, grade: gradeOf(card.reviewed ? 'C' : 'B', card) })) }
const FAMILY = /^(אבא|אמא|סבא|סבתא|אחי|אחותי|אח שלי|אחות שלי|הבן שלי|הבת שלי|דוד|דודה|דנה|יוסי|נועה|דני|מיכל|רוני|הסבא)/
const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '–')
function scores(list) {
  const rated = list.filter(item => item.grade)
  const count = test => rated.filter(test).length
  return {
    cards: list.length, natural: pct(count(item => item.grade.naturalness === 'natural'), rated.length),
    stiff: pct(count(item => item.grade.naturalness === 'stiff'), rated.length), wrong: pct(count(item => item.grade.naturalness === 'wrong'), rated.length),
    open: pct(count(item => item.grade.open.length > 0), rated.length), needless: pct(count(item => item.grade.needless.length > 0), rated.length),
    cued: pct(list.filter(item => (item.card.cues ?? (item.card.cue ? [1] : [])).length > 0).length, list.length),
    otherForm: count(item => item.grade.testedForm === 'no'), loose: pct(count(item => item.grade.translation !== 'faithful'), rated.length),
    family: pct(list.filter(item => FAMILY.test(item.card.sentence)).length, list.length),
  }
}
const money = label => { const total = usage[label]; return total ? (total.input * PRICE.input + total.output * PRICE.output) / 1e6 : 0 }
const lines = ['# Card writing: before, now, and now with a review pass', '',
  `${words.length} words (${words.filter(word => word.set === 'random').length} picked across kinds, ${words.filter(word => word.set === 'known').length} whose cards the audit found wrong), each word's meanings and one form stage; graded blind by a separate Claude judge (effort medium).`, '',
  '| | Cards | Natural | Stiff | Wrong | Person left open | Needless emoji | With emoji | Other form used | Translation loose/wrong | Opens with family/name |',
  '|---|---|---|---|---|---|---|---|---|---|---|']
for (const set of ['all', 'random', 'known']) {
  lines.push(`| **${set === 'all' ? 'All words' : set === 'random' ? 'Picked across kinds' : 'Known to have gone wrong'}** | | | | | | | | | | |`)
  for (const by of ['A', 'B', 'C']) {
    const s = scores(graded[by].filter(item => set === 'all' || words[item.card.word].set === set))
    lines.push(`| ${by} | ${s.cards} | ${s.natural} | ${s.stiff} | ${s.wrong} | ${s.open} | ${s.needless} | ${s.cued} | ${s.otherForm} | ${s.loose} | ${s.family} |`)
  }
}
const time = label => (usage[label] ? `${(usage[label].ms / usage[label].calls / 1000).toFixed(1)} s` : '–')
lines.push('', '| | Calls | Input tokens | Output tokens | Cost | Mean time per call |', '|---|---|---|---|---|---|')
for (const label of ['A write', 'B write', 'C review', 'judge']) {
  const total = usage[label] ?? { calls: 0, input: 0, output: 0 }
  lines.push(`| ${label} | ${total.calls} | ${total.input} | ${total.output} | $${money(label).toFixed(2)} | ${time(label)} |`)
}
const rewritten = C.filter(card => card.reviewed)
lines.push('', `The review rewrote ${rewritten.length} of ${C.length} cards.`, '')
const issues = by => { const all = {}; graded[by].forEach(item => item.grade?.issues.forEach(issue => { all[issue] = (all[issue] || 0) + 1 })); return Object.entries(all).sort((a, b) => b[1] - a[1]).map(([issue, n]) => `${issue} ${n}`).join(', ') }
lines.push('Issues found: ', ...['A', 'B', 'C'].map(by => `- ${by}: ${issues(by) || 'none'}`), '')
lines.push('## Every card', '')
const line = (by, item) => item ? `- **${by}** ${item.card.sentence}\n  ${shown(item.card)}\n  _${item.grade ? `${item.grade.naturalness}${item.grade.issues.length ? ` (${item.grade.issues.join(', ')})` : ''}${item.grade.open.length ? ` · open: ${item.grade.open.join(', ')}` : ''}${item.grade.needless.length ? ` · needless: ${item.grade.needless.join(' ')}` : ''}${item.grade.testedForm === 'no' ? ' · other form' : ''}${item.grade.comment ? ` · ${item.grade.comment}` : ''}` : 'not graded'}_${item.card.reviewed ? `\n  review: ${item.card.reviewed.join('; ')}` : ''}` : `- **${by}** (not written)`
for (const word of words) {
  lines.push(`### ${word.entry.lemma} — ${word.entry.gloss}${word.set === 'known' ? ' (known)' : ''}`)
  const keys = [...new Set([...A, ...B].filter(card => card.word === word.n).map(card => card.key))]
  for (const key of keys) {
    lines.push(`**${key}**`)
    for (const by of ['A', 'B', 'C']) {
      const item = graded[by].find(entry => entry.card.word === word.n && entry.card.key === key)
      if (by === 'C' && item && !item.card.reviewed) continue
      lines.push(line(by, item))
    }
  }
  lines.push('')
}
writeFileSync(new URL('report.md', out), lines.join('\n'))
console.log(lines.slice(0, 30).join('\n'))

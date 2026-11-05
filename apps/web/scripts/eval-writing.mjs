// Compares the card writer as committed with the one in the working tree (or any two commits'),
// on the same words, graded blind by a separate judge. `node --experimental-strip-types
// scripts/eval-writing.mjs [--before <commit>] [--fresh]`: the "before" writer is taken from git
// (HEAD by default) into scripts/eval-out/writing/before/, "after" is
// netlify/functions/lib/forms-writer.ts as it is now. The words (kept in sample.json, so later
// runs use the same ones) are a spread of verbs, expressions, adjectives, nouns, other words,
// words with several meanings, and words whose saved cards talk about people's family, bodies or
// belongings, where possessives go wrong. Each is written as the app writes it: its meanings, then
// a form stage with what the meanings wrote. Two grades, neither told which writer wrote what:
// each card on its own (natural, what is wrong, whether the translation is faithful), and each
// word's cards as a set (how many different ways of using the word they show, and which cards
// teach nearly the same thing). Writes scripts/eval-out/writing/report.md; each step is kept, so a
// run that stops goes on from there. Nothing is written to the database. Reads MONGODB_URI,
// MONGODB_DB_NAME and ANTHROPIC_API_KEY from apps/web/.env; costs a few dollars.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { MongoClient } from 'mongodb'

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')
  .map(line => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]))
const arg = name => { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1] }
const out = new URL('./eval-out/writing/', import.meta.url)
if (process.argv.includes('--fresh')) for (const name of ['before', 'after', 'cards', 'sets', 'usage']) rmSync(new URL(`${name}.json`, out), { force: true })
mkdirSync(new URL('before/', out), { recursive: true })
const kept = name => (existsSync(new URL(`${name}.json`, out)) ? JSON.parse(readFileSync(new URL(`${name}.json`, out), 'utf8')) : null)
const keep = (name, value) => writeFileSync(new URL(`${name}.json`, out), JSON.stringify(value, null, 1))

// The writer before, from git, with the rules it imports.
const commit = arg('--before') || 'HEAD'
for (const file of ['forms-writer.ts', 'cues.ts']) {
  const source = execFileSync('git', ['show', `${commit}:apps/web/netlify/functions/lib/${file}`], { cwd: new URL('..', import.meta.url), encoding: 'utf8', maxBuffer: 1 << 24 })
  writeFileSync(new URL(`before/${file}`, out), source)
}
const before = await import(new URL('before/forms-writer.ts', out))
const after = await import('../netlify/functions/lib/forms-writer.ts')

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
      }).catch(error => ({ ok: false, json: async () => ({ error: { message: error.message } }) }))
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
const textOf = reply => reply.content.filter(block => block.type === 'text').map(block => block.text).join('')
async function inTurn(items, run, at = 6) {
  let next = 0
  await Promise.all(Array.from({ length: at }, async () => { while (next < items.length) { const item = items[next++]; await run(item) } }))
}

// The words, picked by a hash of their id so every run has the same ones.
const STAGE = { verb: 'present', adjective: 'inflected', noun: 'plural' }
const PERSONAL = /(^|\s)[ולבמש]?(אבא|אמא|סבא|סבתא|אחי|אחותי|בעלי|אשתי)(\s|$)|(שלי|שלו|שלה|שלהם|שלך)(\s|$|[.,])|(ראש|יד|ידיים|רגל|גב|עיניים|שיער|בטן|כתף)(\s|$)/
async function sample() {
  const have = kept('sample')
  if (have) return have
  const client = new MongoClient(env.MONGODB_URI)
  await client.connect()
  const docs = await client.db(env.MONGODB_DB_NAME || 'mila').collection('vocab').find({}).toArray()
  await client.close()
  const kind = doc => { const pos = doc.partOfSpeech === 'expression' ? doc.head?.partOfSpeech : doc.partOfSpeech; return ['verb', 'adjective', 'noun'].includes(pos) ? pos : 'other' }
  const hash = doc => createHash('sha1').update(`writing:${doc.id}`).digest('hex')
  const seen = new Set()
  const sorted = docs.filter(doc => doc.lemma && doc.gloss).sort((a, b) => hash(a).localeCompare(hash(b)))
    .filter(doc => { const lemma = doc.lemma.replace(/[֑-ׇ]/g, ''); return !seen.has(lemma) && seen.add(lemma) })
  const chosen = []
  const pick = (set, test, n) => chosen.push(...sorted.filter(doc => test(doc) && !chosen.some(item => item.doc === doc)).slice(0, n).map(doc => ({ doc, set })))
  const meanings = doc => (doc.forms || []).filter(form => form.stage === 'meanings').length
  pick('personal', doc => (doc.forms || []).filter(form => PERSONAL.test(form.sentence || '')).length >= 2, 8)
  pick('several meanings', doc => meanings(doc) >= 2, 5)
  pick('verb', doc => kind(doc) === 'verb' && doc.partOfSpeech !== 'expression', 6)
  pick('expression', doc => doc.partOfSpeech === 'expression', 3)
  pick('adjective', doc => kind(doc) === 'adjective', 4)
  pick('noun', doc => kind(doc) === 'noun', 4)
  pick('other', doc => kind(doc) === 'other', 2)
  const words = chosen.map(({ doc, set }, n) => ({
    n, set, stages: ['meanings', ...(STAGE[kind(doc)] ? [STAGE[kind(doc)]] : []), ...(kind(doc) === 'verb' && n % 3 === 0 ? ['past'] : [])],
    entry: Object.fromEntries(['lemma', 'gloss', 'partOfSpeech', 'binyan', 'head', 'pattern', 'feminine', 'constructions', 'governs', 'encounters'].filter(key => doc[key] !== undefined).map(key => [key, doc[key]])),
  }))
  keep('sample', words)
  return words
}

// Each writer writes a word's stages in turn, as the app does.
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
        cards.push(...fresh.map(form => ({ word: word.n, by: name, ...form })))
      } catch (failure) { console.error(`${name} ${word.entry.lemma} ${stage}: ${failure.message}`) }
    }
    process.stdout.write('.')
  })
  keep(name, cards); keep('usage', usage)
  console.log(` ${name}: ${cards.length} cards`)
  return cards
}

const words = await sample()
console.log(`${words.length} words; before = ${commit}, after = working tree`)
const cardsBefore = await written('before', (entry, stage) => before.writeForms(entry, stage, asker('before write')))
const cardsAfter = await written('after', (entry, stage) => after.writeForms(entry, stage, asker('after write')))
const all = [...cardsBefore, ...cardsAfter]

// The card grade: a native editor's, with no word of which writer wrote a card, in a shuffled order.
const CARD_JUDGE = `You are a native Israeli Hebrew editor checking flashcards for an English-speaking learner. Each card is a Hebrew sentence (or phrase) using one form of a word, with its English translation; on some cards the learner sees the English and writes the Hebrew.

Grade each card as an Israeli editor would, changing only what an editor would really change. Hebrew often has more than one natural way to say a thing; a card that uses one of them is natural, even if you would have chosen another. In particular, both אבא and אבא שלי (and the like) are natural: bare for someone the listener knows, with שלי when telling someone else; neither is an error.

For each card:
- "naturalness": "natural" (an Israeli would plausibly say or write it so, in its context and register), "stiff" (correct, but an Israeli would clearly say it differently), "wrong" (an error, a sense the word doesn't have, or something no Israeli would say).
- "issues": what makes it stiff or wrong, from the list. Possession: "possessive-added" (של with a pronoun, or a suffix, that Hebrew would leave out, copied from English), "possessive-missing" (Hebrew needs to say whose and doesn't), "dative" (של or a possessive where Hebrew says it with לי/לו, as in נרדמה לי הרגל), "article" (a ה missing or added). Others: "calque", "preposition", "agreement", "sense", "register", "word-choice", "word-order", "grammar", "other". Empty when natural.
- "fix": the corrected Hebrew when not natural, else "".
- "comment": one short sentence when not natural, else "".
- "translation": whether the English says what the Hebrew says ("faithful", "loose", "wrong"); English adding "his" or "my" where Hebrew leaves it understood is faithful.
- "testedForm": whether the Hebrew uses the card's tested form ("yes") or another form of the word ("no").`
const cardSchema = { type: 'object', additionalProperties: false, required: ['cards'], properties: { cards: { type: 'array', items: { type: 'object', additionalProperties: false,
  required: ['card', 'naturalness', 'issues', 'fix', 'comment', 'translation', 'testedForm'],
  properties: { card: { type: 'integer' }, naturalness: { type: 'string', enum: ['natural', 'stiff', 'wrong'] },
    issues: { type: 'array', items: { type: 'string', enum: ['possessive-added', 'possessive-missing', 'dative', 'article', 'calque', 'preposition', 'agreement', 'sense', 'register', 'word-choice', 'word-order', 'grammar', 'other'] } },
    fix: { type: 'string' }, comment: { type: 'string' }, translation: { type: 'string', enum: ['faithful', 'loose', 'wrong'] }, testedForm: { type: 'string', enum: ['yes', 'no'] } } } } } }
const shuffled = (items, salt) => items.map((item, i) => ({ item, sort: createHash('sha1').update(`${salt}${i}${JSON.stringify(item).slice(0, 200)}`).digest('hex') })).sort((a, b) => a.sort.localeCompare(b.sort)).map(entry => entry.item)
let cardGrades = kept('cards')
if (!cardGrades) {
  cardGrades = []
  const order = shuffled(all, 'cards')
  const batches = []
  for (let i = 0; i < order.length; i += 20) batches.push(order.slice(i, i + 20))
  const judge = asker('card judge', 'medium')
  await inTurn(batches, async batch => {
    const prompt = batch.map((card, i) => `${i + 1}. word ${words[card.word].entry.lemma} · ${card.stage} ${card.slot} · tested form ${card.he}\n   Hebrew: ${card.sentence}\n   English: ${card.translation}`).join('\n')
    try {
      const grades = JSON.parse(textOf(await judge({ system: CARD_JUDGE, prompt, schema: cardSchema }))).cards
      batch.forEach((card, i) => { const grade = grades.find(item => item.card === i + 1); if (grade) cardGrades.push({ by: card.by, word: card.word, key: card.key, grade }) })
    } catch (failure) { console.error(`card judge: ${failure.message}`) }
    process.stdout.write('.')
  })
  keep('cards', cardGrades); keep('usage', usage)
  console.log(` graded ${cardGrades.length} cards`)
}

// The set grade: one word's cards from one writer, read together as a learner meets them.
const SET_JUDGE = `You are a native Israeli Hebrew teacher reviewing the practice cards an English-speaking learner gets for one Hebrew word: a few cards for its meanings and some for its forms, each a Hebrew sentence or phrase with its English. Judge what the set as a whole teaches about how the word is used.

- "usages": the distinct ways of using the word the set shows, each a few English words (a sense, a construction or collocation, a register, a kind of situation). Count what the learner would experience as different, not what is merely reworded: "the rain floods the streets" and "heavy rain may flood the streets tonight" are one usage.
- "repeats": pairs of cards that teach nearly the same thing (the same situation, collocation and construction, with only the person, tense or small details changed), by card number, each with a few words on what they share. Cards for different forms of a word naturally share its meaning; list only those whose whole context is close.
- "missing": up to three common, natural uses of the word (in the senses the set covers) that a learner would gain from and the set never shows, in a few words each, or none.
- "phrases": how many cards would teach the word as well or better as a short phrase or expression than as a full sentence (for example "a flood of complaints", "flooded with messages"), and which.`
const setSchema = { type: 'object', additionalProperties: false, required: ['usages', 'repeats', 'missing', 'phrases'], properties: {
  usages: { type: 'array', items: { type: 'string' } },
  repeats: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['a', 'b', 'shared'], properties: { a: { type: 'integer' }, b: { type: 'integer' }, shared: { type: 'string' } } } },
  missing: { type: 'array', items: { type: 'string' } },
  phrases: { type: 'array', items: { type: 'integer' } } } }
let setGrades = kept('sets')
if (!setGrades) {
  setGrades = []
  const sets = shuffled(['before', 'after'].flatMap(by => words.map(word => ({ by, word: word.n }))), 'sets')
  const judge = asker('set judge', 'medium')
  await inTurn(sets, async ({ by, word }) => {
    const cards = all.filter(card => card.by === by && card.word === word)
    if (!cards.length) return
    const entry = words[word].entry
    const prompt = [`Word: ${entry.lemma} — ${entry.gloss}`, ...cards.map((card, i) => `${i + 1}. ${card.stage} ${card.slot} (${card.en}): ${card.sentence} — ${card.translation}`)].join('\n')
    try { setGrades.push({ by, word, ...JSON.parse(textOf(await judge({ system: SET_JUDGE, prompt, schema: setSchema }))), cards: cards.length }) } catch (failure) { console.error(`set judge: ${failure.message}`) }
    process.stdout.write('.')
  })
  keep('sets', setGrades); keep('usage', usage)
  console.log(` graded ${setGrades.length} sets`)
}

// Counted from the Hebrew itself, beside the judge's grades.
const POSSESSIVE = /(^|\s)(שלי|שלך|שלו|שלה|שלנו|שלכם|שלכן|שלהם|שלהן)(?=$|\s|[.,!?])/
const FAMILY = /(^|\s)[ולבמש]?(אבא|אמא|סבא|סבתא|אחי|אחותי)(?=$|\s|[.,!?])/
const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '–')
const mean = list => (list.length ? (list.reduce((sum, n) => sum + n, 0) / list.length).toFixed(1) : '–')
const gradeOf = card => cardGrades.find(item => item.by === card.by && item.word === card.word && item.key === card.key)?.grade
function scores(cards) {
  const rated = cards.map(gradeOf).filter(Boolean)
  const count = test => rated.filter(test).length
  const has = issue => grade => grade.issues.includes(issue)
  return {
    cards: cards.length, natural: pct(count(grade => grade.naturalness === 'natural'), rated.length), stiff: pct(count(grade => grade.naturalness === 'stiff'), rated.length),
    wrong: pct(count(grade => grade.naturalness === 'wrong'), rated.length), possession: count(grade => grade.issues.some(issue => ['possessive-added', 'possessive-missing', 'dative', 'article'].includes(issue))),
    added: count(has('possessive-added')), missing: count(has('possessive-missing')), dative: count(has('dative')), article: count(has('article')),
    loose: pct(count(grade => grade.translation !== 'faithful'), rated.length), otherForm: count(grade => grade.testedForm === 'no'),
    withPossessive: pct(cards.filter(card => POSSESSIVE.test(card.sentence)).length, cards.length), family: pct(cards.filter(card => FAMILY.test(card.sentence)).length, cards.length),
    length: mean(cards.map(card => card.sentence.split(/\s+/).length)),
  }
}
const money = label => { const total = usage[label]; return total ? (total.input * PRICE.input + total.output * PRICE.output) / 1e6 : 0 }
const lines = ['# Card writing: before and after', '',
  `${words.length} words (${Object.entries(Object.groupBy(words, word => word.set)).map(([set, list]) => `${list.length} ${set}`).join(', ')}), each word's meanings and one form stage (verbs every third word also the past), written by the writer at ${commit} ("before") and the one in the working tree ("after"). Graded blind by a separate Claude judge (effort medium): every card on its own, and each word's cards as a set.`, '',
  '| | Cards | Natural | Stiff | Wrong | Possession issues (added / missing / dative / article) | Translation loose/wrong | Other form | With של+pronoun | Family word | Words per sentence |',
  '|---|---|---|---|---|---|---|---|---|---|---|']
for (const set of ['all', ...new Set(words.map(word => word.set))]) {
  lines.push(`| **${set === 'all' ? 'All words' : set}** | | | | | | | | | | |`)
  for (const by of ['before', 'after']) {
    const s = scores(all.filter(card => card.by === by && (set === 'all' || words[card.word].set === set)))
    lines.push(`| ${by} | ${s.cards} | ${s.natural} | ${s.stiff} | ${s.wrong} | ${s.possession} (${s.added} / ${s.missing} / ${s.dative} / ${s.article}) | ${s.loose} | ${s.otherForm} | ${s.withPossessive} | ${s.family} | ${s.length} |`)
  }
}
lines.push('', '| Sets | Words | Cards per word | Distinct usages per word | Repeated pairs per word | Words with a repeated pair | Cards better as a phrase |', '|---|---|---|---|---|---|---|')
for (const by of ['before', 'after']) {
  const list = setGrades.filter(item => item.by === by)
  lines.push(`| ${by} | ${list.length} | ${mean(list.map(item => item.cards))} | ${mean(list.map(item => item.usages.length))} | ${mean(list.map(item => item.repeats.length))} | ${pct(list.filter(item => item.repeats.length).length, list.length)} | ${pct(list.reduce((sum, item) => sum + item.phrases.length, 0), list.reduce((sum, item) => sum + item.cards, 0))} |`)
}
lines.push('', '| | Calls | Input tokens | Output tokens | Cost |', '|---|---|---|---|---|')
for (const label of ['before write', 'after write', 'card judge', 'set judge']) {
  const total = usage[label] ?? { calls: 0, input: 0, output: 0 }
  lines.push(`| ${label} | ${total.calls} | ${total.input} | ${total.output} | $${money(label).toFixed(2)} |`)
}
const issues = by => { const counts = {}; all.filter(card => card.by === by).map(gradeOf).forEach(grade => grade?.issues.forEach(issue => { counts[issue] = (counts[issue] || 0) + 1 })); return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([issue, n]) => `${issue} ${n}`).join(', ') }
lines.push('', 'Issues found:', ...['before', 'after'].map(by => `- ${by}: ${issues(by) || 'none'}`), '', '## Every word', '')
for (const word of words) {
  lines.push(`### ${word.entry.lemma} — ${word.entry.gloss} (${word.set})`)
  for (const by of ['before', 'after']) {
    const set = setGrades.find(item => item.by === by && item.word === word.n)
    const cards = all.filter(card => card.by === by && card.word === word.n)
    lines.push(`**${by}**${set ? ` · ${set.usages.length} usages: ${set.usages.join('; ')}${set.repeats.length ? ` · repeats: ${set.repeats.map(item => `${item.a}–${item.b} (${item.shared})`).join('; ')}` : ''}${set.missing.length ? ` · never shows: ${set.missing.join('; ')}` : ''}` : ''}`)
    cards.forEach((card, i) => {
      const grade = gradeOf(card)
      lines.push(`${i + 1}. \`${card.key}\` ${card.sentence} — ${card.translation}${grade && grade.naturalness !== 'natural' ? `  \n   _${grade.naturalness} (${grade.issues.join(', ')}): ${grade.comment}${grade.fix ? ` → ${grade.fix}` : ''}_` : ''}`)
    })
  }
  lines.push('')
}
writeFileSync(new URL('report.md', out), lines.join('\n'))
console.log(lines.slice(0, 40).join('\n'))

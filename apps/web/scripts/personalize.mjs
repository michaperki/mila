// The development harness for personalized card writing: what Mila thinks a learner knows, and
// (later) cards written for a learner compared with cards written as before. It only reads the
// database: nothing is saved to anyone's words, progress or study events. Runs from apps/web:
//
//   node --experimental-strip-types scripts/personalize.mjs profile [--word <lemma>] [--all]
//     The learner model on your saved words and study events (lib/learner.ts): the level it starts
//     from, how sure it is of each word (recognition and production, with an 80% range), what
//     evidence moved it, and grammar by stage and person. --word shows one word's evidence in full.
//   node --experimental-strip-types scripts/personalize.mjs level sample
//     Writes a vocabulary check: words from across the frequency list, with made-up words among
//     them, to mark [x] where you know the word (scripts/eval-out/personalize/level-check.md).
//   node --experimental-strip-types scripts/personalize.mjs level score
//     Reads the marked check and keeps the level it shows (level.json), which profile then uses.
//
//   node --experimental-strip-types scripts/personalize.mjs compare --words <lemma,lemma> [--stages meanings,form]
//       [--variants base,personal,stretch,beginner] [--go] [--budget 1]
//     Writes cards for the same words with the writer as it is (base) and told about the learner
//     (lib/profile.ts: personal without bringing in new words, stretch with, beginner as a learner
//     who knows only the 150 most common words), and reports each card's sentence with what its
//     other words are to the learner, and the cost. `form` is the word's first stage of forms.
//     Without --go it only shows the calls and their estimated cost; --budget (dollars) stops it
//     before a call that could pass it. The cards are written to eval-out, never to the database.
//
//   node --experimental-strip-types scripts/personalize.mjs outcomes
//     How cards written for the learner are going beside those written as before, in Study: cards
//     written and shown, what their other words were to the learner when written, words looked up
//     on them per showing, answers right (first answers, unprimed, by side), and the same cards
//     answered again days later. Few answers say little: read it as a trend over weeks.
//
// --user <id> picks the account (by default the one with the most saved words). Free except
// compare --go. Reads MONGODB_URI (and MONGODB_DB_NAME, ANTHROPIC_API_KEY) from apps/web/.env or
// the repository's .env.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'
import { LISTED, plainWord, rankOfForm, wordsRanked } from '../netlify/functions/lib/frequency.ts'
import { commonUpTo, lemmaKeyOf, learnerState, levelFromCheck, levelFromSaves } from '../netlify/functions/lib/learner.ts'
import { cardsOf, promptFor, schema, STAGES, SYSTEM, kindOfEntry, slotsOf } from '../netlify/functions/lib/forms-writer.ts'
import { learnerProfile, PERSONAL_WRITER as PERSONAL_WRITER_LABEL, PROFILE_VERSION, profileBlock, supportOf, supportOfCard } from '../netlify/functions/lib/profile.ts'

const envFile = [new URL('../.env', import.meta.url), new URL('../../../.env', import.meta.url)].find(url => existsSync(url) && /MONGODB_URI=/.test(readFileSync(url, 'utf8')))
const env = Object.fromEntries(readFileSync(envFile, 'utf8').split('\n')
  .map(line => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]))
const arg = name => { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1] }
const has = name => process.argv.includes(name)
const out = new URL('./eval-out/personalize/', import.meta.url)
mkdirSync(out, { recursive: true })
const [command, sub] = process.argv.slice(2).filter(item => !item.startsWith('--'))

// Made-up words for the vocabulary check, shaped like Hebrew words (none is on the list).
const MADE_UP = ['להתגזק', 'מטסף', 'תצטובת', 'קזפון', 'נגזוק', 'מתפסלג', 'שטפזה', 'להצטבק', 'מרגלוף', 'גזקני']
// Names and foreign words the list has (from subtitles), left out of the check when drawn.
const NOT_WORDS = new Set(['מרלון', 'בראד', 'ויליאם', 'טורנדו'])
// Opus 5.5 per million tokens, as lib/ai-usage.ts prices it (not imported: it needs the database).
const PRICE = { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 }
const costOf = usage => (usage.input_tokens * PRICE.input + (usage.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite
  + (usage.cache_read_input_tokens ?? 0) * PRICE.cacheRead + usage.output_tokens * PRICE.output) / 1_000_000
// What a card's other words are, against the learner's real profile: on familiar ground (recalled,
// being learned, or among the 3,000 most common words) or not.
const FAMILIAR = new Set(['steady', 'learning', 'common'])

if (command === 'level' && sub === 'sample') sampleCheck()
else if (command === 'level' && sub === 'score') scoreCheck()
else if (command === 'profile') await profile()
else if (command === 'compare') await compare()
else if (command === 'outcomes') await outcomes()
else console.log('Use: profile [--word <lemma>] [--all] | level sample | level score | compare --words …  (see the top of scripts/personalize.mjs)')

// Eight words from each of seven stretches of the list, from the most common to the 30,000th,
// taken a fixed way so the same check comes out each time, with the made-up words mixed in.
function sampleCheck() {
  const bands = [[1, 250], [251, 1000], [1001, 2500], [2501, 5000], [5001, 10000], [10001, 18000], [18001, LISTED]]
  const picked = []
  let seed = 7
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (const [from, to] of bands) {
    const words = wordsRanked(from, to)
    const chosen = new Set()
    while (chosen.size < 8) {
      const i = Math.floor(random() * words.length)
      if (!NOT_WORDS.has(words[i])) chosen.add(i)
    }
    for (const i of chosen) picked.push({ word: words[i], rank: from + i })
  }
  for (const word of MADE_UP) if (rankOfForm(word)) throw new Error(`${word} is a listed word, not a made-up one`)
  const items = [...picked, ...MADE_UP.map(word => ({ word, madeUp: true }))].map(item => ({ ...item, order: random() })).sort((a, b) => a.order - b.order)
  writeFileSync(new URL('level-items.json', out), JSON.stringify(items.map(({ order: _order, ...item }) => item), null, 1))
  const lines = items.map((item, i) => `${String(i + 1).padStart(2)}. [ ] ${item.word}`)
  writeFileSync(new URL('level-check.md', out), `# Vocabulary check

Put an x in the brackets, [x], beside each word you know: you'd understand it if you met it on
its own. Leave the rest. Some of these are made-up words. Don't look anything up. If a word is a
name or a foreign word, put a - instead, [-], and it is left out.

${lines.join('\n')}
`)
  console.log(`Wrote ${new URL('level-check.md', out).pathname} (${items.length} words). Mark it, then run: level score`)
}

function scoreCheck() {
  const items = JSON.parse(readFileSync(new URL('level-items.json', out), 'utf8'))
  const marked = readFileSync(new URL('level-check.md', out), 'utf8').split('\n').map(line => line.match(/^\s*(\d+)\.\s*\[(.)\]/)).filter(Boolean)
  if (marked.length !== items.length) throw new Error('The check has changed since it was written; write it again with level sample')
  const known = marked.map(([, , mark]) => mark.trim() !== '' && mark !== '-')
  const skipped = new Set(marked.flatMap(([, , mark], i) => (mark === '-' ? [i] : [])))
  const answers = items.flatMap((item, i) => (item.madeUp || skipped.has(i) ? [] : [{ rank: item.rank, known: known[i] }]))
  const madeUp = items.flatMap((item, i) => (item.madeUp ? [{ known: known[i] }] : []))
  const level = levelFromCheck(answers, madeUp)
  writeFileSync(new URL('level.json', out), JSON.stringify({ ...level, at: Date.now() }, null, 1))
  console.log(`Level: about the ${level.words} most common words (80% range ${level.low}–${level.high}). ${level.basis}.`)
  console.log(`Words up to rank ~${commonUpTo(level)} are taken to be known unless something says otherwise.`)
  const bands = [[1, 1000], [1001, 5000], [5001, 18000], [18001, LISTED]]
  for (const [from, to] of bands) {
    const here = answers.filter(item => item.rank >= from && item.rank <= to)
    console.log(`  ranks ${from}–${to}: ${here.filter(item => item.known).length}/${here.length} known`)
  }
}

async function profile() {
  const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
  try {
    const db = client.db(env.MONGODB_DB_NAME || 'mila')
    const userId = arg('--user') ?? (await db.collection('vocab').aggregate([{ $group: { _id: '$userId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 }]).toArray())[0]?._id
    const entries = await db.collection('vocab').find({ userId }).project({ _id: 0, userId: 0, 'encounters.analysis': 0, 'forms.glosses': 0 }).toArray()
    const events = await db.collection('studyEvents').find({ userId }).project({ _id: 0, userId: 0 }).toArray()
    const checked = existsSync(new URL('level.json', out)) ? JSON.parse(readFileSync(new URL('level.json', out), 'utf8')) : null
    const level = checked ?? levelFromSaves(entries)
    const state = learnerState(entries, events, level)
    writeFileSync(new URL('profile-real.json', out), JSON.stringify(state, null, 1))
    const pct = estimate => `${Math.round(estimate.p * 100)}% (${Math.round(estimate.low * 100)}–${Math.round(estimate.high * 100)})`
    const row = word => `${word.lemma.padEnd(14)} ${String(word.rank ?? '—').padStart(5)}  read ${pct(word.recognition).padEnd(13)} say ${pct(word.production).padEnd(13)} ${word.answers} answers  ${word.gloss ?? ''}`.slice(0, 140)

    if (arg('--word')) {
      const key = arg('--word').normalize('NFD').replace(/[֑-ׇ]/g, '')
      const word = state.words.find(item => item.key === key || item.lemma === arg('--word'))
      if (!word) { console.log('Not found among saved or looked-up words.'); return }
      console.log(row(word), `\nband: ${word.band}\nevidence (newest first):`)
      for (const item of word.evidence) console.log(`  ${new Date(item.at).toISOString().slice(0, 10)}  ${item.knew ? '+' : '−'} ${item.weight.toFixed(2)} ${item.channel.padEnd(11)} ${item.what}${item.uncertain ? '  [noted, not counted]' : ''}`)
      return
    }
    console.log(`Model ${state.version}, ${entries.length} saved words, ${events.length} study and reading events.`)
    console.log(`Level: about the ${level.words} most common words (80% range ${level.low}–${level.high}); ${level.basis}.`)
    console.log(`Cards overall: ${pct(state.overall)} known, from ${state.overall.evidence} answers' worth.\n`)
    const bands = ['known', 'acquiring', 'met', 'unfamiliar']
    console.log('Words by band:', bands.map(band => `${band} ${state.words.filter(word => word.band === band).length}`).join(' · '))
    const show = has('--all') ? Infinity : 12
    for (const band of bands) {
      const words = state.words.filter(word => word.band === band).sort((a, b) => b.lastAt - a.lastAt)
      if (!words.length) continue
      console.log(`\n${band} (most recent first${words.length > show ? `, ${show} of ${words.length}` : ''}):`)
      for (const word of words.slice(0, show)) console.log('  ' + row(word))
    }
    console.log('\nGrammar (stage, person or number) with answers, weakest first:')
    for (const skill of state.grammar) console.log(`  ${skill.label.padEnd(28)} ${pct(skill.estimate).padEnd(13)} ${skill.answers} answers over ${skill.words.length} words`)
    if (!state.grammar.length) console.log('  none yet')
    console.log(`\nFull state: ${new URL('profile-real.json', out).pathname}`)
  } finally { await client.close() }
}

async function compare() {
  const wanted = (arg('--words') ?? '').split(',').map(word => word.trim()).filter(Boolean)
  const stages = (arg('--stages') ?? 'meanings,form').split(',')
  const variants = (arg('--variants') ?? 'base,personal,stretch').split(',')
  const budget = Number(arg('--budget') ?? 1)
  if (!wanted.length) { console.log('Give --words <lemma,lemma>: saved words, in any spelling.'); return }
  const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
  try {
    const db = client.db(env.MONGODB_DB_NAME || 'mila')
    const userId = arg('--user') ?? (await db.collection('vocab').aggregate([{ $group: { _id: '$userId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 }]).toArray())[0]?._id
    const entries = await db.collection('vocab').find({ userId }).project({ _id: 0, userId: 0, 'encounters.analysis': 0 }).toArray()
    const events = await db.collection('studyEvents').find({ userId, type: { $in: ['answer', 'lookup', 'explained'] } }).project({ _id: 0, userId: 0 }).toArray()
    const profile = learnerProfile(entries, events)
    // A learner who knows only the most common words, and has studied nothing.
    const beginner = { version: `${PROFILE_VERSION}-beginner`, words: new Map(wordsRanked(1, 150).map(word => [lemmaKeyOf(word), { key: lemmaKeyOf(word), lemma: word, place: 'steady', lastAt: 0 }])) }
    // Card writing since glosses; the cue checks, logged as forms too, are the small ones.
    const recent = await db.collection('aiUsage').find({ userId, feature: 'forms', outputTokens: { $gt: 800 }, at: { $gt: new Date('2026-11-14T07:00:00Z') } }).toArray()
    const average = recent.length ? recent.reduce((sum, item) => sum + item.outputTokens, 0) / recent.length : 2000

    const calls = []
    for (const lemma of wanted) {
      const entry = entries.find(item => lemmaKeyOf(item.lemmaPlain || item.lemma) === lemmaKeyOf(lemma))
      if (!entry) { console.log(`Not saved: ${lemma}`); continue }
      for (const asked of stages) {
        const stage = asked === 'form' ? Object.keys(STAGES[kindOfEntry(entry)]).find(key => key !== 'meanings') : asked
        if (!stage) continue
        // Written as if for the first time: without this stage's cards.
        const fresh = { ...entry, forms: (entry.forms || []).filter(form => form.stage !== stage) }
        const slots = slotsOf(fresh, stage)
        for (const variant of variants) {
          const learner = variant === 'base' ? '' : profileBlock(variant === 'beginner' ? beginner : profile, fresh, stage, { stretch: variant !== 'personal' })
          calls.push({ lemma: plainWord(entry.lemma), stage, variant, slots, prompt: promptFor(fresh, stage, slots, [], learner) })
        }
      }
    }
    // Hebrew runs about 2.5 characters a token; the system prompt is read from the cache after the first call.
    const estimate = call => (call.prompt.length / 2.5 * PRICE.input + average * 1.15 * PRICE.output) / 1_000_000
    const total = calls.reduce((sum, call) => sum + estimate(call), 0) + SYSTEM.length / 2.5 * PRICE.cacheWrite / 1_000_000
    console.log(`${calls.length} calls (${[...new Set(calls.map(call => call.lemma))].join(', ')} × ${stages.join(', ')} × ${variants.join(', ')}), estimated $${total.toFixed(2)} (budget $${budget.toFixed(2)}); recent card writing averages ${Math.round(average)} output tokens.`)
    const sample = calls.find(call => call.variant !== 'base')
    if (!has('--go')) { if (sample) console.log(`\nThe learner block as sent for ${sample.lemma} (${sample.variant}):\n${sample.prompt.slice(sample.prompt.indexOf('About this learner'))}`); console.log('\nAdd --go to run.'); return }
    if (!env.ANTHROPIC_API_KEY) { console.log('No ANTHROPIC_API_KEY in .env.'); return }

    let spent = 0
    const results = []
    for (const call of calls) {
      if (spent + estimate(call) * 1.5 > budget) { console.log(`Stopping before ${call.lemma} ${call.stage} ${call.variant}: $${spent.toFixed(3)} spent, budget $${budget}.`); break }
      const started = Date.now()
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-opus-5-5', max_tokens: 8000, output_config: { effort: 'low', format: { type: 'json_schema', schema } },
          system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: call.prompt }],
        }),
      })
      const reply = await response.json()
      if (!response.ok) { console.log(`${call.lemma} ${call.stage} ${call.variant}: ${response.status} ${reply.error?.message ?? ''}`); break }
      const cost = costOf(reply.usage)
      spent += cost
      const text = reply.content.filter(block => block.type === 'text').map(block => block.text).join('')
      const { forms, rejected } = cardsOf(JSON.parse(text).forms, call.stage, call.slots)
      results.push({ ...call, prompt: undefined, ms: Date.now() - started, cost, usage: reply.usage, rejected, forms })
      console.log(`${call.lemma} ${call.stage} ${call.variant}: ${forms.length} cards, $${cost.toFixed(3)}, ${((Date.now() - started) / 1000).toFixed(1)}s`)
    }
    const run = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    writeFileSync(new URL(`compare-${run}.json`, out), JSON.stringify(results, null, 1))
    writeFileSync(new URL(`compare-${run}.md`, out), compareReport(results, profile, spent))
    console.log(`\nSpent $${spent.toFixed(3)}. Report: ${new URL(`compare-${run}.md`, out).pathname}`)
  } finally { await client.close() }
}

function compareReport(results, profile, spent) {
  const lines = [`# Card writing compared (${new Date().toISOString().slice(0, 16)}, $${spent.toFixed(3)})`, '',
    'Each card\'s other words against the real profile: steady (recalled), learning, shaky (looked up lately), ahead (saved, not studied), common (top 3,000), uncommon (to 10,000), rare.', '']
  const variants = [...new Set(results.map(item => item.variant))]
  const summary = variants.map(variant => {
    const cards = results.filter(item => item.variant === variant).flatMap(item => item.forms)
    const placeOf = (card, gloss) => supportOf(gloss.lemma, profile, card.sentence.split(/\s+/)[gloss.i])
    const places = cards.flatMap(card => (card.glosses || []).filter(gloss => gloss.lemma).map(gloss => placeOf(card, gloss)))
    const off = cards.map(card => (card.glosses || []).filter(gloss => gloss.lemma && !FAMILIAR.has(placeOf(card, gloss))).length)
    const lemmas = cards.flatMap(card => (card.glosses || []).map(gloss => lemmaKeyOf(gloss.lemma)))
    const listed = lemmas.filter(lemma => ['steady', 'learning'].includes(profile.words.get(lemma)?.place))
    const of = place => places.filter(item => item === place).length
    return `| ${variant} | ${cards.length} | ${(places.length / (cards.length || 1)).toFixed(1)} | ${Math.round(100 * places.filter(item => FAMILIAR.has(item)).length / (places.length || 1))}% | ${(off.reduce((a, b) => a + b, 0) / (cards.length || 1)).toFixed(2)} | ${off.filter(n => n === 0).length}/${off.filter(n => n === 1).length}/${off.filter(n => n >= 2).length} | ${of('steady')}/${of('learning')} (${new Set(listed).size} distinct) | ${of('ahead')} | ${of('shaky')} | ${of('rare')} | $${results.filter(item => item.variant === variant).reduce((sum, item) => sum + item.cost, 0).toFixed(3)} | ${(results.filter(item => item.variant === variant).reduce((sum, item) => sum + item.ms, 0) / 1000 / (results.filter(item => item.variant === variant).length || 1)).toFixed(1)}s |`
  })
  lines.push('| variant | cards | other words / card | on familiar ground | off it / card | cards with 0/1/2+ off | steady/learning used | ahead | shaky | rare | cost | time / call |', '|---|---|---|---|---|---|---|---|---|---|---|---|', ...summary, '')
  for (const lemma of [...new Set(results.map(item => item.lemma))]) {
    for (const stage of [...new Set(results.filter(item => item.lemma === lemma).map(item => item.stage))]) {
      lines.push(`## ${lemma} · ${stage}`, '')
      for (const item of results.filter(result => result.lemma === lemma && result.stage === stage)) {
        lines.push(`**${item.variant}**${item.rejected.length ? ` (${item.rejected.length} rejected for agreement)` : ''}`, '')
        for (const card of item.forms) {
          const words = (card.glosses || []).filter(gloss => gloss.lemma).map(gloss => { const place = supportOf(gloss.lemma, profile, card.sentence.split(/\s+/)[gloss.i]); return FAMILIAR.has(place) ? gloss.lemma : `**${gloss.lemma}** (${place})` })
          lines.push(`- ${card.slot}: ${card.sentence} — ${card.translation}  \n  _${card.usage ?? ''}_ · ${words.join(', ')} · ${JSON.stringify(supportOfCard(card.glosses, profile, card.sentence))}`)
        }
        lines.push('')
      }
    }
  }
  return lines.join('\n')
}

async function outcomes() {
  const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
  try {
    const db = client.db(env.MONGODB_DB_NAME || 'mila')
    const userId = arg('--user') ?? (await db.collection('vocab').aggregate([{ $group: { _id: '$userId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 }]).toArray())[0]?._id
    const entries = await db.collection('vocab').find({ userId }).project({ id: 1, 'forms.key': 1, 'forms.writer': 1, 'forms.support': 1, 'forms.variants.writer': 1, 'forms.variants.support': 1, 'forms.variants.why': 1 }).toArray()
    const cardOf = new Map(entries.flatMap(entry => (entry.forms || []).map(form => [`${entry.id}:${form.key}`, form])))
    // Since the writers were split: each showing and answer by the writer of the sentence shown
    // (the event says, or the card's own), lookups on a card by the showing they follow.
    const events = await db.collection('studyEvents').find({ userId, at: { $gt: Date.parse('2026-11-15T06:30:00Z') }, type: { $in: ['show', 'answer', 'lookup'] } }).sort({ at: 1 }).toArray()
    const writerOf = event => event.writer ?? cardOf.get(event.key)?.writer
    const shownBy = new Map()
    for (const event of events) if (event.type === 'show') shownBy.set(event.key, writerOf(event))
    const pct = (part, all) => (all ? `${Math.round(100 * part / all)}% (${part}/${all})` : '—')
    const right = list => list.filter(answer => answer.knew).length
    console.log('Since the writers were split (2026-11-15). Fewer than about 50 answers a writer says little; read it as a trend over weeks.\n')
    for (const writer of ['base', PERSONAL_WRITER_LABEL]) {
      const mine = events.filter(event => (event.type === 'lookup' ? event.key && shownBy.get(event.key) === writer : writerOf(event) === writer))
      const shows = mine.filter(event => event.type === 'show')
      const cards = mine.filter(event => event.type === 'answer' && event.exercise !== 'choice' && !event.primed)
      const first = new Map(); for (const answer of cards) if (!first.has(answer.key)) first.set(answer.key, answer)
      const later = cards.filter(answer => answer.at - first.get(answer.key).at > 2 * 86_400_000)
      const support = {}
      for (const [, form] of cardOf) for (const item of [form, ...(form.variants || [])]) if (item.writer === writer) for (const [place, n] of Object.entries(item.support || {})) support[place] = (support[place] ?? 0) + n
      console.log(`${writer}: ${shows.length} shown (${new Set(shows.map(show => show.key)).size} cards), ${shows.filter(show => show.variant).length} of them new sentences on older cards`)
      console.log(`  other words of its sentences when written: ${Object.entries(support).map(([place, n]) => `${place} ${n}`).join(', ') || '—'}`)
      console.log(`  words looked up on them: ${shows.length ? (mine.filter(event => event.type === 'lookup').length / shows.length).toFixed(2) : '—'} a showing`)
      console.log(`  flashcards, unprimed: ${pct(right(cards), cards.length)}; first answers ${pct(right([...first.values()]), first.size)}`)
      console.log(`    from the Hebrew ${pct(right(cards.filter(a => a.front === 'he')), cards.filter(a => a.front === 'he').length)}, from the English ${pct(right(cards.filter(a => a.front === 'en')), cards.filter(a => a.front === 'en').length)}`)
      console.log(`  answered again 2+ days after their first answer: ${pct(right(later), later.length)}`)
    }
    // Hints (mobile lib/hints.ts): words of a card's sentence tapped on its question side before
    // answering. Cards answered with them apart from those without, and the card's next answer on
    // a later day: whether help with the words around it left the word itself learned.
    const hints = events.filter(event => event.type === 'lookup' && event.hint)
    const hintedAnswers = events.filter(event => event.type === 'answer' && !event.revised && Array.isArray(event.hints))
    const withHints = hintedAnswers.filter(a => a.hints.length), withoutHints = hintedAnswers.filter(a => !a.hints.length)
    const laterOf = answer => events.find(other => other.type === 'answer' && other.key === answer.key && other.at - answer.at > 12 * 3_600_000)
    if (hintedAnswers.length) {
      console.log(`\nHints: ${hints.length} on ${new Set(hints.map(h => `${h.session}:${h.position}`)).size} cards (${hints.filter(h => h.from === 'quick').length} from quick meanings); of saved words ${hints.filter(h => h.saved).length}`)
      const english = hintedAnswers.filter(a => a.front === 'en'), shown = english.filter(a => a.context)
      console.log(`  English first: Hebrew sentence shown on ${shown.length} of ${english.length}; right with it ${pct(right(shown), shown.length)}, without ${pct(right(english.filter(a => !a.context)), english.length - shown.length)}`)
      console.log(`  answered with hints ${pct(right(withHints), withHints.length)}, without ${pct(right(withoutHints), withoutHints.length)}; next answer a later day after hints ${pct(right(withHints.map(laterOf).filter(Boolean)), withHints.map(laterOf).filter(Boolean).length)}`)
    }
    const choices = events.filter(event => event.type === 'answer' && event.exercise === 'choice')
    console.log(`\nFill in the blank: ${pct(right(choices), choices.length)} right; the word ${pct(right(choices.filter(c => c.tests === 'word')), choices.filter(c => c.tests === 'word').length)}, its form ${pct(right(choices.filter(c => c.tests === 'form')), choices.filter(c => c.tests === 'form').length)}`)
    for (const choice of choices.filter(c => !c.knew).slice(-8)) console.log(`  chose ${choice.chosen} for ${choice.answer} (${choice.lemma}, ${choice.tests})`)
    // Which sentence Study chose and why (mobile lib/forms.ts sentenceFor), from when it began
    // saying: answers on it, apart when primed (just after its word: not what is remembered), and
    // the card's next answer on a later day, unprimed (what stayed, or carried to the next sentence).
    const answers = events.filter(event => event.type === 'answer' && event.sentence && !event.revised)
    const next = answer => answers.find(other => other.key === answer.key && other.at - answer.at > 12 * 3_600_000 && !other.primed)
    const groups = new Map()
    for (const answer of answers) {
      const name = `${answer.sentence}${answer.sentenceNew ? ', new to the learner' : ''} · ${answer.exercise === 'choice' ? 'choice' : 'flashcard'}`
      ;(groups.get(name) ?? groups.set(name, []).get(name)).push(answer)
    }
    console.log(`\nSentences as Study chose them (${answers.length} answers):`)
    for (const [name, list] of [...groups.entries()].sort()) {
      const unprimed = list.filter(a => !a.primed), primed = list.filter(a => a.primed), later = list.map(next).filter(Boolean)
      console.log(`  ${name}: unprimed ${pct(right(unprimed), unprimed.length)}, primed ${pct(right(primed), primed.length)}; next answer a later day ${pct(right(later), later.length)}`)
    }
    const why = events.filter(event => event.type === 'show' && event.exerciseWhy)
    const counts = {}; for (const show of why) counts[show.exerciseWhy] = (counts[show.exerciseWhy] ?? 0) + 1
    console.log(`How cards were asked: ${Object.entries(counts).map(([name, n]) => `${name} ${n}`).join(', ') || '—'}`)
    const written = entries.flatMap(entry => (entry.forms || []).flatMap(form => form.variants || [])).filter(item => item.why)
    const reasons = {}; for (const item of written) reasons[item.why] = (reasons[item.why] ?? 0) + 1
    console.log(`New sentences written, by why: ${Object.entries(reasons).map(([name, n]) => `${name} ${n}`).join(', ') || '—'}`)
  } finally { await client.close() }
}

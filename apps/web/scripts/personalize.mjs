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
// --user <id> picks the account (by default the one with the most saved words). Free: no AI calls.
// Reads MONGODB_URI (and MONGODB_DB_NAME) from apps/web/.env or the repository's .env.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'
import { LISTED, rankOfForm, wordsRanked } from '../netlify/functions/lib/frequency.ts'
import { commonUpTo, learnerState, levelFromCheck, levelFromSaves } from '../netlify/functions/lib/learner.ts'

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

if (command === 'level' && sub === 'sample') sampleCheck()
else if (command === 'level' && sub === 'score') scoreCheck()
else if (command === 'profile') await profile()
else console.log('Use: profile [--word <lemma>] [--all] | level sample | level score  (see the top of scripts/personalize.mjs)')

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

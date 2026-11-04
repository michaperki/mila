// What Study showed and how it was answered, from the study events the app logs
// (apps/mobile/src/lib/study-log.ts): `node scripts/study-events.mjs [days] [email]` (the last
// `days`, 14 by default; the account with the most events unless an email is given). For each
// session: cards shown, words, the most one word was shown, new words and answers. Then answers
// by what came before them: primed (just after the word's Hebrew was shown, lib/forms.ts
// isPrimed), recalled later in the same session (the word shown earlier, not primed), and a
// word's first in the session, split by whether it was last answered on an earlier day (delayed
// recall) or today; each by kind of card and by which side came first. Reads MONGODB_URI /
// MONGODB_DB_NAME from apps/web/.env (or the environment).
import { readFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')
  .map(line => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]))
const days = Number(process.argv[2]) || 14
const email = process.argv[3]
const since = Date.now() - days * 86400000
const dayOf = at => new Date(at).toLocaleDateString('en-CA')
const pct = (right, all) => (all ? `${Math.round((100 * right) / all)}% of ${all}` : '-')

const client = new MongoClient(process.env.MONGODB_URI || env.MONGODB_URI)
try {
  await client.connect()
  const db = client.db(process.env.MONGODB_DB_NAME || env.MONGODB_DB_NAME || 'mila')
  const events = db.collection('studyEvents')
  let userId
  if (email) userId = (await db.collection('users').findOne({ email }))?.userId
  else userId = (await events.aggregate([{ $match: { at: { $gte: since } } }, { $group: { _id: '$userId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 }]).toArray())[0]?._id
  if (!userId) { console.log('No study events in that time.'); process.exit(0) }
  const all = await events.find({ userId, at: { $gte: since } }).sort({ session: 1, seq: 1 }).toArray()
  const sessions = new Map()
  for (const event of all) (sessions.get(event.session) ?? sessions.set(event.session, []).get(event.session)).push(event)

  console.log(['day', 'start', 'minutes', 'shown', 'words', 'most of one word', 'new words', 'answered', 'knew'].join('\t'))
  const classes = new Map()
  const count = (name, knew) => { const item = classes.get(name) ?? { right: 0, all: 0 }; item.all++; if (knew) item.right++; classes.set(name, item) }
  for (const list of [...sessions.values()].sort((a, b) => a[0].at - b[0].at)) {
    const shows = list.filter(event => event.type === 'show')
    const answers = list.filter(event => event.type === 'answer' && !event.revised)
    const perWord = new Map()
    for (const show of shows) perWord.set(show.wordId, (perWord.get(show.wordId) || 0) + 1)
    const fresh = new Set(shows.filter(show => String(show.why || '').startsWith('new word')).map(show => show.wordId))
    console.log([dayOf(list[0].at), new Date(list[0].at).toTimeString().slice(0, 5), Math.round((list.at(-1).at - list[0].at) / 60000), shows.length, perWord.size,
      Math.max(0, ...perWord.values()), fresh.size, answers.length, answers.filter(event => event.knew).length].join('\t'))
    // Each answer with the show it answers (same position, latest before it).
    for (const answer of answers) {
      const show = shows.filter(item => item.position === answer.position && item.seq < answer.seq).at(-1)
      if (!show) continue
      const before = show.wordShown
      const when = answer.primed ? 'primed' : before ? 'later in the session'
        : show.wordLastStudied && dayOf(show.wordLastStudied) !== dayOf(show.at) ? 'first in session, last studied another day'
          : show.wordLastStudied ? 'first in session, studied earlier today' : 'first time ever'
      count(when, answer.knew)
      count(`${when} · ${answer.kind} card · ${show.front === 'en' ? 'English' : 'Hebrew'} first`, answer.knew)
    }
  }
  console.log(`\n${sessions.size} sessions, ${all.filter(event => event.type === 'show').length} cards shown in the last ${days} days\n\nKnew it, by what came before the answer:`)
  for (const [name, { right, all: n }] of [...classes.entries()].sort()) console.log(`${name.includes(' · ') ? '    ' : ''}${name.padEnd(name.includes(' · ') ? 66 : 70)} ${pct(right, n)}`)
} finally { await client.close() }

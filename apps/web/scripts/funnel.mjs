// How far each account has got through Mila's first loop: `node scripts/funnel.mjs [days]`
// (accounts made in the last `days`, all of them by default). Read from what is already stored:
// texts (a passage of their own, not a starter), aiUsage (words looked up), vocab (words saved),
// activity (sentences read, cards studied, days active). Reads MONGODB_URI / MONGODB_DB_NAME
// from apps/web/.env (or the environment).
import { readFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')
  .map(line => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]))
const uri = process.env.MONGODB_URI || env.MONGODB_URI
const days = Number(process.argv[2]) || 0
const STEPS = ['account', 'read', 'looked up', 'saved', 'studied', 'came back']

const client = new MongoClient(uri)
try {
  await client.connect()
  const db = client.db(process.env.MONGODB_DB_NAME || env.MONGODB_DB_NAME || 'mila')
  const since = days ? new Date(Date.now() - days * 86400000).toISOString() : ''
  const users = await db.collection('users').find(since ? { createdAt: { $gte: since } } : {}).project({ _id: 0, userId: 1, email: 1, createdAt: 1 }).sort({ createdAt: 1 }).toArray()
  const ids = users.map(user => user.userId)
  const byUser = rows => new Map(rows.map(({ _id, ...rest }) => [_id, rest]))
  const [own, lookups, saved, activity, aiDays] = await Promise.all([
    db.collection('texts').aggregate([{ $match: { userId: { $in: ids }, starter: { $ne: true } } }, { $group: { _id: '$userId', n: { $sum: 1 } } }]).toArray(),
    db.collection('aiUsage').aggregate([{ $match: { userId: { $in: ids }, feature: { $in: ['word', 'glosses'] } } }, { $group: { _id: '$userId', n: { $sum: 1 } } }]).toArray(),
    db.collection('vocab').aggregate([{ $match: { userId: { $in: ids } } }, { $group: { _id: '$userId', n: { $sum: 1 } } }]).toArray(),
    db.collection('activity').aggregate([{ $match: { userId: { $in: ids } } }, { $group: { _id: '$userId', sentences: { $sum: '$sentences' }, cards: { $sum: '$cards' }, days: { $addToSet: '$day' } } }]).toArray(),
    db.collection('aiUsage').aggregate([{ $match: { userId: { $in: ids } } }, { $group: { _id: '$userId', days: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$at' } } } } }]).toArray(),
  ].map(promise => promise.then(byUser)))

  const totals = STEPS.map(() => 0)
  console.log(['created', 'email', ...STEPS].join('\t'))
  for (const user of users) {
    const act = activity.get(user.userId)
    const active = new Set([...(act?.days || []), ...(aiDays.get(user.userId)?.days || []), user.createdAt.slice(0, 10)])
    const reached = [
      true,
      !!own.get(user.userId) || (act?.sentences || 0) > 0,
      !!lookups.get(user.userId),
      !!saved.get(user.userId),
      (act?.cards || 0) > 0,
      active.size > 1,
    ]
    reached.forEach((yes, i) => { if (yes) totals[i]++ })
    console.log([user.createdAt.slice(0, 10), user.email, ...reached.map(yes => (yes ? '✓' : '·'))].join('\t'))
  }
  console.log(`\n${users.length} accounts${days ? ` made in the last ${days} days` : ''}`)
  STEPS.forEach((step, i) => console.log(`${step.padEnd(10)} ${String(totals[i]).padStart(4)}`))
} finally { await client.close() }

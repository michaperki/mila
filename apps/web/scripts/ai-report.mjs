// What Mila's AI work costs and whether what it makes gets used, for developers (docs/architecture.md):
// `node scripts/ai-report.mjs [days] [email]` (the last `days`, 30 by default; usage for every
// account, content use for the account with the most saved words unless an email is given).
// Read-only: it reads aiUsage, aiCache, vocab and studyEvents and spends nothing.
// - Requests by feature and provider: calls, cost, cost a call, latency (p50/p90), tokens, how
//   much of the prompt was read from Anthropic's prompt cache or written to it, and answers served
//   from Mila's own cache (lib/ai-cache.ts) at no cost.
// - Prompt cache writes after a gap of more than 5 minutes (the cache's life): what a longer-lived
//   cache could save.
// - Content use: cards and new sentences written, and how many were ever answered or shown.
// - The size of the word list as the app fetches it.
// Reads MONGODB_URI / MONGODB_DB_NAME from apps/web/.env (or the environment).
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { MongoClient } from 'mongodb'

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')
  .map(line => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]))
const days = Number(process.argv[2]) || 30
const email = process.argv[3]
const since = new Date(Date.now() - days * 86_400_000)
const quantile = (values, q) => { const sorted = values.filter(value => value != null).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) * q)] : 0 }
const pct = (part, all) => (all ? `${Math.round((100 * part) / all)}%` : '-')

const client = new MongoClient(process.env.MONGODB_URI || env.MONGODB_URI)
try {
  await client.connect()
  const db = client.db(process.env.MONGODB_DB_NAME || env.MONGODB_DB_NAME || 'mila')
  const usage = await db.collection('aiUsage').find({ at: { $gte: since } }).sort({ at: 1 }).toArray()
  const groups = new Map()
  for (const row of usage) { const name = `${row.feature}\t${row.provider}`; (groups.get(name) ?? groups.set(name, []).get(name)).push(row) }
  const sum = (rows, field) => rows.reduce((total, row) => total + (row[field] || 0), 0)
  console.log(`AI requests in the last ${days} days, every account ($${sum(usage, 'cost').toFixed(2)} in all)\n`)
  console.log(['feature', 'provider', 'calls', 'cost $', '$ a call', 'p50 ms', 'p90 ms', 'in', 'out', 'cache read', 'cache write'].join('\t'))
  for (const [name, rows] of [...groups.entries()].sort((a, b) => sum(b[1], 'cost') - sum(a[1], 'cost'))) {
    const avg = field => Math.round(sum(rows, field) / rows.length)
    console.log([name, rows.length, sum(rows, 'cost').toFixed(2), (sum(rows, 'cost') / rows.length).toFixed(4), quantile(rows.map(row => row.ms), 0.5), quantile(rows.map(row => row.ms), 0.9),
      avg('inputTokens'), avg('outputTokens'), avg('cacheReadTokens'), avg('cacheWriteTokens')].join('\t'))
  }

  console.log('\nPrompt cache writes (Anthropic), by the gap since the feature\'s call before:')
  for (const feature of new Set(usage.filter(row => row.provider === 'anthropic').map(row => row.feature))) {
    const rows = usage.filter(row => row.provider === 'anthropic' && row.feature === feature)
    let writes = 0, afterLong = 0, underHour = 0, cost = 0
    rows.forEach((row, i) => {
      if (!row.cacheWriteTokens) return
      const gap = i ? row.at - rows[i - 1].at : Infinity
      writes++; cost += row.cacheWriteTokens * 5 / 1e6
      if (gap > 300_000) { afterLong++; if (gap < 3_600_000) underHour++ }
    })
    if (writes) console.log(`  ${feature}: ${writes} of ${rows.length} calls wrote it, ${afterLong} after more than 5 minutes (${underHour} under an hour), about $${cost.toFixed(2)}`)
  }

  const kinds = await db.collection('aiCache').aggregate([{ $group: { _id: '$kind', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray()
  console.log(`\nMila's answer cache: ${kinds.map(kind => `${kind._id} ${kind.n}`).join(', ')}`)

  const userId = email ? (await db.collection('users').findOne({ email }))?.userId
    : (await db.collection('vocab').aggregate([{ $group: { _id: '$userId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 }]).toArray())[0]?._id
  if (!userId) process.exit(0)
  const docs = await db.collection('vocab').find({ userId }).project({ _id: 0 }).toArray()
  const shown = new Set(await db.collection('studyEvents').distinct('key', { userId, type: 'show' }))
  let cards = 0, answered = 0, shownCards = 0, stages = 0, answeredStages = 0, studied = 0, withCards = 0
  const variants = { written: 0, answered: 0, why: {} }
  for (const doc of docs) {
    const byStage = new Map()
    for (const form of doc.forms || []) {
      cards++
      if (form.results?.length) answered++
      if (shown.has(`${doc.id}:${form.key}`)) shownCards++
      byStage.set(form.stage, byStage.get(form.stage) || !!form.results?.length)
      ;(form.variants || []).forEach((variant, i) => {
        variants.written++
        if (form.seen?.includes(i + 1)) variants.answered++
        variants.why[variant.why || 'before reasons'] = (variants.why[variant.why || 'before reasons'] || 0) + 1
      })
    }
    stages += byStage.size; answeredStages += [...byStage.values()].filter(Boolean).length
    if (byStage.size) withCards++
    if (doc.results?.length || (doc.forms || []).some(form => form.results?.length)) studied++
  }
  console.log(`\nContent use (${email || 'the account with the most words'}): ${docs.length} words, ${withCards} with cards, ${studied} studied`)
  console.log(`  cards: ${cards} written, ${shownCards} shown since study events began (${pct(shownCards, cards)}), ${answered} answered (${pct(answered, cards)}); stages ${stages} written, ${answeredStages} answered`)
  console.log(`  new sentences: ${variants.written} written, ${variants.answered} answered on since Study began saying which (by why: ${Object.entries(variants.why).map(([why, n]) => `${why} ${n}`).join(', ') || '-'})`)
  const json = JSON.stringify(docs)
  const fields = {}
  for (const doc of docs) for (const [field, value] of Object.entries(doc)) fields[field] = (fields[field] || 0) + JSON.stringify(value ?? null).length
  console.log(`\nThe word list as fetched: ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB, ${(gzipSync(json).length / 1024).toFixed(0)} KB gzipped; largest: ${Object.entries(fields).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([field, n]) => `${field} ${(n / 1024).toFixed(0)} KB`).join(', ')}`)
} finally { await client.close() }

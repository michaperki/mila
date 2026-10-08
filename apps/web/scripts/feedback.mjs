// Prints recent field reports from the mobile app: `node scripts/feedback.mjs [count]`
// Reads MONGODB_URI / MONGODB_DB_NAME from apps/web/.env (or the environment).
import { readFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')
  .map(line => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]))
const uri = process.env.MONGODB_URI || env.MONGODB_URI
const client = new MongoClient(uri)
try {
  await client.connect()
  const items = await client.db(process.env.MONGODB_DB_NAME || env.MONGODB_DB_NAME || 'mila').collection('feedback')
    .find().sort({ createdAt: -1 }).limit(Number(process.argv[2]) || 20).project({ _id: 0, userId: 0 }).toArray()
  if (!items.length) console.log('No feedback yet.')
  for (const item of items.reverse()) console.log(`\n── ${new Date(item.createdAt).toLocaleString()} · ${item.screen}\n${item.note}\n${JSON.stringify({ app: item.app, context: item.context }, null, 2)}`)
} finally { await client.close() }

// Saved nouns for people that have a masculine and a feminine form (מַזְכִּיר, מַזְכִּירָה) become
// both: the masculine as the word (`lemma`, its full spelling and key), the feminine as
// `feminine`, and an English that is either (secretary), as explanations now give them
// (netlify/functions/word-analysis.ts). `node --experimental-strip-types
// scripts/backfill-person-nouns.mjs` shows which would change, `… --apply` changes them, keeping
// what they were in scripts/person-nouns-backup-<time>.json. A word saved once as each form then
// has the same key twice: npm run repair-vocab merges them. Reads apps/web/.env.
import { readFileSync, writeFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'
import { plainSpelling } from '../../mobile/src/lib/spelling.ts'

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')
  .map(line => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]))
const apply = process.argv.includes('--apply')
// The server's key (netlify/functions/vocab.ts lemmaKeyOf).
const lemmaKeyOf = text => text.normalize('NFC').replace(/[־\-–]/g, ' ').replace(/[֑-ׇ]/g, '')
  .replace(/'/g, '׳').replace(/"/g, '״').replace(/[,،，.!?]/g, '').replace(/\s+/g, ' ').trim()

const SYSTEM = `You check saved Hebrew nouns for an English-speaking learner. Some are nouns for a person (or an animal) that has a masculine and a separate feminine form meaning the same, a man or a woman: מַזְכִּיר and מַזְכִּירָה "secretary", תַּלְמִיד and תַּלְמִידָה, רוֹפֵא and רוֹפְאָה, נַהָג and נַהֶגֶת, מוֹרֶה and מוֹרָה. For each such noun give its masculine singular and feminine singular, both fully vocalized, and its English meaning as it fits either (secretary, not "female secretary"; keep the meaning given otherwise). Every other noun, including a person noun with no feminine of its own (אָדָם, תִּינוֹק) and a feminine noun whose masculine means something else, is not one: mark it so.`
const schema = {
  type: 'object', additionalProperties: false, required: ['words'],
  properties: { words: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['word', 'both', 'masculine', 'feminine', 'english'],
    properties: { word: { type: 'integer' }, both: { type: 'boolean' }, masculine: { type: 'string' }, feminine: { type: 'string' }, english: { type: 'string' } } } } },
}
async function check(docs) {
  const prompt = docs.map((doc, i) => `${i + 1}. ${doc.lemma} — ${doc.gloss}`).join('\n')
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-opus-5-5', max_tokens: 8000, output_config: { effort: 'low', format: { type: 'json_schema', schema } }, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error?.message || `status ${response.status}`)
  return JSON.parse(body.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')).words
}

const client = new MongoClient(env.MONGODB_URI)
try {
  await client.connect()
  const vocab = client.db(env.MONGODB_DB_NAME || 'mila').collection('vocab')
  const nouns = await vocab.find({ partOfSpeech: 'noun', feminine: { $exists: false } }).toArray()
  console.log(`${nouns.length} nouns to check`)
  const changes = []
  for (let at = 0; at < nouns.length; at += 40) {
    const batch = nouns.slice(at, at + 40)
    for (const item of await check(batch)) {
      const doc = batch[item.word - 1]
      if (!doc || !item.both || !item.masculine.trim() || !item.feminine.trim()) continue
      const lemmaPlain = plainSpelling(item.masculine.trim())
      changes.push({ doc, set: { lemma: item.masculine.trim(), lemmaPlain, lemmaKey: lemmaKeyOf(lemmaPlain), feminine: item.feminine.trim(), gender: 'masculine', gloss: item.english.trim() || doc.gloss } })
    }
  }
  console.log(`\n${changes.length} nouns for people with both forms:`)
  for (const { doc, set } of changes) console.log(`  ${doc.lemma} "${doc.gloss}" → ${set.lemma} / ${set.feminine} "${set.gloss}"${set.lemmaKey !== doc.lemmaKey ? `  (key ${doc.lemmaKey} → ${set.lemmaKey})` : ''}`)
  const keys = new Map((await vocab.find({}).project({ userId: 1, lemmaKey: 1, id: 1 }).toArray()).map(doc => [`${doc.userId}\u0000${doc.lemmaKey}`, doc.id]))
  const twice = changes.filter(({ doc, set }) => { const other = keys.get(`${doc.userId}\u0000${set.lemmaKey}`); return other && other !== doc.id })
  if (twice.length) console.log(`\n${twice.length} also saved as the other form, to merge with npm run repair-vocab: ${twice.map(({ set }) => set.lemmaPlain).join(', ')}`)
  if (!apply) { console.log('\nDry run: nothing changed. Run again with --apply to make these changes.'); process.exit(0) }
  const backup = new URL(`./person-nouns-backup-${Date.now()}.json`, import.meta.url)
  writeFileSync(backup, JSON.stringify(changes.map(({ doc, set }) => ({ id: doc.id, userId: doc.userId, ...Object.fromEntries(Object.keys(set).map(key => [key, doc[key] ?? null])) }))))
  for (const { doc, set } of changes) await vocab.updateOne({ _id: doc._id }, { $set: set })
  console.log(`\nDone: ${changes.length} nouns. What they were is in ${backup.pathname}`)
} finally { await client.close() }

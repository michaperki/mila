// Gives every saved word its identity in full spelling and merges the words saved twice:
// `node --experimental-strip-types scripts/repair-vocab.mjs` shows what would change,
// `… --apply` changes it. Words saved before explanations gave a full spelling (lemmaPlain)
// were identified by their vowelled dictionary form with the vowels taken off (לעמד), so saving
// the same word again later (לעמוד) started a second entry. Each word gets a lemmaPlain (the
// vowelled form in full spelling, apps/mobile/src/lib/spelling.ts) and the lemmaKey the server
// matches saves by; entries of one account with the same key become one. The entry kept is the
// one practised most; it takes the others' sentences, cards it doesn't have, and any later
// results, so no practice is lost. Reads MONGODB_URI / MONGODB_DB_NAME from apps/web/.env.
import { readFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'
import { plainSpelling } from '../../mobile/src/lib/spelling.ts'

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')
  .map(line => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]))
const apply = process.argv.includes('--apply')

// The server's key (netlify/functions/vocab.ts lemmaKeyOf).
const lemmaKeyOf = text => text.normalize('NFC').replace(/[\u05BE\-–]/g, ' ').replace(/[\u0591-\u05C7]/g, '')
  .replace(/'/g, '׳').replace(/"/g, '״').replace(/[,،，.!?]/g, '').replace(/\s+/g, ' ').trim()
const hasVowels = text => /[\u05B0-\u05BC\u05C7]/.test(text)
// What a word would be saved under now: its full spelling, from the explanation or the vowels.
const plainOf = entry => entry.lemmaPlain || (hasVowels(entry.lemma) ? plainSpelling(entry.lemma) : entry.lemma)

// How much an entry has been practised: every answer on its word card, its cards and checkpoints.
const answers = entry => (entry.results?.length || 0) + (entry.forms || []).reduce((sum, form) => sum + (form.results?.length || 0), 0)
  + Object.values(entry.checkpoints || {}).reduce((sum, item) => sum + (item.results?.length || 0), 0)
// Of two results for the same card, the one answered last.
const later = (a, b) => ((b?.last ?? -1) > (a?.last ?? -1) ? b : a)

function merge(group) {
  const [keep, ...rest] = [...group].sort((a, b) => answers(b) - answers(a) || a.createdAt - b.createdAt)
  const merged = { ...keep }
  for (const other of rest) {
    const encounters = [...(merged.encounters || [])]
    for (const encounter of other.encounters || []) if (!encounters.some(item => item.context === encounter.context)) encounters.push(encounter)
    merged.encounters = encounters.sort((a, b) => a.at - b.at).slice(-20)
    const forms = [...(merged.forms || [])]
    for (const form of other.forms || []) {
      const at = forms.findIndex(item => item.key === form.key)
      if (at < 0) forms.push(form)
      else if ((form.last ?? -1) > (forms[at].last ?? -1)) forms[at] = { ...forms[at], results: form.results, last: form.last }
    }
    merged.forms = forms
    const card = later(merged.results ? merged : undefined, other.results ? other : undefined)
    if (card) Object.assign(merged, { results: card.results, last: card.last })
    for (const [stage, item] of Object.entries(other.checkpoints || {})) merged.checkpoints = { ...merged.checkpoints, [stage]: later(merged.checkpoints?.[stage], item) }
    for (const field of ['known', 'opened']) if (other[field]?.length) merged[field] = [...new Set([...(merged[field] || []), ...other[field]])]
    for (const field of ['lemmaPlain', 'root', 'binyan', 'gender', 'partOfSpeech', 'constructions', 'governs', 'head', 'built', 'literal', 'literalNote', 'pattern']) {
      if (merged[field] === undefined && other[field] !== undefined) merged[field] = other[field]
    }
    merged.createdAt = Math.min(merged.createdAt, other.createdAt)
  }
  return { keep, rest, merged }
}

const client = new MongoClient(env.MONGODB_URI)
try {
  await client.connect()
  const db = client.db(process.env.MONGODB_DB_NAME || env.MONGODB_DB_NAME || 'mila')
  const vocab = db.collection('vocab')
  const docs = await vocab.find({}).toArray()
  const emails = new Map((await db.collection('users').find({}).project({ userId: 1, email: 1 }).toArray()).map(user => [user.userId, user.email]))
  const groups = new Map()
  for (const doc of docs) {
    const key = `${doc.userId}\u0000${lemmaKeyOf(plainOf(doc))}`
    groups.set(key, [...(groups.get(key) || []), doc])
  }

  const filled = docs.filter(doc => !doc.lemmaPlain || doc.lemmaKey !== lemmaKeyOf(plainOf(doc)))
  console.log(`${docs.length} saved words, ${filled.length} given a full spelling or a new key:`)
  for (const doc of filled) console.log(`  ${emails.get(doc.userId) ?? doc.userId}  ${doc.lemma}  ${doc.lemmaKey ?? '(no key)'} → ${lemmaKeyOf(plainOf(doc))}`)

  const merges = [...groups.values()].filter(group => group.length > 1).map(merge)
  console.log(`\n${merges.length} words saved more than once, merged:`)
  for (const { keep, rest, merged } of merges) {
    console.log(`  ${emails.get(keep.userId) ?? keep.userId}  ${lemmaKeyOf(plainOf(keep))}`)
    for (const doc of [keep, ...rest]) {
      console.log(`    ${doc === keep ? 'keep  ' : 'remove'} ${doc.id}  ${doc.lemma}  ${doc.encounters?.length || 0} sentences, ${doc.forms?.length || 0} cards, ${answers(doc)} answers`)
    }
    console.log(`    → ${merged.encounters?.length || 0} sentences, ${merged.forms?.length || 0} cards, ${answers(merged)} answers`)
  }

  if (!apply) { console.log('\nDry run: nothing changed. Run again with --apply to make these changes.'); process.exit(0) }
  for (const { keep, rest, merged } of merges) {
    const { _id, ...fields } = merged
    await vocab.replaceOne({ _id: keep._id }, { ...fields, lemmaPlain: plainOf(merged), lemmaKey: lemmaKeyOf(plainOf(merged)), updatedAt: Date.now() })
    await vocab.deleteMany({ _id: { $in: rest.map(doc => doc._id) } })
  }
  const merged = new Set(merges.flatMap(({ keep, rest }) => [keep, ...rest]))
  for (const doc of filled.filter(item => !merged.has(item))) {
    await vocab.updateOne({ _id: doc._id }, { $set: { lemmaPlain: plainOf(doc), lemmaKey: lemmaKeyOf(plainOf(doc)) } })
  }
  console.log(`\nDone: ${merges.length} merged, ${filled.length} keyed.`)
} finally { await client.close() }

// Gives cards written before cues existed (and, with --all, every card) the cue that says who a
// form is for when its English doesn't (netlify/functions/lib/cues.ts): `node
// --experimental-strip-types scripts/backfill-cues.mjs` shows what each card would get,
// `… --apply` writes it. Only each card's `cue` changes; its results stay as they are. The cues
// written over are kept in scripts/cues-backup-<time>.json. Reads MONGODB_URI, MONGODB_DB_NAME and
// ANTHROPIC_API_KEY from apps/web/.env.
import { readFileSync, writeFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'
import { CUE_RULES, CUES, isCue } from '../netlify/functions/lib/cues.ts'

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')
  .map(line => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]))
const apply = process.argv.includes('--apply')
const all = process.argv.includes('--all')

const SYSTEM = `You check practice cards for an English-speaking learner of modern Hebrew. On each card the learner sees the English translation of a sentence and must produce the Hebrew form shown, so some cards need a cue saying who the form is for. For each card, give its cue by these rules, or an empty string.

${CUE_RULES}`
const schema = {
  type: 'object', additionalProperties: false, required: ['cards'],
  properties: { cards: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['card', 'cue'], properties: { card: { type: 'integer' }, cue: { type: 'string', enum: [...CUES] } } } } },
}
async function cuesFor(entry, forms) {
  const prompt = [`Word: ${entry.lemma} — ${entry.gloss}`, 'Cards:',
    ...forms.map((form, i) => `${i + 1}. ${form.stage} ${form.slot}: ${form.he} "${form.en}"\n   Hebrew: ${form.sentence}\n   English: ${form.translation}`)].join('\n')
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-opus-5-5', max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system: SYSTEM, messages: [{ role: 'user', content: prompt }],
    }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error?.message || `status ${response.status}`)
  const text = body.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')
  const cards = JSON.parse(text).cards
  return forms.map((_, i) => { const cue = cards.find(item => item.card === i + 1)?.cue; return isCue(cue) ? cue : '' })
}

const client = new MongoClient(env.MONGODB_URI)
try {
  await client.connect()
  const vocab = client.db(env.MONGODB_DB_NAME || 'mila').collection('vocab')
  const docs = (await vocab.find({ 'forms.0': { $exists: true } }).toArray())
    .filter(doc => all || doc.forms.some(form => !('cue' in form)))
  console.log(`${docs.length} words with cards to check${all ? '' : ' (those without cues)'}`)
  const changes = []
  // A few words at a time.
  for (let at = 0; at < docs.length; at += 6) {
    await Promise.all(docs.slice(at, at + 6).map(async doc => {
      const forms = doc.forms.filter(form => all || !('cue' in form))
      try {
        const cues = await cuesFor(doc, forms)
        forms.forEach((form, i) => { if (form.cue !== cues[i]) changes.push({ doc, key: form.key, before: form.cue, cue: cues[i], form }) })
      } catch (failure) { console.log(`  ${doc.lemma}: not checked (${failure.message})`) }
    }))
    process.stdout.write(`  ${Math.min(at + 6, docs.length)}/${docs.length}\r`)
  }
  const shown = changes.filter(change => change.cue || change.before)
  console.log(`\n${changes.length} cards to change, ${shown.length} with a cue given or taken away:`)
  for (const { doc, cue, before, form } of shown) console.log(`  ${before === undefined ? '' : `${before || '∅'} → `}${cue || '∅'}  ${doc.lemma}  ${form.key}  ${form.translation}`)
  if (!apply) { console.log('\nDry run: nothing changed. Run again with --apply to write these cues.'); process.exit(0) }
  const backup = new URL(`./cues-backup-${Date.now()}.json`, import.meta.url)
  writeFileSync(backup, JSON.stringify(changes.map(({ doc, key, before }) => ({ id: doc.id, userId: doc.userId, key, cue: before ?? null }))))
  for (const { doc, key, cue } of changes) await vocab.updateOne({ _id: doc._id, 'forms.key': key }, { $set: { 'forms.$.cue': cue } })
  console.log(`\nDone: ${changes.length} cards. Cues before are in ${backup.pathname}`)
} finally { await client.close() }

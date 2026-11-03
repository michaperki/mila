// Repairs saved practice cards written before the Hebrew-first writer, only where something is
// wrong, keeping every card's key and study results:
//   1. cues: every card's cues are checked by the cue rules as new cards' are (lib/forms-review.ts
//      checkCues), so each person the English leaves open is cued; the sentence stays as it is.
//   2. sentences: the review pass (reviewForms) reads every card as a native editor and rewrites
//      the ones it finds wrong, keeping the tested form;
//   3. a second opinion: each rewrite goes to a separate grader, who sees the card before and
//      after and says whether the card really had a problem and whether the rewrite is better.
//      Only a rewrite it confirms is planned; for the others only the cue check's change is.
// `node --experimental-strip-types scripts/repair-cards.mjs` plans, writing
// scripts/repair-out/plan.json and plan.md to read; nothing in the database changes. Each step is
// kept in scripts/repair-out, so a run that stops goes on from there (`--fresh` starts over).
// `… --apply` makes the planned changes (rewrites that change a card's label only with
// `--with-labels`): a card is changed only if it is still as it was when
// planned; what each was before is kept in scripts/repair-out/backup-<time>.json. Reads
// MONGODB_URI, MONGODB_DB_NAME and ANTHROPIC_API_KEY from apps/web/.env.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { MongoClient, ObjectId } from 'mongodb'
import { checkCues, reviewForms } from '../netlify/functions/lib/forms-review.ts'

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')
  .map(line => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]))
const apply = process.argv.includes('--apply')
const out = new URL('./repair-out/', import.meta.url)
mkdirSync(out, { recursive: true })
if (process.argv.includes('--fresh')) for (const name of ['cues', 'reviewed', 'confirmed']) rmSync(new URL(`${name}.json`, out), { force: true })
const kept = name => (existsSync(new URL(`${name}.json`, out)) ? JSON.parse(readFileSync(new URL(`${name}.json`, out), 'utf8')) : null)
const keep = (name, value) => writeFileSync(new URL(`${name}.json`, out), JSON.stringify(value, null, 1))

const client = new MongoClient(env.MONGODB_URI)
await client.connect()
const vocab = client.db(env.MONGODB_DB_NAME || 'mila').collection('vocab')
// The fields a repair changes, as they are on a card (its results and the rest stay).
const FIELDS = ['he', 'en', 'sentence', 'mark', 'said', 'translation', 'enMark', 'cue', 'cueAfter', 'cues']
const pick = card => Object.fromEntries(FIELDS.map(field => [field, card[field] ?? null]))

if (apply) {
  const plan = kept('plan')
  if (!plan) { console.log('No plan: run without --apply first.'); process.exit(1) }
  const backup = []
  let changed = 0
  // A rewrite that changes what a card teaches (its label: a meanings card's sense, a form's
  // meaning) is only made with --with-labels, after reading those changes in plan.md.
  const withLabels = process.argv.includes('--with-labels')
  const held = plan.changes.filter(change => change.labelChanged && !withLabels)
  if (held.length) console.log(`Not changing ${held.length} cards whose label the rewrite changes (--with-labels to include them).`)
  for (const change of plan.changes.filter(item => !held.includes(item))) {
    const set = { updatedAt: Date.now() }
    const unset = {}
    for (const field of FIELDS) {
      if (JSON.stringify(change.after[field]) === JSON.stringify(change.before[field])) continue
      if (change.after[field] === null) unset[`forms.$[card].${field}`] = ''
      else set[`forms.$[card].${field}`] = change.after[field]
    }
    // Only the card as it was planned: same key, sentence and translation.
    const result = await vocab.updateOne({ _id: new ObjectId(change.doc) },
      { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { arrayFilters: [{ 'card.key': change.key, 'card.sentence': change.before.sentence, 'card.translation': change.before.translation }] })
    if (result.modifiedCount) { changed++; backup.push({ doc: change.doc, key: change.key, before: change.before }) }
    else console.log(`  not changed (no longer as planned): ${change.lemma} ${change.key}`)
  }
  const file = new URL(`backup-${Date.now()}.json`, out)
  writeFileSync(file, JSON.stringify(backup, null, 1))
  console.log(`Done: ${changed} of ${plan.changes.length} cards changed. Before: ${file.pathname}`)
  await client.close()
  process.exit(0)
}

const docs = await vocab.find({ 'forms.0': { $exists: true } }).toArray()
await client.close()
// A card as the review reads it: cards written before cues were a list have their one cue (or,
// before cues, none: the app showed one for "you" from the slot, which the check now decides).
const asWritten = card => ({ ...card, mark: card.mark || '', enMark: card.enMark || '', cues: card.cues ?? (card.cue ? [{ cue: card.cue, after: card.cueAfter ?? '' }] : []) })
const groups = docs.flatMap(doc => Object.values(Object.groupBy(doc.forms.filter(card => card.sentence && card.translation && card.key), card => card.stage))
  .map(cards => ({ doc, stage: cards[0].stage, cards: cards.map(asWritten) })))
console.log(`${docs.length} words, ${groups.reduce((sum, group) => sum + group.cards.length, 0)} cards`)

const usage = { calls: 0, input: 0, output: 0 }
function asker(effort = 'low') {
  return async ({ system, prompt, schema }) => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-opus-5-5', max_tokens: 16000, output_config: { effort, format: { type: 'json_schema', schema } }, system, messages: [{ role: 'user', content: prompt }] }),
      })
      const body = await response.json()
      if (response.ok) { usage.calls++; usage.input += body.usage.input_tokens; usage.output += body.usage.output_tokens; return body }
      if (attempt >= 3) throw new Error(body.error?.message || `status ${response.status}`)
      await new Promise(resolve => setTimeout(resolve, 5000 * (attempt + 1)))
    }
  }
}
async function inTurn(items, run, at = 6) {
  let next = 0
  await Promise.all(Array.from({ length: at }, async () => { while (next < items.length) { const item = items[next++]; await run(item); process.stdout.write('.') } }))
  console.log()
}
const groupId = group => `${group.doc._id}|${group.stage}`

// 1 and 2: the cue check and the review, each word's stage at a time.
for (const [name, run] of [['cues', checkCues], ['reviewed', reviewForms]]) {
  const done = kept(name) ?? {}
  const left = groups.filter(group => !done[groupId(group)])
  if (!left.length) continue
  console.log(`${name === 'cues' ? 'Checking cues' : 'Reviewing'}: ${left.length} word stages`)
  await inTurn(left, async group => {
    try {
      const { forms, fixed } = await run(group.doc, group.stage, group.cards, asker())
      done[groupId(group)] = fixed.map(item => ({ key: item.key, problems: item.problems, after: pick(forms.find(form => form.key === item.key)) }))
    } catch (failure) { console.error(`\n${group.doc.lemma} ${group.stage}: ${failure.message}`) }
  })
  keep(name, done)
}
const cues = kept('cues')
const reviewed = kept('reviewed')

// A rewrite must keep the tested form (compared without vowels, or the letters spelling them).
const plain = text => (text || '').replace(/[֑-ׇ]/g, '').replace(/[וי]/g, '').trim()
const proposals = []
for (const group of groups) {
  for (const fix of reviewed[groupId(group)] ?? []) {
    const card = group.cards.find(item => item.key === fix.key)
    const sameText = fix.after.sentence === card.sentence && fix.after.translation === card.translation
    if (sameText) continue // only cues: the cue check decides those
    proposals.push({ group, card, fix, keepsForm: plain(fix.after.he) === plain(card.he) })
  }
}

// 3: the second opinion on each rewrite.
const CONFIRM = `You are a native Israeli Hebrew editor giving a second opinion on proposed corrections to flashcards for an English-speaking learner. Each card has a Hebrew sentence using a tested word and its English translation (an emoji in the English says who a person is). A first editor rewrote each card. For each, judge independently:
- "problem": what is really wrong with the ORIGINAL card, if anything: "none" (it is fine: correct, natural Hebrew an Israeli would say, a faithful translation), "error" (a grammar or agreement mistake), "sense" (the tested word is used in a sense or collocation it doesn't have), "unnatural" (correct but not how an Israeli would say it), "register" (too literary or slangy for the context), "translation" (the English doesn't say what the Hebrew says). Be strict: a card that is fine is "none" even if the rewrite is also fine; a mere alternative phrasing is not a problem.
- "better": whether the REWRITE is correct, natural Hebrew with a faithful translation, uses the tested word properly, and fixes the problem.
- "note": one short sentence.`
const confirmSchema = { type: 'object', additionalProperties: false, required: ['cards'], properties: { cards: { type: 'array', items: { type: 'object', additionalProperties: false,
  required: ['card', 'problem', 'better', 'note'], properties: { card: { type: 'integer' }, problem: { type: 'string', enum: ['none', 'error', 'sense', 'unnatural', 'register', 'translation'] }, better: { type: 'boolean' }, note: { type: 'string' } } } } } }
const confirmed = kept('confirmed') ?? {}
const toConfirm = proposals.filter(item => item.keepsForm && !confirmed[`${groupId(item.group)}|${item.card.key}`])
if (toConfirm.length) {
  console.log(`Second opinion on ${toConfirm.length} rewrites`)
  const batches = []
  for (let i = 0; i < toConfirm.length; i += 15) batches.push(toConfirm.slice(i, i + 15))
  const ask = asker('medium')
  await inTurn(batches, async batch => {
    const prompt = batch.map((item, i) => `${i + 1}. word ${item.group.doc.lemma} (${item.group.doc.gloss}) · tested form ${item.card.he}\n   ORIGINAL: ${item.card.sentence}\n             ${item.card.translation}\n   REWRITE:  ${item.fix.after.sentence}\n             ${item.fix.after.translation}\n   First editor's reason: ${item.fix.problems.join('; ')}`).join('\n')
    try {
      const reply = await ask({ system: CONFIRM, prompt, schema: confirmSchema })
      const answers = JSON.parse(reply.content.filter(block => block.type === 'text').map(block => block.text).join('')).cards
      batch.forEach((item, i) => { const answer = answers.find(entry => entry.card === i + 1); if (answer) confirmed[`${groupId(item.group)}|${item.card.key}`] = answer })
    } catch (failure) { console.error(`\nsecond opinion: ${failure.message}`) }
  }, 4)
  keep('confirmed', confirmed)
}

// The plan: a confirmed rewrite (with its own cues), else the cue check's change, else nothing.
const changes = []
const rejected = []
for (const group of groups) {
  for (const card of group.cards) {
    const id = `${groupId(group)}|${card.key}`
    const proposal = proposals.find(item => item.group === group && item.card.key === card.key)
    const opinion = confirmed[id]
    const before = pick(group.doc.forms.find(item => item.key === card.key))
    const base = { doc: String(group.doc._id), lemma: group.doc.lemma, gloss: group.doc.gloss, key: card.key, studied: card.results?.length ?? 0, before }
    if (proposal && proposal.keepsForm && opinion && opinion.problem !== 'none' && opinion.better) {
      changes.push({ ...base, kind: card.sentence === proposal.fix.after.sentence ? 'english' : 'sentence', labelChanged: proposal.fix.after.en !== card.en,
        why: proposal.fix.problems, opinion, after: proposal.fix.after })
      continue
    }
    if (proposal) rejected.push({ ...base, why: proposal.fix.problems, opinion, keepsForm: proposal.keepsForm, after: proposal.fix.after })
    const cue = (cues[groupId(group)] ?? []).find(item => item.key === card.key)
    if (cue) changes.push({ ...base, kind: 'cues', why: cue.problems, after: { ...before, cue: cue.after.cue, cueAfter: cue.after.cueAfter, cues: cue.after.cues } })
  }
}
keep('plan', { changes, rejected })

const shown = (card) => {
  const list = card.cues ?? []
  let text = card.translation
  for (const { cue, after } of [...list].reverse()) {
    const at = after ? text.indexOf(after) : -1
    text = at < 0 ? `${cue} ${text}` : `${text.slice(0, at + after.length)} ${cue}${text.slice(at + after.length)}`
  }
  return text
}
const count = kind => changes.filter(change => change.kind === kind).length
const cost = (usage.input * 4 + usage.output * 20) / 1e6
const lines = ['# Card repair: dry run', '',
  `${docs.length} words, ${groups.reduce((sum, group) => sum + group.cards.length, 0)} cards. Planned: ${count('sentence')} sentences rewritten, ${count('english')} translations corrected, ${count('cues')} cards' cues changed. ${rejected.length} rewrites the review proposed are not planned (the second opinion didn't confirm them, or they changed the tested form). Cards studied among the planned changes: ${changes.filter(change => change.studied).length} (their results are kept).`,
  ...(usage.calls ? ['', `This run: ${usage.calls} calls, about $${cost.toFixed(2)}.`] : []), '',
  '## Sentences rewritten', '']
for (const change of changes.filter(item => item.kind !== 'cues')) {
  lines.push(`- **${change.lemma}** ${change.key}${change.studied ? ' (studied)' : ''}${change.labelChanged ? ` · label "${change.before.en}" → "${change.after.en}"` : ''}`,
    `  before: ${change.before.sentence} — ${shown(change.before.cues ? change.before : { ...change.before, cues: change.before.cue ? [{ cue: change.before.cue, after: change.before.cueAfter ?? '' }] : [] })}`,
    `  after:  ${change.after.sentence} — ${shown(change.after)}`,
    `  why: ${change.why.join('; ')} · second opinion: ${change.opinion.problem}, ${change.opinion.note}`)
}
lines.push('', '## Cues changed', '')
for (const change of changes.filter(item => item.kind === 'cues')) lines.push(`- **${change.lemma}** ${change.key}: ${shown(change.after)}  _(${change.why.join('; ')})_`)
lines.push('', '## Rewrites not planned', '')
for (const item of rejected) lines.push(`- **${item.lemma}** ${item.key}: ${item.before.sentence} → ${item.after.sentence}`, `  ${item.keepsForm ? `second opinion: ${item.opinion ? `${item.opinion.problem}, ${item.opinion.better ? 'better' : 'not better'}: ${item.opinion.note}` : 'none'}` : 'changed the tested form'}`)
writeFileSync(new URL('plan.md', out), lines.join('\n'))
console.log(lines.slice(0, 3).join('\n'))
console.log(`\nDry run: nothing changed. Read ${new URL('plan.md', out).pathname}, then run again with --apply.`)

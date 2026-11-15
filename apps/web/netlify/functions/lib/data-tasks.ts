import { lemmaKeyOf, plainOf } from './lemma'
import { CATEGORIES, LEVELS, REGISTERS, TAXONOMY_VERSION, levelOf } from './taxonomy'

// Export and import of saved words (DATA-1). A task says which words go out, which of their
// fields go with them (to read), which fields may come back (to change) and how each is checked;
// anything else coming back is ignored if it was only there to read, or refuses the row if it
// names a field the task can't change, so no import ever touches what was learned (results,
// cards, checkpoints, encounters). The same check (`planImport`) makes the preview and the
// changes applied, so what is shown is what happens.
export type TaskEntry = {
  id: string; lemma: string; lemmaPlain?: string; lemmaKey?: string; gloss?: string; partOfSpeech?: string; rank?: number
  encounters?: { context?: string; surface?: string }[]; archived?: boolean; categories?: string[]; register?: string; level?: string; taxonomy?: string
}
type Check = (value: unknown) => string | null
type Task = {
  title: string
  // Which words go out (all of them, unless the task says).
  picks?: (entry: TaskEntry) => boolean
  // What goes out for each word, to read.
  row: (entry: TaskEntry) => Record<string, unknown>
  // What may come back, each with what is wrong with a value (null: nothing).
  fields: Record<string, Check>
  instructions: string
}

const example = (entry: TaskEntry) => (entry.encounters || []).map(item => item.context).find(Boolean)?.slice(0, 160)
const hebrew = /[א-ת]/
const oneOf = (values: readonly string[]): Check => value => (value === null || (typeof value === 'string' && values.includes(value)) ? null : `must be one of ${values.join(', ')}`)
const PARTS = ['verb', 'noun', 'adjective', 'adverb', 'expression', 'preposition', 'pronoun', 'conjunction', 'interjection', 'name', 'number']
const categoryIds = Object.keys(CATEGORIES)

export const TASKS: Record<string, Task> = {
  'classify-v1': {
    title: 'Organise words by theme, register and level',
    row: entry => ({
      id: entry.id, word: entry.lemma, meaning: entry.gloss, partOfSpeech: entry.partOfSpeech,
      ...(levelOf(entry.rank) ? { frequencyLevel: levelOf(entry.rank) } : {}), example: example(entry),
      ...(entry.categories ? { categories: entry.categories } : {}), ...(entry.register ? { register: entry.register } : {}),
    }),
    fields: {
      categories: value => (value === null || (Array.isArray(value) && value.length <= 3 && value.every(item => categoryIds.includes(item as string)))
        ? null : `must be up to three of ${categoryIds.join(', ')}`),
      register: oneOf(Object.keys(REGISTERS)),
      level: oneOf(LEVELS),
    },
    instructions: [
      'These are Hebrew words a learner has saved while reading, each with its meaning, part of speech and an example sentence.',
      'For each word, return its id and:',
      `- "categories": one to three of these themes, the ones it most belongs to, or [] if none fits well (don't force one): ${Object.entries(CATEGORIES).map(([id, about]) => `${id} (${about})`).join('; ')}.`,
      `- "register": one of ${Object.entries(REGISTERS).map(([id, about]) => `${id} (${about})`).join('; ')}.`,
      `- "level": only for a word without a frequencyLevel: one of ${LEVELS.join(', ')} (how common it is in Hebrew today).`,
      'Leave out a field you are unsure of rather than guess. Return only a JSON array: [{"id": "...", "categories": [...], "register": "...", "level": "..."}].',
    ].join('\n'),
  },
  'normalize-v1': {
    title: 'Fix words saved in the wrong form',
    // Words saved as written rather than as a dictionary form (older phrase saves, VOCAB-1).
    picks: entry => entry.partOfSpeech === 'phrase' && !entry.archived,
    row: entry => ({ id: entry.id, lemma: entry.lemma, meaning: entry.gloss, partOfSpeech: entry.partOfSpeech, example: example(entry) }),
    fields: {
      lemma: value => (typeof value === 'string' && hebrew.test(value) && value.trim().length > 0 && value.length <= 60 ? null : 'must be Hebrew, up to 60 characters'),
      gloss: value => (typeof value === 'string' && value.trim().length > 0 && value.length <= 120 ? null : 'must be English, up to 120 characters'),
      partOfSpeech: value => (typeof value === 'string' && PARTS.includes(value) ? null : `must be one of ${PARTS.join(', ')}`),
      archived: value => (typeof value === 'boolean' ? null : 'must be true or false'),
    },
    instructions: [
      'These Hebrew entries were saved as the words appeared in a sentence rather than as a dictionary form, and some aren\'t worth learning as a unit at all.',
      'For each, return its id and either:',
      '- the corrected entry: "lemma" (the dictionary form: a verb as the infinitive, a noun or adjective in the masculine singular, without prefixes like ו ה ב ל מ ש, an expression with a possessive in the masculine third person, with niqqud if you can), "gloss" (a short English meaning) and "partOfSpeech" (verb, noun, adjective, adverb, expression, preposition, pronoun, conjunction, interjection, name or number); or',
      '- "archived": true, for a clause or words that only happen to stand together (they stay saved but leave Study and the word list).',
      'Return only a JSON array: [{"id": "...", "lemma": "...", "gloss": "...", "partOfSpeech": "..."}] or [{"id": "...", "archived": true}].',
    ].join('\n'),
  },
}

// The words a task sends out, as rows to read.
export const exportRows = (task: Task, entries: TaskEntry[]) => entries.filter(entry => task.picks?.(entry) ?? !entry.archived).map(task.row)

export type Change = { id: string; lemma: string; field: string; from: unknown; to: unknown }
export type Plan = { task: string; rows: number; changes: Change[]; unchanged: number; rejected: { id: string; reason: string }[] }

// What an import would change, row by row: each row's fields checked against the task, compared
// with the word as it is; a row naming another field, an unknown word or (for a new dictionary
// form) one already saved under it is refused whole, with why.
export function planImport(taskName: string, rows: unknown, entries: TaskEntry[]): Plan | { error: string } {
  const task = TASKS[taskName]
  if (!task) return { error: `Unknown task. Use one of ${Object.keys(TASKS).join(', ')}.` }
  if (!Array.isArray(rows) || !rows.length) return { error: 'Nothing to import: paste the JSON array the task returned.' }
  if (rows.length > 2000) return { error: 'Too many rows for one import (2,000 at most).' }
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const readOnly = new Set(Object.keys(task.row({ id: '', lemma: '' })).concat(['id', 'word', 'meaning', 'example', 'frequencyLevel', 'lemma', 'partOfSpeech']))
  const plan: Plan = { task: taskName, rows: rows.length, changes: [], unchanged: 0, rejected: [] }
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof (row as { id?: unknown }).id !== 'string') { plan.rejected.push({ id: '?', reason: 'no id' }); continue }
    const { id, ...fields } = row as Record<string, unknown> & { id: string }
    const entry = byId.get(id)
    if (!entry) { plan.rejected.push({ id, reason: 'no saved word has this id' }); continue }
    if (seen.has(id)) { plan.rejected.push({ id, reason: 'this word comes twice; only the first is used' }); continue }
    seen.add(id)
    const problems: string[] = []
    const changes: Change[] = []
    for (const [field, value] of Object.entries(fields)) {
      const check = task.fields[field]
      if (!check) { if (!readOnly.has(field)) problems.push(`${field} can't be changed by this task`); continue }
      const wrong = check(value)
      if (wrong) { problems.push(`${field} ${wrong}`); continue }
      const from = entry[field as keyof TaskEntry]
      if (JSON.stringify(from ?? null) !== JSON.stringify(value ?? null)) changes.push({ id, lemma: entry.lemma, field, from: from ?? null, to: value })
    }
    const lemma = changes.find(change => change.field === 'lemma')
    if (lemma) {
      const key = lemmaKeyOf(lemma.to as string)
      const other = entries.find(item => item.id !== id && !item.archived && (item.lemmaKey || lemmaKeyOf(item.lemmaPlain || item.lemma)) === key)
      if (other) problems.push(`${other.lemma} is saved already; merging two words isn't supported yet, so archive this one instead`)
    }
    if (problems.length) plan.rejected.push({ id, reason: problems.join('; ') })
    else if (changes.length) plan.changes.push(...changes)
    else plan.unchanged++
  }
  return plan
}

// The update for one word's changes, with what follows from them: a new dictionary form's plain
// form and identity key, and the taxonomy version that classified it.
export function updateFor(changes: Change[]) {
  const set: Record<string, unknown> = {}
  const unset: Record<string, ''> = {}
  for (const { field, to } of changes) {
    if (to === null) unset[field] = ''
    else set[field] = to
    if (field === 'lemma') { set.lemmaPlain = plainOf(to as string); set.lemmaKey = lemmaKeyOf(to as string) }
    if (field === 'categories' && to !== null) set.taxonomy = TAXONOMY_VERSION
  }
  return { set, unset }
}

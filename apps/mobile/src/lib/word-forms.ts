import { request } from './api'
import { missingStages } from './forms'
import type { FormCard, VocabEntry } from './types'

// Asks the server to write the cards for any open stage that has none yet (a word just saved,
// a stage just unlocked) and returns the entry with them. A stage that fails is retried the
// next time the word is opened or practiced.
export async function ensureForms(entry: VocabEntry, token: string): Promise<VocabEntry> {
  const missing = missingStages(entry)
  if (!missing.length) return entry
  const results = await Promise.allSettled(missing.map(stage =>
    request<{ forms: FormCard[] }>('word-forms', { token, body: { id: entry.id, stage }, timeoutMs: 50000 })))
  const known = new Set((entry.forms || []).map(form => form.key))
  const added = results.flatMap(result => (result.status === 'fulfilled' ? result.value.forms : [])).filter(form => !known.has(form.key))
  return added.length ? { ...entry, forms: [...(entry.forms || []), ...added] } : entry
}

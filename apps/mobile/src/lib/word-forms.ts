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

// New sentences for a stage already written: for the cards `keys` (those Study found would be
// helped by one, lib/forms.ts wantsSentence), or for all its cards with room for one (a round of
// new sentences, freshPicks); `why` is kept with each. The server writes them for what the
// learner knows and keeps them on the cards beside their own sentences (FormCard.variants).
// Returns the entry with that stage's cards as they now are.
export async function freshSentences(entry: VocabEntry, stage: string, token: string, { keys, why }: { keys?: string[]; why: string }): Promise<VocabEntry> {
  const { forms } = await request<{ forms: FormCard[] }>('word-forms', { token, body: { id: entry.id, stage, fresh: true, keys, why }, timeoutMs: 50000 })
  const byKey = new Map(forms.map(form => [form.key, form]))
  return { ...entry, forms: (entry.forms || []).map(form => (byKey.has(form.key) ? { ...form, variants: byKey.get(form.key)!.variants } : form)) }
}

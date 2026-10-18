import { request } from './api'
import { type Family, rootOf, type Table, tableMeaning } from './explore'
import type { VocabEntry } from './types'

// Asks for a word's table of forms and a root's family (see explore.ts). A visit is kept here so
// going back and forth doesn't ask again.
const tables = new Map<string, Promise<Table>>()
export function tableFor(entry: VocabEntry, token: string): Promise<Table> {
  const body = { lemma: entry.lemma, partOfSpeech: entry.partOfSpeech, binyan: entry.binyan || '', meaning: tableMeaning(entry) }
  const key = JSON.stringify(body)
  return remembered(tables, key, () => request<Table>('word-table', { token, body, timeoutMs: 50000 }))
}
const families = new Map<string, Promise<Family>>()
export const familyFor = (root: string, word: string, token: string) =>
  remembered(families, rootOf(root), () => request<Family>('root-family', { token, body: { root, word }, timeoutMs: 40000 }))
// A failed request isn't kept, so opening the screen again tries again.
function remembered<T>(store: Map<string, Promise<T>>, key: string, load: () => Promise<T>) {
  const found = store.get(key)
  if (found) return found
  const pending = load()
  store.set(key, pending)
  pending.catch(() => store.delete(key))
  return pending
}

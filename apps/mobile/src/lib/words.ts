import type { Encounter, VocabEntry } from './types'

// Where a saved word was met, newest first. Entries saved before encounters existed have one,
// kept at the top level of the entry.
export function encountersOf(entry: VocabEntry): Encounter[] {
  if (entry.encounters?.length) return [...entry.encounters].sort((a, b) => b.at - a.at)
  if (!entry.context) return []
  return [{
    surface: entry.surface || entry.lemma, vocalized: entry.vocalized, form: entry.form, meaning: entry.gloss, context: entry.context,
    contextTranslation: entry.contextTranslation, excerpt: entry.excerpt, excerptTranslation: entry.excerptTranslation,
    sourceRef: entry.sourceRef, at: entry.createdAt,
  }]
}

// "Saved" in the reader means this word was saved from this sentence; meeting it in another
// sentence can still be saved, which adds an encounter to the same entry.
export const savedKey = (id: string, sentence: string) => `${id}\u0000${sentence}`
export const savedKeysOf = (entries: VocabEntry[]) =>
  new Set(entries.flatMap(entry => encountersOf(entry).map(encounter => savedKey(entry.id, encounter.context))))

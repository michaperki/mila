import { stripNiqqud } from './ocr-cleanup.ts'
import type { Encounter, VocabEntry } from './types'

// A saved word's identity: its dictionary form as plainly written (no niqqud, a maqaf read as a
// space), so the same word saved again with other vowels is one entry. Words are identified by
// the explanation's `lemmaPlain`, its full spelling, since stripping vowels alone leaves לכתב
// and לכתוב apart. Homographs (סֵפֶר book / סַפָּר barber) share an entry: rare, and cheaper than
// duplicates. The server matches saves by the same key (vocab.ts lemmaKeyOf).
export const lemmaKey = (text: string) => stripNiqqud(text.normalize('NFC').replace(/[\u05BE\-–]/g, ' '))
  .replace(/'/g, '׳').replace(/"/g, '״').replace(/[,،，.!?]/g, '').replace(/\s+/g, ' ').trim()
export const vocabId = (lemma: string) => `native-${encodeURIComponent(lemmaKey(lemma))}`

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

// Saved words by what was tapped: the text as written in the reader and its sentence. The
// reader knows a word is saved from the tap alone, before (or without) any explanation, which
// is needed for the dictionary form the entry is saved under.
export type SavedTap = { id: string; encounter: Encounter }
export const tapKey = (surface: string, sentence: string) => `${surface}\u0000${sentence}`
export const savedTapsOf = (entries: VocabEntry[]) =>
  new Map<string, SavedTap>(entries.flatMap(entry => encountersOf(entry).map(encounter => [tapKey(encounter.surface, encounter.context), { id: entry.id, encounter }] as const)))

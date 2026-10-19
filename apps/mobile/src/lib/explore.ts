import { firstSense, kindOfEntry } from './forms.ts'
import type { VocabEntry } from './types'
import { lemmaKey } from './words.ts'

// Looking around a saved word: its whole table of forms and its root's family of words. Both
// are the same for every learner and cached on the server (word-table.ts, root-family.ts); they
// are asked for in explore-requests.ts.

// Mirrors apps/web/netlify/functions/word-table.ts.
export type Table = { groups: { key: string; label: string; rows: { slot: string; label: string; he: string; en: string }[] }[] }
// Mirrors apps/web/netlify/functions/root-family.ts.
export type FamilyWord = { lemma: string; lemmaPlain: string; partOfSpeech: string; binyan: string; gender: string; meaning: string }
export type Family = { root: string; idea: string; words: FamilyWord[] }

// Verbs, adjectives and nouns have a table of forms, and so do expressions built on one
// (every form of לעבור דרך).
export const hasTable = (entry: VocabEntry) => kindOfEntry(entry) !== 'other'
// The root's letters, without vowels or separators, joined with ־: כ־ת־ב (as the server keys it).
export const rootOf = (value: string) => (value.match(/[א-ת]/g) || []).join('־')
export const hasRoot = (entry: VocabEntry) => { const letters = rootOf(entry.root || '').split('־').length; return letters >= 2 && letters <= 5 }

// The meaning a table is written in: the word's first meaning card, else its gloss's first sense
// (the same as its practice cards).
export const tableMeaning = (entry: VocabEntry) =>
  entry.forms?.find(form => form.stage === 'meanings' && form.slot === 'sense1')?.en || firstSense(entry.gloss || '')

// A family's words in groups, verbs first, each in the order given (most common first).
const GROUPS: [string, string[]][] = [['Verbs', ['verb']], ['Nouns', ['noun']], ['Adjectives', ['adjective']]]
export function familyGroups(words: FamilyWord[]): { label: string; words: FamilyWord[] }[] {
  const listed = new Set(GROUPS.flatMap(([, kinds]) => kinds))
  return [...GROUPS.map(([label, kinds]) => ({ label, words: words.filter(word => kinds.includes(word.partOfSpeech)) })),
    { label: 'Other words', words: words.filter(word => !listed.has(word.partOfSpeech)) }].filter(group => group.words.length)
}
// The saved word a family word is, if it is saved: matched as saves are, by its plain spelling.
export function savedAs(entries: VocabEntry[], word: FamilyWord) {
  const key = lemmaKey(word.lemmaPlain || word.lemma)
  return entries.find(entry => lemmaKey(entry.lemmaPlain || entry.lemma) === key)
}
// A family word saved as a new entry (it has no encounter: it was found, not met in a text).
export const entryFrom = (word: FamilyWord, root: string, id: string): VocabEntry => ({
  id, lemma: word.lemma, gloss: word.meaning, createdAt: Date.now(), frequency: 1, root,
  ...(word.lemmaPlain ? { lemmaPlain: word.lemmaPlain } : {}),
  ...(word.partOfSpeech ? { partOfSpeech: word.partOfSpeech } : {}),
  ...(word.binyan ? { binyan: word.binyan } : {}),
  ...(word.gender ? { gender: word.gender } : {}),
})

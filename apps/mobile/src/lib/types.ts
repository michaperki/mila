// Use the same persisted document contract as the web client; imports are type-only.
import type { StarredItem } from '../../../web/src/types'
export type { TextDoc, Chunk, Token, StarredItem } from '../../../web/src/types'
export type Session = { token: string; user: { id: string; email: string; tier: 'free' | 'premium'; createdAt: string } }
// One readable unit of a passage (heading or sentence) paired with its English.
// From a page read: `paragraph` starts a new paragraph, `joined` completes a sentence
// from the previous page, `cutStart`/`cutEnd` mark a sentence the page cuts off.
export type ReadingSegment = {
  he: string; en: string; heading?: boolean; marker?: string
  paragraph?: boolean; joined?: boolean; cutStart?: boolean; cutEnd?: boolean
}
// The photo a capture came from, kept so a live result can be read in full later.
export type CapturedImage = { uri: string; width: number; height: number }
// `id` is the library document this text is (or will be) saved under. `library` says how the
// reader treats it: 'auto' saves on open (camera captures), 'saved' is already in the library.
export type Recognition = {
  text: string; translation: string; capturedAt: number; segments?: ReadingSegment[]; raw?: string
  id?: string; library?: 'auto' | 'saved'
  // 'page': read by the vision model (paragraphs, corrected text); otherwise OCR + local cleanup.
  source?: 'page'; image?: CapturedImage; omitted?: string[]; readError?: string
}
// Mirrors the `word-analysis` function's response (apps/web/netlify/functions/word-analysis.ts).
export type WordAnalysis = {
  word: string; vocalized: string; meaning: string; parts: { text: string; meaning: string }[]
  lemma: string; lemmaMeaning: string; root: string; partOfSpeech: string; binyan: string; form: string; note: string
  readAs?: string; phrase?: { text: string; meaning: string }; excerpt?: { text: string; meaning: string }
}
// A saved word is its dictionary form (להדביק, not the הדביק that was tapped): `lemma`, `gloss`
// (the dictionary form's meanings), part of speech, root and binyan describe it. Each place it
// was met is an `Encounter`, so the same word met in several books stays one entry with one
// practice history. Entries saved before encounters existed keep that data at the top level.
export type VocabEntry = StarredItem & {
  partOfSpeech?: string; binyan?: string; encounters?: Encounter[]; review?: Review
  vocalized?: string; context?: string; contextTranslation?: string; surface?: string
  senses?: string; form?: string; excerpt?: string; excerptTranslation?: string
}
// Where a word was met: the form on the page, its grammatical form and meaning there, the
// sentence, and a short excerpt of it for cards.
export type Encounter = {
  surface: string; vocalized?: string; form?: string; meaning: string; context: string; contextTranslation?: string
  excerpt?: string; excerptTranslation?: string; sourceRef?: { textId: string; chunkId: string }; at: number
}
// Spaced-repetition state, stored on the vocab entry (see lib/review.ts).
export type Review = { due: number; interval: number; reps: number; lapses: number; last?: number }

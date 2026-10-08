// Use the same persisted document contract as the web client; imports are type-only.
import type { StarredItem } from '../../../web/src/types'
export type { TextDoc, Chunk, Token, StarredItem } from '../../../web/src/types'
export type Session = { token: string; user: { id: string; email: string; tier: 'free' | 'premium'; createdAt: string } }
// One readable unit of a passage (heading or sentence) paired with its English.
export type ReadingSegment = { he: string; en: string; heading?: boolean; marker?: string }
export type Recognition = { text: string; translation: string; capturedAt: number; imageUri?: string; segments?: ReadingSegment[]; raw?: string }
// Mirrors the `word-analysis` function's response (apps/web/netlify/functions/word-analysis.ts).
export type WordAnalysis = {
  word: string; vocalized: string; meaning: string; parts: { text: string; meaning: string }[]
  lemma: string; lemmaMeaning: string; root: string; partOfSpeech: string; binyan: string; form: string; note: string
}
// Saved vocabulary keeps where the word was met so review cards can show it in context.
export type VocabEntry = StarredItem & {
  vocalized?: string; context?: string; contextTranslation?: string; partOfSpeech?: string; surface?: string
}

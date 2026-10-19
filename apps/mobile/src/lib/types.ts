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
  // The sentence to open at (Continue reading on Today).
  startAt?: number
  // A short English name for a photographed page (the page read gives it), for the Library.
  title?: string
  // 'page': read by the vision model (paragraphs, corrected text); otherwise OCR + local cleanup.
  source?: 'page'; image?: CapturedImage; omitted?: string[]; readError?: string
}
// Mirrors the `word-analysis` function's response (apps/web/netlify/functions/word-analysis.ts).
export type WordAnalysis = {
  word: string; vocalized: string; meaning: string; parts: { text: string; meaning: string }[]
  lemma: string; lemmaPlain?: string; lemmaMeaning: string; root: string; partOfSpeech: string; gender?: string; binyan: string; form: string; note: string
  readAs?: string; phrase?: Phrase; excerpt?: { text: string; meaning: string }
}
// The expression a tapped word belongs to: `text` as it stands in the sentence, `words` the
// expression's own words as written there, in order (other words may come between them),
// `lemma` its dictionary form (לַעֲבֹר דֶּרֶךְ for עוברים דרך), `head` the word in it that inflects
// and `partOfSpeech` what the whole behaves as (a verb for להעמיד פנים). A `kind` 'pattern' has an
// open place other words fill (נטול ינשופים is `pattern` נָטוּל + [שֵׁם עֶצֶם], "free of [noun]"):
// its `lemma` and `words` are the fixed words only, and `textMeaning` is what it means here
// ("owl-free"), with `examples` of other uses. Older explanations have only `text` and `meaning`.
export type Phrase = { text: string; meaning: string; textMeaning?: string; kind?: string; pattern?: string; examples?: { text: string; meaning: string }[]; words?: string[]; lemma?: string; lemmaPlain?: string; head?: string; headPlain?: string; partOfSpeech?: string; binyan?: string }
// A saved word is its dictionary form (להדביק, not the הדביק that was tapped): `lemma`, `gloss`
// (the dictionary form's meanings), part of speech, root and binyan describe it. Each place it
// was met is an `Encounter`, so the same word met in several books stays one entry with one
// practice history. Entries saved before encounters existed keep that data at the top level.
export type VocabEntry = StarredItem & {
  partOfSpeech?: string; binyan?: string; encounters?: Encounter[]
  // Nouns: 'masculine' or 'feminine'.
  gender?: string
  // The dictionary form without niqqud, in full spelling: what identifies the word (lib/words.ts).
  lemmaPlain?: string
  // Practice cards, one per form, written stage by stage (see lib/forms.ts); `known` lists the
  // stages the learner marked as already known.
  forms?: FormCard[]; known?: string[]
  // The word card's own results (see Results), and stages the learner chose to study before
  // Mila brought them in.
  results?: boolean[]; last?: number; opened?: string[]
  // Conjugation checkpoints by stage: recalling a whole tense at once (lib/forms.ts).
  checkpoints?: Record<string, { results: boolean[]; last: number }>
  // An expression (partOfSpeech 'expression'): the word in it that inflects, which decides its
  // stages (a verb's tenses for לעבור דרך), and its plain spelling, which links the two.
  head?: { lemma: string; lemmaPlain?: string; partOfSpeech?: string; binyan?: string }
  // A word or expression learned as a pattern with an open place (נָטוּל + [שֵׁם עֶצֶם]); `gloss`
  // is then the pattern's meaning ("free of [noun]") and each encounter one example of it.
  pattern?: string
  vocalized?: string; context?: string; contextTranslation?: string; surface?: string
  senses?: string; form?: string; excerpt?: string; excerptTranslation?: string
}
// Where a word was met: the form on the page, its grammatical form and meaning there, the
// sentence, and a short excerpt of it for cards. `analysis` is the full explanation it was saved
// with, so tapping it again in that sentence shows it without asking the model again.
export type Encounter = {
  surface: string; vocalized?: string; form?: string; meaning: string; context: string; contextTranslation?: string
  // The words of `context` that are the saved word, in order (see lib/marks.ts); else `surface`.
  mark?: string
  excerpt?: string; excerptTranslation?: string; sourceRef?: { textId: string; chunkId: string }; at: number
  analysis?: WordAnalysis
}
// One card of a saved word: a meaning or a form (vocalized), its English, an example
// sentence and the learner's results on it. `mark` is the target's words as written in the
// sentence, in order and possibly apart (lib/marks.ts); `said` the same words vocalized, to be
// heard on their own.
export type FormCard = {
  key: string; stage: string; slot: string; he: string; en: string; sentence: string; mark: string; translation: string
  // The words of `translation` that render the card's word, marked on English → Hebrew cards.
  enMark?: string; said?: string
} & Results
// What studying has shown about a card, and nothing about when to see it again: its last few
// results (true: knew it) and when it was last answered (lib/forms.ts).
export type Results = { results?: boolean[]; last?: number }

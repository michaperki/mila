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
  lemma: string; lemmaPlain?: string; lemmaMeaning: string; root: string; partOfSpeech: string; gender?: string; feminine?: string; binyan: string; form: string; note: string
  readAs?: string; constructions?: Construction[]; governs?: Governed[]; phrase?: Phrase; excerpt?: { text: string; meaning: string }
  // The lemma's themes and register among saved words (VOCAB-2; lib/taxonomy.ts), kept with it when it is saved.
  categories?: string[]; register?: string
}
// One way a verb or adjective is built with what follows it, and what it means that way, learned
// with the word rather than as an expression of its own: `pattern` in full (לְהַזְכִּיר לְמִישֶׁהוּ
// אֶת מַשֶּׁהוּ), `chip` just its grammatical words (לְ־ … אֶת), whether its preposition is required,
// optional or none (את only), its meaning, the same in a word or two, and an example.
export type Construction = {
  pattern: string; chip: string; preposition: 'required' | 'optional' | 'none'; meaning: string
  short?: string; example?: string; exampleMeaning?: string
}
// Saved before constructions: a preposition the word takes, and what it means with it.
export type Governed = { preposition: string; meaning: string }
// The expression a tapped word belongs to: `text` as it stands in the sentence, `words` the
// expression's own words as written there, in order (other words may come between them),
// `lemma` its dictionary form (לַעֲבֹר דֶּרֶךְ for עוברים דרך), `head` the word in it that inflects
// and `partOfSpeech` what the whole behaves as (a verb for להעמיד פנים). A `kind` 'pattern' has an
// open place other words fill (נטול ינשופים is `pattern` נָטוּל + [שֵׁם עֶצֶם], "free of [noun]"):
// its `lemma` and `words` are the fixed words only, and `textMeaning` is what it means here
// ("owl-free"), with `examples` of other uses. Older explanations have only `text` and `meaning`.
// A fixed expression whose meaning doesn't plainly follow from its words also says how it is
// built: `literal` what it says word for word ("for the sake of the truth"), `built` its words in
// dictionary form with what each means in it, and `literalNote` how that comes to mean what it does.
export type Phrase = { text: string; meaning: string; textMeaning?: string; kind?: string; pattern?: string; examples?: { text: string; meaning: string }[]; words?: string[]; lemma?: string; lemmaPlain?: string; head?: string; headPlain?: string; partOfSpeech?: string; binyan?: string; categories?: string[]; register?: string } & Built
export type Built = { literal?: string; built?: BuiltPart[]; literalNote?: string }
export type BuiltPart = { lemma: string; lemmaPlain?: string; meaning: string }
// A saved word is its dictionary form (להדביק, not the הדביק that was tapped): `lemma`, `gloss`
// (the dictionary form's meanings), part of speech, root and binyan describe it. Each place it
// was met is an `Encounter`, so the same word met in several books stays one entry with one
// practice history. Entries saved before encounters existed keep that data at the top level.
// An expression saved with how it is built (see Phrase) keeps that too.
export type VocabEntry = StarredItem & Built & {
  partOfSpeech?: string; binyan?: string; encounters?: Encounter[]
  // Nouns: 'masculine' or 'feminine'.
  gender?: string
  // A noun for a person with a feminine form of its own (מַזְכִּיר, מַזְכִּירָה): `lemma` is the
  // masculine, this the feminine, and both are taught together (lib/words.ts bothForms).
  feminine?: string
  // The constructions the word is used in (see Construction); `governs` for words saved before.
  constructions?: Construction[]; governs?: Governed[]
  // The dictionary form without niqqud, in full spelling: what identifies the word (lib/words.ts).
  lemmaPlain?: string
  // Practice cards, one per form, written stage by stage (see lib/forms.ts); `known` lists the
  // stages the learner marked as already known.
  forms?: FormCard[]; known?: string[]
  // The word card's own results (see Results), and stages the learner chose to study before
  // Mila brought them in.
  results?: boolean[]; primed?: boolean[]; last?: number; opened?: string[]
  // Conjugation checkpoints by stage: recalling a whole tense at once (lib/forms.ts).
  checkpoints?: Record<string, { results: boolean[]; primed?: boolean[]; last: number }>
  // An expression (partOfSpeech 'expression'): the word in it that inflects, which decides its
  // stages (a verb's tenses for לעבור דרך), and its plain spelling, which links the two.
  head?: { lemma: string; lemmaPlain?: string; partOfSpeech?: string; binyan?: string }
  // A word or expression learned as a pattern with an open place (נָטוּל + [שֵׁם עֶצֶם]); `gloss`
  // is then the pattern's meaning ("free of [noun]") and each encounter one example of it.
  pattern?: string
  // Worked out by the server when the words are fetched, not stored (vocab.ts relevanceOf): how
  // common the word is in Hebrew (1 = the most common; none for a word or expression not ranked),
  // and how often it was looked up again after it was saved, and when last.
  rank?: number; lookedUp?: { count: number; last: number }
  // How it is organised (VOCAB-2, lib/taxonomy.ts): up to three themes, the main one first, its
  // register, a level where frequency can't place it, and the taxonomy version used. Set by the
  // explanation it was saved with, or by an import (functions/lib/data-tasks.ts).
  categories?: string[]; register?: string; level?: string; taxonomy?: string
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
  // Who the form is for when its English doesn't say and the Hebrew depends on it (👨 👩 👦 👧
  // or two faces for a group: 👨👨 👩👩 👨👩 👦👦 👧👧 👦👧), empty when it does; missing on cards written before (lib/forms.ts cueOf).
  cue?: string
  // The word of `translation` the cue is about, which it is shown right after ("secretary", "you").
  cueAfter?: string
  // Every person in the sentence the English leaves open, each with the word of `translation`
  // it is shown after ("" for first); `cue`/`cueAfter` are the first of them. Missing on cards
  // written before the whole sentence was cued (lib/forms.ts cuesOf).
  cues?: { cue: string; after: string }[]
  // Which use of the word the card shows ("flooding streets (weather)"), as the writer labelled
  // it: cards showing the same use have the same label. Missing on cards written before.
  usage?: string
  // What each other word of the sentence means there, by its place among the sentence's words
  // (split at spaces), with its dictionary form: tapped on the card, shown at once. Missing on
  // cards written before glosses (apps/web/netlify/functions/lib/forms-writer.ts Gloss).
  // `t`: the words of its translation that say it (cards written since 2026-11-16), for help on a card shown in English.
  glosses?: { i: number; lemma: string; en: string; t?: string }[]
  // Which writer wrote it ('base', or 'personal-v1' told what the learner knows) and what its other
  // words were to the learner then; missing on cards written before (word-forms.ts).
  writer?: string; support?: Record<string, number>
  // On a meaning card: three words of the same kind and form as the card's word that don't fit its
  // sentence, for filling in the blank (lib/forms.ts quizOf). Missing on cards written before.
  distractors?: string[]
  // New sentences for the card written later, newest last: the same form and meaning in another
  // sentence. The card's results are the card's, whichever sentence is shown (lib/forms.ts shownForm).
  variants?: FormVariant[]
} & Results
export type FormVariant = Pick<FormCard, 'he' | 'en' | 'sentence' | 'mark' | 'said' | 'translation' | 'enMark' | 'cue' | 'cueAfter' | 'cues' | 'usage' | 'glosses' | 'support' | 'distractors'> & { writer: string; at: number; why?: string }
// What studying has shown about a card, and nothing about when to see it again: its last few
// results (true: knew it), which of them were primed (answered just after the word's Hebrew was
// shown, lib/forms.ts isPrimed; by position, missing on answers given before this was kept) and
// when it was last answered (lib/forms.ts). On a sentence card, `on` says which of its sentences
// each of those answers was given on (0 its own, n its variant n; -1 not known, before this was
// kept) and `seen` every sentence it has been answered on (lib/forms.ts sentenceFor).
export type Results = { results?: boolean[]; primed?: boolean[]; last?: number; on?: number[]; seen?: number[] }

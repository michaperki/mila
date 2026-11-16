import type { FormCard, VocabEntry } from './types'
import { lemmaKey } from './words.ts'

// Hints on a card's question side: a tap on another word of the sentence shows what it means
// there, under the sentence, without turning the card over, so a sentence with a few unknown
// words around the one being studied can still be answered for that word. On a card shown in
// English the Hebrew sentence is shown first, on asking, with the card's own word left blank. The meaning comes from
// what is already at hand, in order: the card's own gloss for that place (written with the card),
// the learner's saved word spelled that way, and only then the sentence's quick meanings (one
// request a sentence, kept for everyone; cards written before glosses).
//
// What a hint is evidence of (functions/lib/learner.ts): the word hinted wasn't known well enough
// to read here, as a lookup on a card is; the card's answer that follows was given with those
// words supported, which the answer says (`hints`). A word not hinted says nothing: it may be
// known, guessed, or skipped.
export type Hint = { at: number; word: string; en: string; lemma?: string; from: 'card' | 'saved' | 'quick' }

// A hint from what is on the phone, or null when the sentence's quick meanings must be asked.
// Never the card's own word: the target (or a word saved under its dictionary form) would give
// the answer away, so that is `own` and the tap turns the card over instead.
export function hintFor(form: Pick<FormCard, 'glosses'>, target: Pick<VocabEntry, 'id' | 'lemma' | 'lemmaPlain'>, word: string, at: number,
  saved: { byLemma: Map<string, VocabEntry>; bySurface: Map<string, VocabEntry> }): Hint | 'own' | null {
  const targetKey = lemmaKey(target.lemmaPlain || target.lemma)
  const gloss = form.glosses?.find(item => item.i === at)
  if (gloss?.lemma && lemmaKey(gloss.lemma) === targetKey) return 'own'
  const entry = (gloss?.lemma ? saved.byLemma.get(lemmaKey(gloss.lemma)) : undefined) ?? saved.bySurface.get(lemmaKey(word))
  if (entry?.id === target.id) return 'own'
  if (gloss?.en) return { at, word, en: gloss.en, ...(gloss.lemma ? { lemma: gloss.lemma } : {}), from: 'card' }
  if (entry) return { at, word, en: entry.gloss, lemma: entry.lemmaPlain || entry.lemma, from: 'saved' }
  return null
}

// What a hint is logged as: a lookup on the card, on its question side (`hint`), with the word's
// dictionary form when known, whether it is one of the learner's saved words, and which side the
// card showed first: on an English one the word was tapped in the Hebrew sentence shown under the
// English, where a tap may only ask which word is which.
export const hintEvent = (hint: Hint, card: { key: string; position: number; front?: 'he' | 'en' }, saved: boolean) => ({
  key: card.key, position: card.position, word: hint.word, place: hint.at, hint: true, own: false, saved, front: card.front ?? 'he',
  glossed: hint.from === 'card', from: hint.from, ...(hint.lemma ? { lemma: hint.lemma } : {}),
})

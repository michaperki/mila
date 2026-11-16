import { hebrewPieces } from './marks.ts'
import { bareWord } from './ocr-cleanup.ts'

// Help with one word on a card shown in English (practice.tsx): the learner is building the
// Hebrew sentence from the English, knows which English word they are stuck on, and holds it; the
// Hebrew for that word, as the sentence has it, shows above it while held. A tap still turns the
// card over, and the card's own word (marked) gives nothing: it is what is being recalled.
//
// Which English words each Hebrew word says (`renders`, by the Hebrew word's place) comes from
// the card's glosses (`t`, written with it since 2026-11-16) or, for older cards, from the
// sentence's quick meanings asked with its English (sentence-glosses, once a sentence, kept).
//
// What a held word is evidence of (functions/lib/learner.ts): that Hebrew word wasn't there to
// produce, at that moment. The card's own answer is unaffected (the help was with another word),
// and a word not held says nothing either way.

export type Token = { start: number; end: number; text: string }
// The English as shown, split at spaces: each word with its punctuation, where it starts and ends.
export function englishTokens(text: string): Token[] {
  const tokens: Token[] = []
  for (const found of text.matchAll(/\S+/g)) tokens.push({ start: found.index!, end: found.index! + found[0].length, text: found[0] })
  return tokens
}
// The word a stretch of the text starting at `offset` belongs to.
export const tokenAt = (tokens: Token[], offset: number) => tokens.findIndex(token => offset >= token.start && offset < token.end)

const plain = (word: string) => word.toLowerCase().replace(/[’]/g, '\'').replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')

// Which English words (by their index among `tokens`) each Hebrew place says: each place's words
// found in the English as shown, in order, the first occurrence not taken by an earlier place.
// Cues shown in brackets ("(f.)", added by Study, not the translation's) are never matched.
export function alignment(tokens: Token[], renders: { place: number; t: string }[]) {
  const inCue = new Set<number>()
  let open = false
  tokens.forEach((token, i) => { if (token.text.startsWith('(')) open = true; if (open) inCue.add(i); if (token.text.includes(')')) open = false })
  const words = tokens.map(token => plain(token.text))
  const taken = new Map<number, number[]>()
  for (const { place, t } of renders) {
    const wanted = t.split(/\s+/).map(plain).filter(Boolean)
    if (!wanted.length) continue
    for (let start = 0; start + wanted.length <= words.length; start++) {
      const span = wanted.map((_, k) => start + k)
      if (span.some(i => inCue.has(i) || words[i] !== wanted[span.indexOf(i)])) continue
      if (span.some(i => taken.has(i) && !taken.get(i)!.includes(place))) continue
      for (const i of span) taken.set(i, [...(taken.get(i) ?? []), place])
      break
    }
  }
  return taken
}

// The places of the Hebrew sentence that are the card's own word (as the card marks them).
export function targetPlaces(sentence: string, mark: string) {
  const places = new Set<number>()
  let at = -1
  for (const piece of hebrewPieces(sentence, mark)) {
    if (piece.text && !/^\s+$/.test(piece.text)) at++
    if (piece.marked && bareWord(piece.text)) places.add(at)
  }
  return places
}

export type Help = { kind: 'hebrew'; places: number[]; hebrew: string } | { kind: 'none' } | { kind: 'target' }
// What holding the English word at `index` gives: the Hebrew words that say it, as written in the
// sentence; "part of the word you're recalling" when they are the card's own; or no word of its
// own in Hebrew (a copula left out, "the" in a prefix) when none says it.
export function helpFor(index: number, aligned: Map<number, number[]>, sentence: string, target: Set<number>): Help {
  const places = aligned.get(index)
  if (!places?.length) return { kind: 'none' }
  if (places.some(place => target.has(place))) return { kind: 'target' }
  const words = sentence.split(/\s+/).filter(Boolean)
  return { kind: 'hebrew', places, hebrew: places.map(place => bareWord(words[place] ?? '')).filter(Boolean).join(' ') }
}

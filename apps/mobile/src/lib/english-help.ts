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
// Cues Study adds (a person's 👩, or in brackets) are never matched, and don't break a match.
// `unplaced`: how many places' words weren't found as written (the model put them otherwise), so
// an English word left over may be one of them rather than one Hebrew has no word for.
export function alignment(tokens: Token[], renders: { place: number; t: string }[]): Map<number, number[]> & { unplaced: number } {
  const inCue = new Set<number>()
  let open = false
  tokens.forEach((token, i) => { if (token.text.startsWith('(')) open = true; if (open) inCue.add(i); if (token.text.includes(')')) open = false })
  // The words that can be matched, by index: not a cue, and with letters (a person cue such as 👩
  // stands between words without being one).
  const usable = tokens.map((token, i) => ({ i, word: plain(token.text) })).filter(item => item.word && !inCue.has(item.i))
  const taken = new Map<number, number[]>()
  let unplaced = 0
  for (const { place, t } of renders) {
    const wanted = t.split(/\s+/).map(plain).filter(Boolean)
    if (!wanted.length) continue
    let found = false
    // In order, the first word anywhere not taken by another place, each next one within the
    // next few words (an English phrase can have words between its own: "would only come").
    const free = (k: number) => !taken.has(usable[k].i) || taken.get(usable[k].i)!.includes(place)
    for (let start = 0; start < usable.length && !found; start++) {
      if (usable[start].word !== wanted[0] || !free(start)) continue
      const span = [start]
      for (const word of wanted.slice(1)) {
        const last = span[span.length - 1]
        const next = usable.findIndex((item, k) => k > last && k <= last + 3 && item.word === word && free(k))
        if (next === -1) break
        span.push(next)
      }
      if (span.length < wanted.length) continue
      for (const k of span) taken.set(usable[k].i, [...(taken.get(usable[k].i) ?? []), place])
      found = true
    }
    if (!found) unplaced++
  }
  return Object.assign(taken, { unplaced })
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

export type Help = { kind: 'hebrew'; places: number[]; hebrew: string } | { kind: 'none' } | { kind: 'unknown' } | { kind: 'target' }
// What holding the English word at `index` gives: the Hebrew words that say it, as written in the
// sentence; "part of the word you're recalling" when they are the card's own; no word of its own
// in Hebrew (a copula left out, "the" in a prefix) when every Hebrew word was found in the English
// and none says it; and, when some weren't, not found, rather than a claim that there is none.
export function helpFor(index: number, aligned: Map<number, number[]> & { unplaced?: number }, sentence: string, target: Set<number>): Help {
  const places = aligned.get(index)
  if (!places?.length) return aligned.unplaced ? { kind: 'unknown' } : { kind: 'none' }
  if (places.some(place => target.has(place))) return { kind: 'target' }
  const words = sentence.split(/\s+/).filter(Boolean)
  return { kind: 'hebrew', places, hebrew: places.map(place => bareWord(words[place] ?? '')).filter(Boolean).join(' ') }
}

// Whether a card's sentence has its word data (glosses saying which English words each Hebrew
// word is), as cards written since 2026-11-16 do and older ones get once prepared (card-words).
type Sentence = { sentence?: string; translation?: string; glosses?: { i: number; lemma: string; en: string; t?: string }[] }
export const hasWords = (item: Sentence) => !!item.glosses?.some(gloss => gloss.t !== undefined)
// A sentence card with a sentence still without it: Study prepares it before it is shown.
export const needsWords = (form: Sentence & { variants?: Sentence[] }) =>
  [form, ...(form.variants || [])].some(item => !!item.sentence && !!item.translation && !hasWords(item))

// A word's entry with a card's sentences given their word data (`variant` -1: its own sentence).
export function withSentenceWords<E extends { forms?: (Sentence & { key: string; variants?: Sentence[] })[] }>(entry: E, key: string, sentences: { variant: number; glosses: NonNullable<Sentence['glosses']> }[]): E {
  if (!sentences.length || !entry.forms?.some(form => form.key === key)) return entry
  return {
    ...entry,
    forms: entry.forms.map(form => {
      if (form.key !== key) return form
      const own = sentences.find(item => item.variant < 0)
      return {
        ...form, ...(own ? { glosses: own.glosses } : {}),
        ...(form.variants ? { variants: form.variants.map((item, i) => { const done = sentences.find(other => other.variant === i); return done ? { ...item, glosses: done.glosses } : item }) } : {}),
      }
    }),
  }
}

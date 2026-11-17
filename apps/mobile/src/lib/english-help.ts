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
// A contraction or possessive is one English word but often two Hebrew ones (I'm: אני; doctor's:
// של הרופא), and the card's word data names the pieces ("I", "'m going", "'s", "n't").
const piecesOf = (word: string) => {
  const not = word.match(/^(.+)(n't)$/)
  if (not) return [not[1], not[2]]
  const clitic = word.match(/^(.+)('(?:m|s|re|ve|ll|d))$/)
  return clitic ? [clitic[1], clitic[2]] : word.endsWith('s\'') ? [word.slice(0, -1), '\''] : []
}
// Words English uses where Hebrew uses a prefix or nothing: one may serve two Hebrew words
// ("to the problem" and "the parking", both from "to the parking problem"), and a place whose
// words aren't all found is placed by its other words.
const LIGHT = new Set(['the', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'with', 'by', 'from', 'that', 'is', 'are', 'was', 'were', 'be', "'s", "'", "'m", "'re", "n't"])

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
  const usable = tokens.map((token, i) => ({ i, word: plain(token.text) })).filter(item => item.word && !inCue.has(item.i)).map(item => ({ ...item, pieces: piecesOf(item.word) }))
  const taken = new Map<number, number[]>()
  // A word may be had by another place too when it is a light one, or only a piece of it is meant;
  // but a word of its own, not had by another, is tried first (`shared` false).
  let shared = false
  const fits = (k: number, word: string) => usable[k].word === word || (shared && usable[k].pieces.includes(word))
  const free = (k: number, word: string, place: number) => !taken.has(usable[k].i) || taken.get(usable[k].i)!.includes(place) || (shared && (LIGHT.has(word) || usable[k].word !== word))
  const place = (at: number, wanted: string[]) => {
    shared = false
    if (placeAs(at, wanted)) return true
    shared = true
    return placeAs(at, wanted)
  }
  const placeAs = (at: number, wanted: string[]) => {
    for (let start = 0; start < usable.length; start++) {
      if (!fits(start, wanted[0]) || !free(start, wanted[0], at)) continue
      const span = [start]
      for (const word of wanted.slice(1)) {
        const last = span[span.length - 1]
        // In order, each next word within the next few (an English phrase can have words between
        // its own: "would only come"); a contraction's pieces are in the same word.
        const next = usable.findIndex((item, k) => k >= last && k <= last + 3 && (k > last || item.pieces.includes(word)) && fits(k, word) && free(k, word, at))
        if (next === -1) break
        span.push(next)
      }
      if (span.length < wanted.length) continue
      for (const k of new Set(span)) taken.set(usable[k].i, [...(taken.get(usable[k].i) ?? []), at])
      return true
    }
    return false
  }
  let unplaced = 0
  const missed: { at: number; wanted: string[] }[] = []
  // Longer renderings first: they fit fewer places ("we change" needs the "we" before "change";
  // "We" alone can be the "We" of "We're").
  const wanted = renders.map(({ place: at, t }) => ({ at, wanted: t.split(/\s+/).map(plain).filter(Boolean) })).filter(item => item.wanted.length)
  for (const item of [...wanted].sort((a, b) => b.wanted.length - a.wanted.length)) if (!place(item.at, item.wanted)) missed.push(item)
  // Then, by their other words, the places not found as written ("the parking" where the English
  // has "the" taken before it, "at wedding" for "at my brother's wedding").
  for (const { at, wanted } of missed) {
    const heavy = wanted.filter(word => !LIGHT.has(word))
    if (!(heavy.length && heavy.length < wanted.length && place(at, heavy)) && !(heavy.length > 1 && heavy.every(word => place(at, [word])))) unplaced++
  }
  return Object.assign(new Map([...taken.entries()].sort(([a], [b]) => a - b).map(([i, places]) => [i, [...places].sort((a, b) => a - b)])), { unplaced })
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
  const ordered = [...places].sort((a, b) => a - b)
  return { kind: 'hebrew', places: ordered, hebrew: ordered.map(place => bareWord(words[place] ?? '')).filter(Boolean).join(' ') }
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

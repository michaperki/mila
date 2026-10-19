import { bareWord, stripNiqqud } from './ocr-cleanup.ts'

// The words of a sentence that are its target: a word, a form, or an expression (לעבור דרך,
// להעמיד פנים) as it occurs there. A mark lists the target's words as written, in order and
// space-separated (עוברים דרך), and other words may come between them in the sentence
// (מעמיד את עצמו פנים), so a target is never assumed to be one contiguous run.

const PREFIX = /^[והבכלמש]{1,3}$/
const hebrew = (text: string) => stripNiqqud(bareWord(text)).replace(/[־]/g, '')
const english = (text: string) => bareWord(text).toLowerCase()

// The indexes of `words` that match `marks`' words in order, allowing gaps. A word matches when
// it is the mark's word, or that word with attached prefix letters (ו, ש, ה …) the mark leaves
// out. The shortest stretch that holds every mark word wins; if none holds them all, as many as
// can be found in order from the first one found.
export function matchInOrder(words: string[], marks: string[], same: (word: string, mark: string) => boolean): number[] {
  const wanted = marks.flatMap(mark => mark.split(/\s+/)).filter(Boolean)
  if (!wanted.length) return []
  let best: number[] | null = null
  let partial: number[] = []
  for (let start = 0; start < words.length; start++) {
    if (!same(words[start], wanted[0])) continue
    const found = [start]
    for (let i = start + 1; i < words.length && found.length < wanted.length; i++) if (same(words[i], wanted[found.length])) found.push(i)
    if (found.length === wanted.length) {
      if (!best || found[found.length - 1] - found[0] < best[best.length - 1] - best[0]) best = found
    } else if (found.length > partial.length) partial = found
  }
  return best ?? partial
}

const sameHebrew = (word: string, mark: string) => {
  const a = hebrew(word), b = hebrew(mark)
  return !!b && (a === b || (a.endsWith(b) && PREFIX.test(a.slice(0, a.length - b.length))))
}
const sameEnglish = (word: string, mark: string) => { const b = english(mark); return !!b && english(word) === b }

// A sentence split for display (words and the spaces between them), and which pieces are marked.
export type Piece = { text: string; marked: boolean }
function piecesOf(sentence: string, mark: string | undefined, same: (word: string, mark: string) => boolean): Piece[] {
  const pieces = sentence.split(/(\s+)/)
  const words = pieces.map((piece, i) => ({ piece, i })).filter(item => item.piece && !/^\s+$/.test(item.piece))
  const hit = new Set(matchInOrder(words.map(item => item.piece), mark ? [mark] : [], same).map(index => words[index].i))
  return pieces.map((text, i) => ({ text, marked: hit.has(i) }))
}
export const hebrewPieces = (sentence: string, mark?: string) => piecesOf(sentence, mark, sameHebrew)
export const englishPieces = (sentence: string, mark?: string) => piecesOf(sentence, mark, sameEnglish)

// The attached prefix of a marked word that a quiz blank keeps (ו in ושפתחנו): what the word has
// before the form's own letters.
export function prefixOf(word: string, form: string) {
  const a = hebrew(word), b = hebrew(form)
  return b && a.endsWith(b) && a !== b ? a.slice(0, a.length - b.length) : ''
}

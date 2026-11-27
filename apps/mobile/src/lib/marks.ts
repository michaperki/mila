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
// Whether every word of the mark is in the sentence, in order: what a quiz blanks out.
export const markedIn = (sentence: string, mark: string) => {
  const words = sentence.split(/\s+/).filter(Boolean), wanted = (mark || '').split(/\s+/).filter(Boolean)
  return !!wanted.length && matchInOrder(words, [mark], sameHebrew).length === wanted.length
}
export const englishPieces = (sentence: string, mark?: string) => piecesOf(sentence, mark, sameEnglish)

// The attached prefix of a marked word that a quiz blank keeps (ו in ושפתחנו): what the word has
// before the form's own letters, however fully each is spelled (ה in הזהובה for זְהֻבָּה).
export function prefixOf(word: string, form: string) {
  return splitPrefix(word, form) ?? ''
}

// The same word but for how fully it is spelled (חסרה, חֲסֵרָה; מסבה, מְסִבָּה): its letters without ו and י.
const loose = (text: string) => hebrew(text).replace(/[וי]/g, '')
// The prefix letters (up to three of והבכלמש) a word of the sentence has before `form`, or null
// when it isn't that form at all. Letter for letter first; then however fully spelled, the stem
// starting with the form's first letter (so the ו of ושמר is a prefix, not a full spelling).
function splitPrefix(word: string, form: string): string | null {
  const a = hebrew(word), b = hebrew(form)
  if (!a || !b) return null
  if (a === b) return ''
  if (a.endsWith(b) && PREFIX.test(a.slice(0, a.length - b.length))) return a.slice(0, a.length - b.length)
  if (b.length < 2) return null
  for (let n = 0; n <= Math.min(3, a.length - 1); n++) {
    const prefix = a.slice(0, n), stem = a.slice(n)
    if (n && !PREFIX.test(prefix)) break
    if (stem[0] === b[0] && loose(stem) === loose(b)) return prefix
  }
  return null
}

// A card's form as its sentence writes it: each of the form's words as the marked word there has
// it, without an attached prefix (חסרה for חֲסֵרָה, מסבה for מְסִבָּה, זהובה in הזהובה), so a quiz's
// right answer reads exactly as the completed sentence will. A pattern's open preposition, written
// with what it governs (לי for the ל of גורם ל), stays the form's. null when a marked word is
// another form than the card's (חסרי, construct, on a card for חֲסֵרִים): the sentence doesn't
// show the form, so there is no fair choice to make.
export function asWritten(form: string, mark: string): string | null {
  // A maqaf joins words a sentence may write apart (אִי־נוֹחֻיּוֹת, באי נוחויות).
  const forms = form.replace(/[־]/g, ' ').split(/\s+/).filter(Boolean), marks = (mark || '').replace(/[־]/g, ' ').split(/\s+/).filter(Boolean)
  if (!forms.length || marks.length < forms.length) return null
  const out: string[] = []
  for (let i = 0; i < forms.length; i++) {
    const f = hebrew(forms[i])
    if (f.length === 1) { if (hebrew(marks[i]).startsWith(f)) { out.push(f); continue } return null }
    const prefix = splitPrefix(marks[i], forms[i])
    if (prefix === null) return null
    out.push(hebrew(marks[i]).slice(prefix.length))
  }
  return out.join(' ')
}

// The sentence as a quiz asks it: each marked word that is one of the form's words as its prefix
// (ו, ש: kept) and a blank. Marked words past the form's are the rest of an expression the form
// is used in (מתהפכים בקברם for מִתְהַפְּכִים) and stay as written, so one choice fills one blank.
export type QuizPiece = Piece & { blank?: { prefix: string } }
export function blankedPieces(sentence: string, mark: string, form: string): QuizPiece[] {
  const own = form.replace(/[־]/g, ' ').split(/\s+/).filter(Boolean)
  let k = 0
  return hebrewPieces(sentence, mark).map(piece => {
    if (!piece.marked) return piece
    const word = own[k++]
    return word === undefined ? piece : { ...piece, blank: { prefix: prefixOf(piece.text, word) } }
  })
}

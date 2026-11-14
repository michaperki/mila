import { HEBREW_BY_FREQUENCY } from './frequency-he.ts'

// How common a Hebrew word is, as its rank among the words said most often (1 is the most common;
// lib/frequency-he.ts). The list counts words as written, so a word's own rank is for that form
// only: a verb's infinitive (לרצות) is far rarer than its everyday forms (רוצה, 25), and a
// word with a prefix (והבית) is counted apart from the word (בית). So a word is ranked by the most
// common of the ways it is given (its dictionary form and the forms it was met in), and a form
// not on the list is tried without the prefixes it may have. A listed form keeps its own rank
// even with a prefix, since taking one off can leave another word (בכי is not כי). Ranks are
// rough: they tell everyday words from rare ones, not one common word from the next.
let ranks: Map<string, number> | null = null
const rankMap = () => (ranks ??= new Map(HEBREW_BY_FREQUENCY.split(' ').map((word, i) => [word, i + 1])))
export const LISTED = 30000

// The spelling the list uses: no niqqud, no punctuation; a maqaf or space keeps only the words.
export const plainWord = (word: string) => word.normalize('NFD').replace(/[֑-ׇ]/g, '').replace(/[^א-ת"׳״'\s־-]/g, '').trim()

// Prefixes a word may be written with (ו ה ב ל מ ש כ and their combinations), longest first.
const PREFIXES = ['וכש', 'ושה', 'וכשה', 'שכש', 'ומה', 'ומ', 'וה', 'וב', 'ול', 'וש', 'וכ', 'שה', 'שב', 'של', 'שמ', 'כש', 'מה', 'בה', 'לה', 'כה', 'ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ']
  .sort((a, b) => b.length - a.length)

// One written word's rank, or undefined when neither it nor it without a prefix is listed.
export function rankOfForm(word: string): number | undefined {
  const plain = plainWord(word)
  if (!plain || /\s|־|-/.test(plain)) return undefined
  const map = rankMap()
  const own = map.get(plain)
  if (own) return own
  for (const prefix of PREFIXES) {
    if (!plain.startsWith(prefix) || plain.length - prefix.length < 2) continue
    const rank = map.get(plain.slice(prefix.length))
    if (rank) return rank
  }
  return undefined
}

// A word's rank: the most common of the forms it is given in (its dictionary form first).
// An expression of several words is as rare as its rarest word.
export function rankOf(...forms: (string | undefined)[]): number | undefined {
  const found: number[] = []
  for (const form of forms) {
    if (!form) continue
    const words = plainWord(form).split(/[\s־-]+/).filter(Boolean)
    if (words.length > 1) {
      const each = words.map(rankOfForm)
      if (each.every(Boolean)) found.push(Math.max(...each as number[]))
    } else {
      const rank = rankOfForm(form)
      if (rank) found.push(rank)
    }
  }
  return found.length ? Math.min(...found) : undefined
}

// The words of a stretch of the list, for a vocabulary check (scripts/personalize.mjs level).
export const wordsRanked = (from: number, to: number) => HEBREW_BY_FREQUENCY.split(' ').slice(from - 1, to)

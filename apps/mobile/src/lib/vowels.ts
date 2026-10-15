import { stripNiqqud } from './ocr-cleanup.ts'

// One vowels setting (`showNiqqud`) governs every screen: the reader text, word explanations,
// flashcards and the vocabulary list. Explanations always arrive vowelled, so they follow it too.
export const withVowels = (text: string, show: boolean) => (show ? text : stripNiqqud(text))

// Vowel points and cantillation, not the maqaf, paseq or sof pasuq punctuation in that block.
const MARK = /[֑-ׇֽֿׁׂׅׄ]/
const LETTER = /[א-ת]/
// A text is vowelled when a good share of its Hebrew words carry marks. Unvowelled prose
// (a novel, a newspaper) still dots a few names and ambiguous words; that doesn't count.
export function isVowelled(text: string, share = 1 / 3) {
  const words = text.split(/\s+/).filter(word => LETTER.test(word))
  return words.length > 0 && words.filter(word => MARK.test(word)).length >= words.length * share
}

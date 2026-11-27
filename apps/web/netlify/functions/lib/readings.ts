// A word's reading from the sentence's quick meanings (lib/sentence-words.ts), kept only when it
// has vowels and the word's own letters: those printed, less any ו or י that full spelling adds
// and vowelled spelling leaves out (מדבר, מְדַבֵּר). One with a letter the word
// doesn't have (סִפְרוֹ for ספר) is another word, and would be said for this one.
const letters = (text: string) => text.replace(/[\u0591-\u05C7]/g, '').replace(/[^א-ת]/g, '')
export function readingOf(word: string, reading: string) {
  if (!reading || !/[\u05B0-\u05BC\u05C1\u05C2\u05C7]/.test(reading)) return ''
  const printed = letters(word), read = letters(reading)
  let i = 0
  for (const letter of printed) {
    if (read[i] === letter) i++
    else if (letter !== 'ו' && letter !== 'י') return ''
  }
  return read.length && i === read.length ? reading.trim() : ''
}

// The English words that say a tapped Hebrew word, marked in its sentence's translation
// (2026-11-27): each of `renders` (lib/recognition.ts sentenceWords, copied from the translation)
// is marked only where it stands exactly once in it, as whole words; one found nowhere or more
// than once marks nothing, rather than the wrong words. Returns the text in pieces, in order.
export type EnglishPiece = { text: string; marked: boolean }
const isWordChar = (char: string | undefined) => !!char && /[\p{L}\p{N}'’]/u.test(char)
export function englishMatch(text: string, renders: string[]): EnglishPiece[] {
  const ranges: [number, number][] = []
  for (const render of renders.map(item => item.trim()).filter(Boolean)) {
    const found: number[] = []
    for (let at = text.indexOf(render); at !== -1; at = text.indexOf(render, at + 1)) {
      if (!isWordChar(text[at - 1]) && !isWordChar(text[at + render.length])) found.push(at)
    }
    if (found.length !== 1) continue
    const range: [number, number] = [found[0], found[0] + render.length]
    if (!ranges.some(([a, b]) => range[0] < b && a < range[1])) ranges.push(range)
  }
  ranges.sort((a, b) => a[0] - b[0])
  const pieces: EnglishPiece[] = []
  let at = 0
  for (const [a, b] of ranges) {
    if (a > at) pieces.push({ text: text.slice(at, a), marked: false })
    pieces.push({ text: text.slice(a, b), marked: true })
    at = b
  }
  if (at < text.length || !pieces.length) pieces.push({ text: text.slice(at), marked: false })
  return pieces
}

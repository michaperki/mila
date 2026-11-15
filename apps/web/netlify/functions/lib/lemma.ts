// A word's identity: its dictionary form as plainly written (no niqqud, a maqaf read as a space),
// so the same word saved with other vowels is one entry. Mirrors apps/mobile/src/lib/words.ts.
export const lemmaKeyOf = (text: string) => text.normalize('NFC').replace(/[\u05BE\-–]/g, ' ').replace(/[\u0591-\u05C7]/g, '')
  .replace(/'/g, '׳').replace(/"/g, '״').replace(/[,،，.!?]/g, '').replace(/\s+/g, ' ').trim()
// The same written without its vowels (niqqud and cantillation), as `lemmaPlain` keeps it.
export const plainOf = (text: string) => text.normalize('NFC').replace(/[\u0591-\u05C7]/g, '').trim()

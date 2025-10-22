import type { TokenSpan } from './types'

const MAQAF_PATTERN = /[-–־]/

/**
 * Tokenises Hebrew text while preserving start/end offsets.
 * Whitespace delimits tokens, but maqaf (־) and hyphen variants remain inside tokens.
 */
export function tokenizeHebrew(text: string): TokenSpan[] {
  const spans: TokenSpan[] = []
  let tokenStart = -1

  for (let index = 0; index <= text.length; index += 1) {
    const char = text[index] ?? ' '

    if (tokenStart === -1) {
      if (!/\s/.test(char)) {
        tokenStart = index
      }
      continue
    }

    const isWhitespace = /\s/.test(char)
    const isMaqaf = MAQAF_PATTERN.test(char)

    if (!isWhitespace || isMaqaf) {
      continue
    }

    const tokenEnd = index
    spans.push({
      text: text.slice(tokenStart, tokenEnd),
      start: tokenStart,
      end: tokenEnd,
    })
    tokenStart = -1
  }

  if (tokenStart !== -1) {
    spans.push({
      text: text.slice(tokenStart),
      start: tokenStart,
      end: text.length,
    })
  }

  return spans
}

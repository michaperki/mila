/**
 * Normalises Hebrew strings for downstream NLP processing.
 * - NFC canonical form
 * - Strips niqqud and cantillation marks
 * - Replaces typographic quotes with ASCII equivalents
 * - Collapses repeated whitespace
 */
export function normalizeHebrew(input: string): string {
  return input
    .normalize('NFC')
    .replace(/[\u0591-\u05C7]/g, '') // remove diacritics
    .replace(/[״”]/g, '"')
    .replace(/[׳’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// RTL handling utilities for Hebrew text

/**
 * Ensures text is properly wrapped with RTL direction
 */
export function wrapRtl(text: string): string {
  return `<span dir="rtl">${text}</span>`;
}

/**
 * Normalizes zero-width characters in Hebrew text
 * - Removes zero-width joiners, non-joiners, and other invisible formatting characters
 */
export function normalizeZeroWidth(text: string): string {
  return text
    // Remove zero-width joiner
    .replace(/\u200D/g, '')
    // Remove zero-width non-joiner
    .replace(/\u200C/g, '')
    // Remove zero-width space
    .replace(/\u200B/g, '')
    // Remove word joiner
    .replace(/\u2060/g, '')
    // Remove left-to-right mark
    .replace(/\u200E/g, '')
    // Remove right-to-left mark
    .replace(/\u200F/g, '');
}

/**
 * Detects if text contains Hebrew characters
 */
export function containsHebrew(text: string): boolean {
  // Hebrew Unicode range (includes Biblical Hebrew)
  const hebrewPattern = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
  return hebrewPattern.test(text);
}

/**
 * Gets the text direction (rtl or ltr) based on content
 */
export function getTextDirection(text: string): 'rtl' | 'ltr' {
  return containsHebrew(text) ? 'rtl' : 'ltr';
}

/**
 * Creates an HTML element with proper RTL attributes
 */
export function createRtlElement(tag: string, text: string, attributes: Record<string, string> = {}): string {
  const direction = getTextDirection(text);
  const attrs = Object.entries(attributes)
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');
  
  return `<${tag} dir="${direction}" ${attrs}>${text}</${tag}>`;
}
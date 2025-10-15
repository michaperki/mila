// Nikud (Hebrew vowel points) handling utilities

/**
 * Checks if a character is a Hebrew vowel (nikud)
 */
export function isNikud(char: string): boolean {
  // Unicode range for Hebrew vowel points (nikud)
  const nikudPattern = /[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/;
  return nikudPattern.test(char);
}

/**
 * Removes all nikud (vowel points) from Hebrew text
 */
export function removeNikud(text: string): string {
  // Filter out all characters in the nikud Unicode range
  return text.replace(/[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g, '');
}

/**
 * Checks if text contains nikud
 */
export function hasNikud(text: string): boolean {
  const nikudPattern = /[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/;
  return nikudPattern.test(text);
}

/**
 * Toggles display of Hebrew text with or without nikud
 */
export function toggleNikud(text: string, showNikud: boolean): string {
  if (showNikud) {
    return text; // Return original text with nikud
  } else {
    return removeNikud(text); // Return text without nikud
  }
}
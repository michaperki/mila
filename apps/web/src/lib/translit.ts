// Hebrew transliteration utility
// A simple mapping-based transliteration system

// Basic Hebrew to Latin transliteration map
const hebrewToLatin: Record<string, string> = {
  'א': 'ʾ',
  'ב': 'b',
  'ג': 'g',
  'ד': 'd',
  'ה': 'h',
  'ו': 'v',
  'ז': 'z',
  'ח': 'ḥ',
  'ט': 'ṭ',
  'י': 'y',
  'כ': 'k',
  'ך': 'kh',
  'ל': 'l',
  'מ': 'm',
  'ם': 'm',
  'נ': 'n',
  'ן': 'n',
  'ס': 's',
  'ע': 'ʿ',
  'פ': 'p',
  'ף': 'f',
  'צ': 'ts',
  'ץ': 'ts',
  'ק': 'q',
  'ר': 'r',
  'ש': 'sh',
  'ת': 't',
  // Nikud is ignored in this simple implementation
  // Add more mappings as needed for a more accurate transliteration
};

/**
 * Performs basic transliteration of Hebrew text to Latin characters
 */
export function transliterate(text: string): string {
  let result = '';
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (hebrewToLatin[char]) {
      result += hebrewToLatin[char];
    } else {
      // For characters not in our map (like spaces, punctuation, nikud)
      result += char;
    }
  }
  
  return result;
}
/**
 * Hebrew root extraction utilities
 * 
 * This module provides functionality for extracting the triliteral roots
 * from Hebrew words. It's based on common morphological patterns and
 * implements a simplified approach for educational applications.
 */

import { removeNikud } from './nikud';

// Common Hebrew prefixes to remove before root extraction
const PREFIXES = ['ו', 'ה', 'ב', 'כ', 'ל', 'מ', 'ש', 'כש', 'שה', 'לה', 'מה', 'וה', 'וכ', 'ול', 'ומ', 'וש'];

// Common Hebrew suffixes to remove before root extraction
const SUFFIXES = ['ים', 'ות', 'תי', 'נו', 'תם', 'תן', 'ה', 'ת', 'י', 'ו', 'ן', 'כם', 'כן', 'הם', 'הן', 'יו', 'יה'];

// Common verb patterns with their root positions
// The numbers represent the position of the root letter in the normalized word
const VERB_PATTERNS = [
  // Pa'al (קל)
  { pattern: 'פעל', positions: [0, 1, 2] },      // כתב (present masculine singular)
  { pattern: 'פועל', positions: [0, 2, 3] },     // כותב (present masculine singular)
  { pattern: 'פעלה', positions: [0, 1, 2] },     // כתבה (past feminine singular)
  { pattern: 'פעלו', positions: [0, 1, 2] },     // כתבו (past plural)
  { pattern: 'יפעל', positions: [1, 2, 3] },     // יכתוב (future masculine singular)
  { pattern: 'תפעל', positions: [1, 2, 3] },     // תכתוב (future feminine singular)
  { pattern: 'לפעול', positions: [2, 3, 4] },    // לכתוב (infinitive)

  // Pi'el (פיעל)
  { pattern: 'פיעל', positions: [0, 2, 3] },     // דיבר (past masculine singular)
  { pattern: 'מפעל', positions: [1, 2, 3] },     // מדבר (present masculine singular)
  { pattern: 'יפעל', positions: [1, 2, 3] },     // ידבר (future masculine singular)
  { pattern: 'לפעל', positions: [2, 3, 4] },     // לדבר (infinitive)

  // Hif'il (הפעיל)
  { pattern: 'הפעיל', positions: [1, 3, 4] },    // הפעיל (past masculine singular)
  { pattern: 'מפעיל', positions: [1, 3, 4] },    // מפעיל (present masculine singular)
  { pattern: 'יפעיל', positions: [1, 3, 4] },    // יפעיל (future masculine singular)
  { pattern: 'להפעיל', positions: [3, 5, 6] },   // להפעיל (infinitive)

  // Hitpa'el (התפעל)
  { pattern: 'התפעל', positions: [2, 4, 5] },    // התלבש (past masculine singular)
  { pattern: 'מתפעל', positions: [2, 4, 5] },    // מתלבש (present masculine singular)
  { pattern: 'יתפעל', positions: [2, 4, 5] },    // יתלבש (future masculine singular)
  { pattern: 'להתפעל', positions: [4, 6, 7] }    // להתלבש (infinitive)
];

// Common noun patterns with their root positions
const NOUN_PATTERNS = [
  { pattern: 'פעל', positions: [0, 1, 2] },      // דבר (simple noun)
  { pattern: 'פעלה', positions: [0, 1, 2] },     // כתבה (feminine noun)
  { pattern: 'פעלון', positions: [0, 1, 2] },    // דברון (diminutive)
  { pattern: 'פעלן', positions: [0, 1, 2] },     // דברן (profession)
  { pattern: 'פעלות', positions: [0, 1, 2] },    // דברות (abstract noun)
  { pattern: 'תפעיל', positions: [1, 3, 4] },    // תכתיב (noun from Hif'il)
  { pattern: 'מפעל', positions: [1, 2, 3] },     // מדבר (place or instrument)
  { pattern: 'פעלי', positions: [0, 1, 2] },     // דברי (construct form)
  { pattern: 'פעילה', positions: [0, 2, 3] }     // פעילה (adjective feminine)
];

/**
 * Extracts the likely triliteral root from a Hebrew word
 * @param word The Hebrew word to analyze
 * @returns The extracted root or null if no root could be determined
 */
export function extractRoot(word: string): string | null {
  if (!word || word.length < 2) {
    return null;
  }

  // Remove vowel points (nikud) for consistent processing
  const normalized = removeNikud(word);

  // Skip non-Hebrew words and very short words
  if (!/[\u0590-\u05FF\uFB1D-\uFB4F]/.test(normalized) || normalized.length < 2) {
    return null;
  }
  
  // First try to extract root by removing affixes
  const rootByStripping = extractRootByStrippingAffixes(normalized);
  if (rootByStripping && rootByStripping.length >= 2) {
    return rootByStripping;
  }
  
  // Then try to match against known patterns
  const rootByPattern = extractRootByPatterns(normalized);
  if (rootByPattern) {
    return rootByPattern;
  }
  
  // If the word is 3 letters, it might itself be a root
  if (normalized.length === 3 && isValidHebrewRoot(normalized)) {
    return normalized;
  }
  
  // If the word is 2 letters, it might be a defective root (missing י or ו)
  if (normalized.length === 2 && isValidHebrewRoot(normalized)) {
    return normalized;
  }
  
  return null;
}

/**
 * Extracts a root by stripping common prefixes and suffixes
 */
function extractRootByStrippingAffixes(word: string): string | null {
  let result = word;
  
  // Remove prefixes
  for (const prefix of PREFIXES) {
    if (result.startsWith(prefix) && result.length > prefix.length + 1) {
      result = result.substring(prefix.length);
      break; // Only remove one prefix
    }
  }
  
  // Remove suffixes
  for (const suffix of SUFFIXES) {
    if (result.endsWith(suffix) && result.length > suffix.length + 1) {
      result = result.substring(0, result.length - suffix.length);
      break; // Only remove one suffix
    }
  }
  
  // If the result is 3 letters, it might be a root
  if (result.length === 3 && isValidHebrewRoot(result)) {
    return result;
  }
  
  // If the result is 2 letters, it might be a defective root
  if (result.length === 2 && isValidHebrewRoot(result)) {
    return result;
  }
  
  return null;
}

/**
 * Extracts a root by matching against known patterns
 */
function extractRootByPatterns(word: string): string | null {
  // Check verb patterns
  for (const pattern of [...VERB_PATTERNS, ...NOUN_PATTERNS]) {
    if (word.length === pattern.pattern.length) {
      // Get the potential root letters based on positions
      let rootLetters = '';
      for (const position of pattern.positions) {
        if (position < word.length) {
          rootLetters += word.charAt(position);
        }
      }
      
      if (rootLetters.length >= 2 && isValidHebrewRoot(rootLetters)) {
        return rootLetters;
      }
    }
  }
  
  return null;
}

/**
 * Checks if the given string is a valid Hebrew root
 * This is a simplified check - a real implementation would check for phonetic restrictions
 */
function isValidHebrewRoot(root: string): boolean {
  // Check if all characters are Hebrew letters
  return /^[\u0590-\u05FF\uFB1D-\uFB4F]+$/.test(root);
}

/**
 * Identifies common Hebrew root conjugations
 * @param root The root to analyze
 * @returns An array of common words derived from this root
 */
export function getCommonConjugations(root: string): string[] {
  if (!root || root.length < 2) {
    return [];
  }
  
  const conjugations: string[] = [];
  
  if (root.length === 3) {
    const [r1, r2, r3] = root.split('');
    
    // Add some basic conjugations based on common patterns
    // Pa'al past tense
    conjugations.push(`${r1}${r2}${r3}`);
    
    // Pa'al present
    conjugations.push(`${r1}${getCommonVowelConnector()}${r2}${r3}`);
    
    // Pi'el past
    conjugations.push(`${r1}${getCommonVowelConnector()}${r2}${r3}`);
    
    // Hif'il past
    conjugations.push(`ה${r1}${r2}${getCommonVowelConnector()}${r3}`);
    
    // Pa'al infinitive
    conjugations.push(`ל${r1}${r2}${getCommonVowelConnector()}${r3}`);
  } else if (root.length === 2) {
    // Handle defective roots
    const [r1, r2] = root.split('');
    
    // Common defective patterns
    conjugations.push(`${r1}${r2}`);
    conjugations.push(`${r1}${r2}ה`);
    conjugations.push(`ל${r1}${r2}${getCommonVowelConnector()}ת`);
  }
  
  return [...new Set(conjugations)]; // Remove duplicates
}

/**
 * Helper to get a common Hebrew vowel connector (ו or י)
 * In a real implementation, this would be more sophisticated
 */
function getCommonVowelConnector(): string {
  // Alternate between ו and י as vowel connectors
  return Math.random() > 0.5 ? 'ו' : 'י';
}

/**
 * Categorizes a word by its likely morphological type
 */
export function categorizeWord(word: string): string {
  const normalized = removeNikud(word);
  
  // Check for verb forms
  if (normalized.startsWith('ל') && normalized.length > 3) {
    return 'infinitive';
  }
  
  if (normalized.startsWith('מ') && normalized.length > 3) {
    return 'participle';
  }
  
  if (normalized.startsWith('י') && normalized.length > 3) {
    return 'future';
  }
  
  if (normalized.startsWith('ה') && normalized.length > 4) {
    return 'past_causative';
  }
  
  if (normalized.startsWith('הת') && normalized.length > 4) {
    return 'past_reflexive';
  }
  
  // Check for noun forms
  if (normalized.endsWith('ים')) {
    return 'plural_masculine';
  }
  
  if (normalized.endsWith('ות')) {
    return 'plural_feminine';
  }
  
  if (normalized.endsWith('ה') && normalized.length > 2) {
    return 'feminine';
  }
  
  // Default
  return 'base';
}
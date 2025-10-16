import { v4 as uuidv4 } from 'uuid';
import { Chunk, Token, ChunkType } from '../types';
import { normalizeZeroWidth } from '../lib/rtl';
import { removeNikud } from '../lib/nikud';
import { extractRoot, categorizeWord } from '../lib/roots';

/**
 * Hebrew-aware text segmentation utilities
 */

// Hebrew letter ranges (including Biblical Hebrew)
const HEBREW_LETTER_PATTERN = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

// Hebrew clitics (prefixes that should be separated for tokenization)
const HEBREW_CLITICS: Record<string, string> = {
  'ו': 'and',
  'ה': 'the',
  'ב': 'in',
  'כ': 'like/as',
  'ל': 'to',
  'מ': 'from',
  'ש': 'that',
};

const MEM_SHIN_PREFIXES = new Set(['מ', 'ש']);

const PRONOUN_BASES = new Set([
  'אני', 'אנכי', 'אתה', 'את', 'הוא', 'היא',
  'אנחנו', 'אתם', 'אתן', 'הם', 'הן',
  'אותי', 'אותך', 'אותו', 'אותה', 'אותנו', 'אתכם', 'אתכן', 'אותם', 'אותן',
  'מני', 'ממך', 'ממני', 'ממנו', 'ממנה', 'ממכם', 'ממכן', 'מהם', 'מהן',
  'לי', 'לך', 'לו', 'לה', 'לנו', 'לכם', 'לכן', 'להם', 'להן',
  'עלי', 'עליך', 'עליו', 'עליה', 'עלינו', 'עליכם', 'עליכן', 'עליהם', 'עליהן',
  'איתי', 'איתך', 'איתו', 'איתה', 'איתנו', 'איתכם', 'איתכן', 'איתם', 'איתן'
]);

const VERB_SUFFIXES = ['תי', 'נו', 'תם', 'תן', 'ני', 'ו', 'ן'];
const VERB_PREFIXES = ['הת', 'מת', 'ית', 'ת', 'י', 'נ', 'א'];

function isHebrewLetters(word: string): boolean {
  return /^[\u0590-\u05FF\uFB1D-\uFB4F]+$/.test(word);
}

function startsWithArticle(word: string): boolean {
  return word.startsWith('ה');
}

function hasInfinitivePrefix(word: string): boolean {
  return word.startsWith('ל') && word.length > 3;
}

function isPronounForm(word: string): boolean {
  return PRONOUN_BASES.has(word);
}

function hasVerbSuffix(word: string): boolean {
  return VERB_SUFFIXES.some(suffix => {
    if (!word.endsWith(suffix) || word.length <= suffix.length + 1) {
      return false;
    }

    if (suffix === 'ו') {
      const precedingChar = word.charAt(word.length - suffix.length - 1);
      if (precedingChar === 'ה') {
        return false;
      }
    }

    return true;
  });
}

function hasVerbPrefix(word: string): boolean {
  return VERB_PREFIXES.some(prefix => word.startsWith(prefix) && word.length > prefix.length + 1);
}

function isLikelyVerbForm(word: string): boolean {
  if (word.length <= 2) {
    return false;
  }
  return hasVerbSuffix(word) || hasVerbPrefix(word);
}

function baseLooksLikeStandaloneWord(base: string): boolean {
  if (!isHebrewLetters(base)) {
    return false;
  }

  if (base.length <= 1) {
    return false;
  }

  if (base.length === 2) {
    return isPronounForm(base);
  }

  return true;
}

function shouldSplitMemOrShin(normalizedBase: string): boolean {
  if (!baseLooksLikeStandaloneWord(normalizedBase)) {
    return false;
  }

  let score = 0;

  if (startsWithArticle(normalizedBase)) {
    score += 3;
  }

  if (hasInfinitivePrefix(normalizedBase)) {
    score += 2;
  }

  if (isPronounForm(normalizedBase)) {
    score += 3;
  }

  if (isLikelyVerbForm(normalizedBase)) {
    score += 2;
  }

  if (normalizedBase.endsWith('ים') || normalizedBase.endsWith('ות')) {
    // Plural noun likely starts with pattern rather than clitic
    score -= 1;
  }

  if (normalizedBase.length === 3 && score < 3) {
    // Three-letter base words are often pure roots (e.g. מכתב, משפט)
    return false;
  }

  return score >= 2;
}

function shouldSplitGeneral(normalizedBase: string): boolean {
  if (!baseLooksLikeStandaloneWord(normalizedBase)) {
    return false;
  }

  // Allow short heuristic-based guard for other prefixes
  if (normalizedBase.length <= 1) {
    return false;
  }

  return true;
}

/**
 * Segments Hebrew text into sentences and phrases
 */
export function segmentText(text: string): Chunk[] {
  // Normalize zero-width characters
  const normalizedText = normalizeZeroWidth(text);
  
  // Step 1: Split into sentences
  const sentences = splitSentences(normalizedText);
  
  // Step 2: Process each sentence into chunks with tokens
  return sentences.map((sentenceText, index) => {
    // Generate a unique ID for the sentence
    const id = `sentence-${index}-${uuidv4().substring(0, 8)}`;
    
    // Tokenize the sentence
    const tokens = tokenizeHebrew(sentenceText);
    
    return {
      id,
      type: 'sentence',
      text: sentenceText.trim(),
      tokens,
      translation: undefined, // Will be filled later
    };
  });
}

/**
 * Splits text into sentences based on punctuation and line breaks
 * Hebrew-aware: handles special cases like large gaps that indicate sentence breaks
 */
function splitSentences(text: string): string[] {
  // Regex for sentence-ending punctuation followed by space or line break
  const sentenceEndPattern = /[.?!…]+(?:\s|$)/g;
  
  // Split on sentence-ending punctuation or double line breaks
  const preliminarySentences = text
    .split(/(?:[.?!…]+(?:\s|$))|(?:\n\s*\n)/g)
    .filter(s => s && s.trim());
  
  // Process the preliminary sentences (can be further refined)
  const sentences: string[] = [];
  
  for (const sentence of preliminarySentences) {
    // Trim whitespace and normalize spaces
    const trimmed = sentence.trim().replace(/\s+/g, ' ');
    
    if (trimmed.length > 0) {
      sentences.push(trimmed);
    }
  }
  
  return sentences;
}

/**
 * Splits sentences into phrases based on commas, maqaf, and coordinating conjunctions
 */
export function splitPhrases(sentence: string): string[] {
  // Regex for phrase boundaries
  const phraseBoundaryPattern = /[,،،،]|־|\s+ו(?=[^\s])/g;
  
  const phrases = sentence
    .split(phraseBoundaryPattern)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  
  return phrases.length > 0 ? phrases : [sentence];
}

/**
 * Tokenizes Hebrew text with clitic splitting
 */
function tokenizeHebrew(text: string): Token[] {
  // Simple tokenization based on spaces
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const tokens: Token[] = [];
  
  let idx = 0;
  for (const word of words) {
    // Check for clitics at the beginning of the word
    const clitic = getInitialClitic(word);
    
    if (clitic) {
      // Split the word into prefix and base
      const prefix = word.substring(0, clitic.length);
      const base = word.substring(clitic.length);
      
      // Add the clitic token
      tokens.push({
        idx: idx++,
        surface: prefix,
        lemma: prefix,
        root: prefix, // For clitics, the root is the same as the surface
      });

      // Add the base word token
      const root = extractRoot(base);
      tokens.push({
        idx: idx++,
        surface: base,
        lemma: base,
        root: root || undefined, // Add the root if available
      });
    } else {
      // Regular word (no clitic)
      const root = extractRoot(word);
      tokens.push({
        idx: idx++,
        surface: word,
        lemma: word,
        root: root || undefined,
      });
    }
  }
  
  return tokens;
}

/**
 * Identifies initial clitics in Hebrew words
 * Improved to handle ambiguous cases like words starting with מ
 */
function getInitialClitic(word: string): string | null {
  // Get first character
  const normalizedWord = removeNikud(word);
  const firstChar = normalizedWord.charAt(0);

  // Skip processing for very short words - they're likely standalone
  if (word.length <= 2) {
    return null;
  }

  // Check if it's a known clitic
  if (
    HEBREW_CLITICS[firstChar] &&
    HEBREW_LETTER_PATTERN.test(word.charAt(1))
  ) {
    const base = word.substring(1);
    const normalizedBase = removeNikud(base);

    if (MEM_SHIN_PREFIXES.has(firstChar)) {
      if (!shouldSplitMemOrShin(normalizedBase)) {
        return null;
      }
    } else {
      if (!shouldSplitGeneral(normalizedBase)) {
        return null;
      }
    }

    return word.substring(0, 1);
  }

  return null;
}

/**
 * Extracts the base form of a word (without clitics)
 * This is a simplified implementation - a full implementation would use a morphological analyzer
 */
export function extractBaseForm(word: string): string {
  // Remove prefixes (clitics)
  const withoutPrefix = removePrefix(word);
  
  // Remove nikud (vowel points)
  const withoutNikud = removeNikud(withoutPrefix);
  
  return withoutNikud;
}

/**
 * Removes common prefixes from a Hebrew word
 */
function removePrefix(word: string): string {
  for (const prefix of Object.keys(HEBREW_CLITICS)) {
    if (word.startsWith(prefix) && word.length > prefix.length) {
      return word.substring(prefix.length);
    }
  }
  return word;
}

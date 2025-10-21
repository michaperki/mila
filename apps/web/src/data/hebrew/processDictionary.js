/**
 * Process Strong's Hebrew Dictionary
 *
 * This script converts the Strong's Hebrew Dictionary from JavaScript to a TypeScript module
 * that can be used in our application for Hebrew root extraction.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the source dictionary
const sourceFile = path.join(__dirname, 'strongs', 'dictionary.json');

// Path to output files
const outputRootDictionary = path.join(__dirname, 'rootDictionary.ts');
const outputWordList = path.join(__dirname, 'wordDictionary.ts');

// Read the source file
console.log('Reading Strong\'s Hebrew Dictionary...');
const sourceContent = fs.readFileSync(sourceFile, 'utf8');

// Parse the dictionary
console.log('Parsing dictionary...');
const strongsDictionary = JSON.parse(sourceContent);

// Helper function to normalize Hebrew text
function normalizeHebrew(text) {
  if (!text) return '';
  // Remove nikud (vowel points) and other marks
  return text
    .normalize('NFKD')
    .replace(/[\u0591-\u05BD\u05BF-\u05C7]/g, '');
}

// Process the dictionary into our format
console.log('Processing dictionary entries...');
const rootDictionary = {};
const wordDictionary = {};
const wordToStrong = {};

// Count how many entries we process
let entryCount = 0;
let skippedCount = 0;

// Process each Strong's entry
for (const strongNumber in strongsDictionary) {
  const entry = strongsDictionary[strongNumber];
  
  // Skip entries without a lemma (Hebrew word)
  if (!entry.lemma) {
    skippedCount++;
    continue;
  }
  
  // Clean the Strong's number (remove 'H' prefix)
  const cleanNumber = strongNumber.replace('H', '');
  
  // Extract the root form and gloss
  const root = entry.lemma;
  const gloss = entry.kjv_def || entry.strongs_def || '';
  
  // Add to root dictionary
  rootDictionary[cleanNumber] = {
    strong: cleanNumber,
    root,
    gloss: formatGloss(gloss)
  };
  
  // Add the root form to word dictionary
  const normalizedRoot = normalizeHebrew(root);
  wordDictionary[normalizedRoot] = cleanNumber;
  
  // Add variant forms based on common patterns
  addVariantForms(normalizedRoot, cleanNumber, wordDictionary);
  
  entryCount++;
}

// Output statistics
console.log(`Processed ${entryCount} entries`);
console.log(`Skipped ${skippedCount} entries`);
console.log(`Generated ${Object.keys(rootDictionary).length} root entries`);
console.log(`Generated ${Object.keys(wordDictionary).length} word form entries`);

// Write the root dictionary to a TypeScript file
const rootDictionaryContent = `/**
 * Hebrew Root Dictionary
 * 
 * This module provides a dictionary of Hebrew roots based on Strong's numbers.
 * Generated from the Open Scriptures Hebrew Bible dataset.
 */

// Type definitions
export interface HebrewLemma {
  strong: string;  // Strong's number (e.g., "1")
  root: string;    // Root form in Hebrew characters
  gloss: string;   // English gloss/definition
}

// Map of Strong's numbers to root information
export const strongRoots: Record<string, HebrewLemma> = ${JSON.stringify(rootDictionary, null, 2)};

/**
 * Gets English gloss for a Hebrew root
 * @param root The Hebrew root
 * @returns The English gloss, or null if not found
 */
export function getGlossForRoot(root: string): string | null {
  if (!root) return null;
  
  // Search through strongRoots for a matching root
  for (const strong of Object.values(strongRoots)) {
    if (strong.root === root) {
      return strong.gloss;
    }
  }
  
  return null;
}
`;

// Write the word dictionary to a TypeScript file
const wordDictionaryContent = `/**
 * Hebrew Word Dictionary
 * 
 * This module provides a dictionary of Hebrew word forms to Strong's numbers.
 * Generated from the Open Scriptures Hebrew Bible dataset.
 */

// Map of word forms to Strong's numbers
export const wordDictionary: Record<string, string> = ${JSON.stringify(wordDictionary, null, 2)};

/**
 * Extracts the root from a Hebrew word using the dictionary
 * @param word The Hebrew word to analyze
 * @returns The Strong's number for the word, or null if not found
 */
export function getStrongNumber(word: string): string | null {
  if (!word) return null;
  
  // Remove nikud (vowel points) for consistent matching
  const normalized = normalizeHebrew(word);
  
  // Try to find the word directly in the dictionary
  const strongNumber = wordDictionary[normalized];
  if (strongNumber) {
    return strongNumber;
  }
  
  // Try removing common prefixes (ה, ב, ל, כ, ו, מ, ש)
  for (const prefix of ['ה', 'ב', 'ל', 'כ', 'ו', 'מ', 'ש', 'וה', 'וב', 'ול', 'וכ', 'ומ', 'וש']) {
    if (normalized.startsWith(prefix) && normalized.length > prefix.length + 1) {
      const withoutPrefix = normalized.substring(prefix.length);
      const strongNumber = wordDictionary[withoutPrefix];
      if (strongNumber) {
        return strongNumber;
      }
    }
  }
  
  // Try removing common suffixes (ים, ות, י, ו, ך, ה)
  for (const suffix of ['ים', 'ות', 'י', 'ו', 'ך', 'ה', 'נו', 'כם', 'הם', 'יו', 'יה']) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length + 1) {
      const withoutSuffix = normalized.substring(0, normalized.length - suffix.length);
      const strongNumber = wordDictionary[withoutSuffix];
      if (strongNumber) {
        return strongNumber;
      }
    }
  }
  
  return null;
}

/**
 * Normalizes Hebrew text by removing vowel points and other marks
 */
function normalizeHebrew(text: string): string {
  if (!text) return '';
  // Remove nikud (vowel points) and other marks
  return text
    .normalize('NFKD')
    .replace(/[\u0591-\u05BD\u05BF-\u05C7]/g, '');
}
`;

// Write the output files
fs.writeFileSync(outputRootDictionary, rootDictionaryContent);
fs.writeFileSync(outputWordList, wordDictionaryContent);

console.log(`Root dictionary written to ${outputRootDictionary}`);
console.log(`Word dictionary written to ${outputWordList}`);

// Helper function to format the gloss text
function formatGloss(gloss) {
  if (!gloss) return '';
  
  // Remove curly braces
  gloss = gloss.replace(/[{}]/g, '');
  
  // Remove references to other Strong's numbers
  gloss = gloss.replace(/\b[HG]\d+\b\s*\([^)]*\)/g, '');
  
  // Remove extra punctuation
  gloss = gloss.replace(/[\.,;:]+$/, '');
  
  // Trim and clean up
  return gloss.trim();
}

// Helper function to add common variant forms of a word
function addVariantForms(word, strongNumber, dictionary) {
  if (!word || word.length < 2) return;
  
  // Common verb forms
  if (word.length === 3) {
    const [r1, r2, r3] = word.split('');
    
    // Add common verb patterns (this is a simplified version)
    const patterns = [
      // Pa'al forms
      `${r1}${r2}${r3}`, // base form
      `${r1}ו${r2}${r3}`, // present tense
      `י${r1}${r2}${r3}`, // future 3ms
      
      // Pi'el forms
      `${r1}י${r2}${r3}`, 
      `מ${r1}${r2}${r3}`,
      
      // Hif'il forms
      `ה${r1}${r2}י${r3}`,
      
      // Common noun patterns
      `מ${r1}${r2}${r3}`, // instrument/place
      `ת${r1}${r2}${r3}`, // abstract noun
    ];
    
    // Add each pattern to the dictionary
    for (const pattern of patterns) {
      dictionary[pattern] = strongNumber;
      
      // Also add with common prefixes
      dictionary[`ה${pattern}`] = strongNumber; // definite article
      dictionary[`ב${pattern}`] = strongNumber; // in
      dictionary[`ל${pattern}`] = strongNumber; // to
      dictionary[`כ${pattern}`] = strongNumber; // like
      dictionary[`מ${pattern}`] = strongNumber; // from
    }
    
    // Common plural forms
    dictionary[`${word}ים`] = strongNumber; // masculine plural
    dictionary[`${word}ות`] = strongNumber; // feminine plural
  }
}
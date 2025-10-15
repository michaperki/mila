/**
 * Tests for Enhanced Hebrew Root Extraction
 * 
 * This file tests the combined pattern-based and dictionary-based
 * root extraction functionality.
 */

import { extractRoot, getRootMeaning } from './roots';
import { extractRootFromDictionary } from '../data/hebrew/rootDictionary';

// Test words from the OSHB dictionary
const DICTIONARY_TEST_WORDS = [
  { word: 'אלהים', expectedRoot: 'אלה', description: 'God - from dictionary' },
  { word: 'הארץ', expectedRoot: 'ארץ', description: 'The earth/land - from dictionary' },
  { word: 'יאמר', expectedRoot: 'אמר', description: 'He will say - from dictionary' },
  { word: 'אנשים', expectedRoot: 'איש', description: 'Men - from dictionary' },
  { word: 'ראיתי', expectedRoot: 'ראה', description: 'I saw - from dictionary' },
  { word: 'הלכו', expectedRoot: 'הלך', description: 'They walked - from dictionary' },
  { word: 'כותב', expectedRoot: 'כתב', description: 'Writing - from dictionary' }
];

// Test words for pattern-based extraction (may not be in dictionary)
const PATTERN_TEST_WORDS = [
  { word: 'מְדַבֵּר', expectedRoot: 'דבר', description: 'Speaking - from pattern (Pi\'el participle)' },
  { word: 'הִתְקַדֵּשׁ', expectedRoot: 'קדש', description: 'Sanctify oneself - from pattern (Hitpa\'el)' },
  { word: 'מַלְבִּישׁ', expectedRoot: 'לבש', description: 'Dressing - from pattern (Hif\'il participle)' },
  { word: 'שׁוֹמְרִים', expectedRoot: 'שמר', description: 'Keeping - from pattern (Qal participle plural)' }
];

// Combined test with dictionary and pattern-based words
const ALL_TEST_WORDS = [
  ...DICTIONARY_TEST_WORDS,
  ...PATTERN_TEST_WORDS
];

/**
 * Runs tests for dictionary-based extraction
 */
function testDictionaryExtraction() {
  console.log('\nDictionary-based extraction tests:');
  console.log('=================================');
  
  let passed = 0;
  const total = DICTIONARY_TEST_WORDS.length;
  
  DICTIONARY_TEST_WORDS.forEach(test => {
    const root = extractRootFromDictionary(test.word);
    const success = root === test.expectedRoot;
    if (success) passed++;
    
    console.log(
      `${success ? '✓' : '✗'} ${test.word} → ${root || 'null'} ${success ? '' : `(expected: ${test.expectedRoot})`} - ${test.description}`
    );
    
    // Show meaning if available
    const meaning = getRootMeaning(root || '');
    if (meaning) {
      console.log(`  Meaning: ${meaning}`);
    }
  });
  
  console.log(`\nPassed ${passed}/${total} (${Math.round(passed/total*100)}%)`);
}

/**
 * Runs tests for combined extraction (dictionary + pattern-based)
 */
function testCombinedExtraction() {
  console.log('\nCombined extraction tests:');
  console.log('=========================');
  
  let passed = 0;
  const total = ALL_TEST_WORDS.length;
  
  ALL_TEST_WORDS.forEach(test => {
    const root = extractRoot(test.word);
    const success = root === test.expectedRoot;
    if (success) passed++;
    
    console.log(
      `${success ? '✓' : '✗'} ${test.word} → ${root || 'null'} ${success ? '' : `(expected: ${test.expectedRoot})`} - ${test.description}`
    );
    
    // Show meaning if available
    const meaning = getRootMeaning(root || '');
    if (meaning) {
      console.log(`  Meaning: ${meaning}`);
    }
  });
  
  console.log(`\nPassed ${passed}/${total} (${Math.round(passed/total*100)}%)`);
}

/**
 * Run all tests
 */
export function runTests() {
  console.log('Testing Enhanced Hebrew Root Extraction');
  console.log('======================================');
  
  testDictionaryExtraction();
  testCombinedExtraction();
  
  console.log('\nDone testing enhanced root extraction.');
}

// This would be called from a test runner
// For demonstration, you can call it directly in your app during development
// runTests();

export default runTests;
/**
 * Tests for Hebrew root extraction
 * 
 * This file demonstrates the root extraction functionality with common Hebrew words.
 * These examples can be used to validate and improve the extraction algorithm.
 */

import { extractRoot, categorizeWord, getCommonConjugations } from './roots';

// Common Hebrew verbs with their expected roots
const TEST_VERBS = [
  { word: 'כתב', expectedRoot: 'כתב', description: 'Pa\'al past (to write)' },
  { word: 'כותב', expectedRoot: 'כתב', description: 'Pa\'al present (writing)' },
  { word: 'יכתוב', expectedRoot: 'כתב', description: 'Pa\'al future (will write)' },
  { word: 'דיבר', expectedRoot: 'דבר', description: 'Pi\'el past (to speak)' },
  { word: 'מדבר', expectedRoot: 'דבר', description: 'Pi\'el present (speaking)' },
  { word: 'ידבר', expectedRoot: 'דבר', description: 'Pi\'el future (will speak)' },
  { word: 'הפעיל', expectedRoot: 'פעל', description: 'Hif\'il past (to activate)' },
  { word: 'מפעיל', expectedRoot: 'פעל', description: 'Hif\'il present (activating)' },
  { word: 'יפעיל', expectedRoot: 'פעל', description: 'Hif\'il future (will activate)' },
  { word: 'התלבש', expectedRoot: 'לבש', description: 'Hitpa\'el past (to dress oneself)' },
  { word: 'מתלבש', expectedRoot: 'לבש', description: 'Hitpa\'el present (dressing oneself)' },
  { word: 'יתלבש', expectedRoot: 'לבש', description: 'Hitpa\'el future (will dress oneself)' }
];

// Common Hebrew nouns with their expected roots
const TEST_NOUNS = [
  { word: 'ספר', expectedRoot: 'ספר', description: 'Book (simple noun)' },
  { word: 'מכתב', expectedRoot: 'כתב', description: 'Letter (noun with mem prefix)' },
  { word: 'דיבור', expectedRoot: 'דבר', description: 'Speech (verbal noun)' },
  { word: 'הפעלה', expectedRoot: 'פעל', description: 'Operation (action noun)' },
  { word: 'התלבשות', expectedRoot: 'לבש', description: 'Dressing (reflexive action)' }
];

// Words with prefixes and suffixes
const TEST_AFFIXED = [
  { word: 'הספר', expectedRoot: 'ספר', description: 'The book (with definite article)' },
  { word: 'לכתוב', expectedRoot: 'כתב', description: 'To write (with infinitive prefix)' },
  { word: 'וכתבתי', expectedRoot: 'כתב', description: 'And I wrote (with conjunction and suffix)' },
  { word: 'כשדיברתי', expectedRoot: 'דבר', description: 'When I spoke (with prefix and suffix)' }
];

// Function to run tests and log results
function runTests() {
  console.log('Testing Hebrew Root Extraction');
  console.log('==============================');
  
  let passed = 0;
  let total = 0;
  
  // Test verbs
  console.log('\nVerb tests:');
  TEST_VERBS.forEach(test => {
    total++;
    const root = extractRoot(test.word);
    const success = root === test.expectedRoot;
    if (success) passed++;
    
    console.log(
      `${success ? '✓' : '✗'} ${test.word} → ${root || 'null'} ${success ? '' : `(expected: ${test.expectedRoot})`} - ${test.description}`
    );
  });
  
  // Test nouns
  console.log('\nNoun tests:');
  TEST_NOUNS.forEach(test => {
    total++;
    const root = extractRoot(test.word);
    const success = root === test.expectedRoot;
    if (success) passed++;
    
    console.log(
      `${success ? '✓' : '✗'} ${test.word} → ${root || 'null'} ${success ? '' : `(expected: ${test.expectedRoot})`} - ${test.description}`
    );
  });
  
  // Test affixed words
  console.log('\nAffixed word tests:');
  TEST_AFFIXED.forEach(test => {
    total++;
    const root = extractRoot(test.word);
    const success = root === test.expectedRoot;
    if (success) passed++;
    
    console.log(
      `${success ? '✓' : '✗'} ${test.word} → ${root || 'null'} ${success ? '' : `(expected: ${test.expectedRoot})`} - ${test.description}`
    );
  });
  
  // Summary
  console.log(`\nPassed ${passed}/${total} (${Math.round(passed/total*100)}%)`);
  
  // Demonstrate conjugations
  console.log('\nSample conjugations:');
  const rootSample = 'כתב';
  const conjugations = getCommonConjugations(rootSample);
  console.log(`Root: ${rootSample}`);
  console.log(`Common forms: ${conjugations.join(', ')}`);
}

// This would be called from a test runner
// For demonstration, you can call it directly in your app during development
// runTests();

export default runTests;
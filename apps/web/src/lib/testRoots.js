/**
 * Test script for Hebrew root extraction with the expanded dictionary
 */

import { extractRoot, getRootMeaning } from './roots';

// Test words to check
const TEST_WORDS = [
  'אלהים',    // God
  'הארץ',     // the earth/land
  'השמים',    // the heavens
  'בראשית',   // in the beginning
  'אדם',      // man, Adam
  'אישה',     // woman
  'מלך',      // king
  'תורה',     // Torah, law
  'שלום',     // peace
  'ישראל',    // Israel
  'דבר',      // word, thing
  'ספר',      // book
  'בית',      // house
  'יום',      // day
  'מים'       // water
];

// Run tests
console.log('Testing Hebrew root extraction with expanded dictionary:');
console.log('======================================================');

let foundRoots = 0;
let foundMeanings = 0;

for (const word of TEST_WORDS) {
  const root = extractRoot(word);
  const meaning = root ? getRootMeaning(root) : null;
  
  console.log(`Word: ${word}`);
  console.log(`  Root: ${root || 'not found'}`);
  
  if (root) {
    foundRoots++;
    console.log(`  Meaning: ${meaning || 'no meaning available'}`);
    if (meaning) foundMeanings++;
  }
  
  console.log('');
}

console.log(`Found ${foundRoots}/${TEST_WORDS.length} roots (${Math.round(foundRoots/TEST_WORDS.length*100)}%)`);
console.log(`Found ${foundMeanings}/${foundRoots} meanings (${Math.round(foundMeanings/foundRoots*100)}%)`);
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isVowelled, withVowels } from '../src/lib/vowels.ts'

test('a page counts as vowelled only when many of its words carry marks', () => {
  assert.equal(isVowelled('בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם'), true)
  // Unvowelled prose that dots one name and one ambiguous word.
  assert.equal(isVowelled('הארי ראה את דַּמְבְּלְדוֹר עומד ליד הדלת, והוא חשב שהוא בטח טוֹעֶה הפעם'), false)
  assert.equal(isVowelled('No Hebrew here'), false)
  // A maqaf alone is punctuation, not a vowel.
  assert.equal(isVowelled('בית־ספר גדול'), false)
})

test('the setting strips vowels or leaves text as it is', () => {
  assert.equal(withVowels('רָאִיתִי', false), 'ראיתי')
  assert.equal(withVowels('רָאִיתִי', true), 'רָאִיתִי')
})

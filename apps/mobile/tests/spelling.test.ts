import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plainSpelling } from '../src/lib/spelling.ts'
import { withVowels } from '../src/lib/vowels.ts'

const cases = (pairs: [string, string][]) => pairs.forEach(([vowelled, plain]) => assert.equal(plainSpelling(vowelled), plain, vowelled))

test('a holam or kubutz is written with ו', () => cases([
  ['לִשְׂנֹא', 'לשנוא'], ['לִקְפֹּא', 'לקפוא'], ['לִכְתֹּב', 'לכתוב'], ['לִפְתֹּחַ', 'לפתוח'], ['לִשְׁמֹעַ', 'לשמוע'],
  ['שֻׁלְחָן', 'שולחן'], ['קֻפָּה', 'קופה'], ['מֻמְחֶה', 'מומחה'], ['מְאֹד', 'מאוד'], ['חֹדֶשׁ', 'חודש'],
  // A holam already written with ו, and the words that keep no ו for theirs.
  ['שׁוֹמֵר', 'שומר'], ['רֹאשׁ', 'ראש'], ['זֹאת', 'זאת'], ['שְׂמֹאל', 'שמאל'], ['לֹא', 'לא'], ['מֹשֶׁה', 'משה'],
]))

test('a hiriq in an open syllable is written with י', () => cases([
  ['דִּבֵּר', 'דיבר'], ['לְהִזָּעֵם', 'להיזעם'], ['לְהִתָּקֵל', 'להיתקל'], ['עִפָּרוֹן', 'עיפרון'], ['סִפַּרְתִּי', 'סיפרתי'],
  // Closed: a shva after it, or the word ends after the next letter.
  ['לִכְתֹּב', 'לכתוב'], ['תִּקְוָה', 'תקווה'], ['אִם', 'אם'], ['עִם', 'עם'],
  // A prefix מִ before a doubled letter, and a hiriq before a י already there.
  ['מִכָּל', 'מכל'], ['מִתּוֹךְ', 'מתוך'], ['שִׁיר', 'שיר'],
  // Open before a doubled letter even with a shva on it.
  ['דִּוְּחוּ', 'דיווחו'], ['דִּבְּרוּ', 'דיברו'],
]))

test('a tsere before a guttural that can\'t be doubled is written with י', () => cases([
  ['לְהֵעָמֵד', 'להיעמד'], ['בֵּרַךְ', 'בירך'], ['תֵּאֵר', 'תיאר'], ['שֵׂעָר', 'שיער'],
  // Not the prefix מֵ, nor a word that starts with it.
  ['מֵהַבַּיִת', 'מהבית'], ['מֵאָה', 'מאה'], ['הֵעָרָה', 'הערה'], ['סֵפֶר', 'ספר'],
]))

test('a consonant ו or י inside a word is doubled', () => cases([
  ['לְגַיֵּס', 'לגייס'], ['לְדַוֵּחַ', 'לדווח'], ['לַחְמָנִיָּה', 'לחמנייה'], ['צָהֳרַיִם', 'צהריים'], ['לְדַמְיֵן', 'לדמיין'],
  // Not beside a ו or י that is a vowel letter, nor at either end of the word.
  ['מְסֻיָּם', 'מסוים'], ['לְקַוּוֹת', 'לקוות'], ['שָׁלֵו', 'שלו'],
  // Nor where the word starts after a prefix, or as a short word's second letter.
  ['הַיֶּלֶד', 'הילד'], ['כְּשֶׁיַּנְשׁוּף', 'כשינשוף'], ['וְהַיֶּלֶד', 'והילד'], ['וְיֵשׁ', 'ויש'], ['בַּיִת', 'בית'], ['מַיִם', 'מים'], ['לְיַד', 'ליד'], ['צַיָּר', 'צייר'], ['שָׁמַיִם', 'שמיים'], ['זַיִת', 'זית'],
]))

test('a maqaf stays, and unvowelled text is left as it is', () => {
  cases([['אִי־נוֹחוּת', 'אי־נוחות'], ['אַתָּה־יוֹדֵעַ־מִי', 'אתה־יודע־מי'], ["ג'ִים", "ג'ים"]])
  assert.equal(plainSpelling('קשה לשנוא מישהו'), 'קשה לשנוא מישהו')
  assert.equal(plainSpelling('to hate (לִשְׂנֹא)'), 'to hate (לשנוא)')
})

test('the vowels setting shows Mila\'s vowelled text in full spelling', () => {
  assert.equal(withVowels('לִשְׂנֹא', false), 'לשנוא')
  assert.equal(withVowels('לִשְׂנֹא', true), 'לִשְׂנֹא')
})

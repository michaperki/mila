import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bareWord, cleanOcr, segmentText, stripNiqqud, titleFrom } from '../src/lib/ocr-cleanup.ts'

const page = [
  'טקסטים בעלי מילים ארוכות 33',
  'מבחן בחשבון',
  'מָחָר יֵשׁ לִי מִבְחָן בַּחֶשְׁבּוֹן. כְּשֶׁחָזַרְתִּי מִבֵּית הַסֵּפֶר',
  'יָשַׁבְתִּי לִלְמֹד.',
  'I. איזה מבחן יש מחר?',
  '◄ 2. מה עשיתי כשחזרתי?',
  '34',
].join('\n')

test('book page: drops running header and page number, keeps the title separate, rejoins wrapped lines', () => {
  assert.deepEqual(cleanOcr(page), [
    { text: 'מבחן בחשבון', heading: true },
    { text: 'מָחָר יֵשׁ לִי מִבְחָן בַּחֶשְׁבּוֹן.' },
    { text: 'כְּשֶׁחָזַרְתִּי מִבֵּית הַסֵּפֶר יָשַׁבְתִּי לִלְמֹד.' },
    { text: 'איזה מבחן יש מחר?', marker: '1' },
    { text: 'מה עשיתי כשחזרתי?', marker: '2' },
  ])
})

test('list numbers are kept out of the translated text and restored for display', () => {
  const [question] = cleanOcr('1. איזה מבחן יש מחר?\nמחר יש מבחן.')
  assert.equal(question.text, 'איזה מבחן יש מחר?')
  assert.equal(segmentText(question), '1. איזה מבחן יש מחר?')
})

test('signs without sentence punctuation keep one segment per line', () => {
  assert.deepEqual(cleanOcr('יציאה\nחניה לנכים בלבד'), [{ text: 'יציאה' }, { text: 'חניה לנכים בלבד' }])
})

test('pasted text keeps a short numbered first line when furniture trimming is off', () => {
  assert.equal(cleanOcr('שיעור 3\nהיום למדנו מילים חדשות.\nזה היה כיף.', { trimPageFurniture: false })[0].text, 'שיעור 3')
})

test('a maqaf at the end of a line joins the compound without a space', () => {
  assert.deepEqual(cleanOcr('הלכנו לבית־\nהספר מוקדם.'), [{ text: 'הלכנו לבית־הספר מוקדם.' }])
})

test('titles truncate at a word boundary with an ellipsis', () => {
  assert.equal(titleFrom('חָזַרְתִּי מִבֵּית הַסֵּפֶר וְיָשַׁבְתִּי לִלְמֹד לַמִּבְחָן בַּחֶשְׁבּוֹן שֶׁל מָחָר', 40).endsWith('…'), true)
  assert.equal(titleFrom('חָזַרְתִּי מִבֵּית הַסֵּפֶר וְיָשַׁבְתִּי לִלְמֹד לַמִּבְחָן', 40).includes('חָז…'), false)
  assert.equal(titleFrom('קצר'), 'קצר')
})

test('word helpers', () => {
  assert.equal(bareWord('"בַּחֶשְׁבּוֹן."'), 'בַּחֶשְׁבּוֹן')
  assert.equal(stripNiqqud('בַּחֶשְׁבּוֹן'), 'בחשבון')
})

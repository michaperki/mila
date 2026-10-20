import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isolateHebrew, otherSenses } from '../src/lib/bidi.ts'

test('isolates each Hebrew run, keeping multi-word runs and trailing punctuation outside', () => {
  assert.equal(isolateHebrew('Here it means life, as in חיים.'), 'Here it means life, as in ⁧חיים⁩.')
  assert.equal(isolateHebrew('Part of כִּסֵּא הַתִּינוֹק · baby chair'), 'Part of ⁧כִּסֵּא הַתִּינוֹק⁩ · baby chair')
  assert.equal(isolateHebrew('Root ח־ש־ב'), 'Root ⁧ח־ש־ב⁩')
  assert.equal(isolateHebrew('no hebrew'), 'no hebrew')
  // A word's pieces read right to left as one: צָעַק + וְ, then the English after them.
  assert.equal(isolateHebrew('וְ + צָעַק · past, he · from לִצְעֹק'), '⁧וְ + צָעַק⁩ · past, he · from ⁧לִצְעֹק⁩')
})

test('drops dictionary senses that repeat the contextual meaning', () => {
  assert.equal(otherSenses('life, lifetime, living', 'life'), 'lifetime, living')
  assert.equal(otherSenses('to write, to compose', 'write'), 'to compose')
  assert.equal(otherSenses('calculation, math, account', 'in math'), 'calculation, math, account')
  assert.equal(otherSenses('life', 'Life.'), '')
})

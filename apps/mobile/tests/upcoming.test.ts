import { test } from 'node:test'
import assert from 'node:assert/strict'
import { type Card, cardKey, exerciseOf, frontFor, planRound } from '../src/lib/forms.ts'
import { askedOf, reasonOf, ruleOf, upcomingRows } from '../src/lib/upcoming.ts'
import type { FormCard, VocabEntry } from '../src/lib/types.ts'

const DAY = 86_400_000
const now = new Date(2026, 9, 16, 10).getTime()
const at = (days: number) => new Date(2026, 9, 16 - days, 9).getTime()
const form = (key: string, extra: Partial<FormCard> = {}): FormCard => { const [stage, slot] = key.split(':'); return { key, stage, slot, he: key, en: `en ${key}`, sentence: 'משפט', mark: key, translation: 'A sentence', ...extra } }
const word = (id: string, extra: Partial<VocabEntry> = {}): VocabEntry => ({ id, lemma: id, gloss: `${id} meaning, other`, createdAt: 1, partOfSpeech: 'noun', forms: [form('meanings:sense1')], ...extra })

test('a card is listed as Study will ask it: the side first, fill in the blank only where it can be', () => {
  const blank = form('meanings:sense1', { he: 'שָׁלֵם', mark: 'שלמה', sentence: 'הכוס עדיין שלמה', distractors: ['רֵיקָה', 'שְׁבוּרָה', 'קְטַנָּה'], distractorsFor: 'שְׁלֵמָה', results: [false], last: at(1) })
  const entry = word('w', { forms: [blank], results: [true], last: at(1) })
  const deck: Card[] = [{ entry: word('x'), form: null }, { entry, form: blank }]
  // Missed last time in the same sentence: support, a fill in the blank; it has distractors for it.
  assert.equal(exerciseOf(deck[1], blank, 'some').why, 'support')
  assert.deepEqual(askedOf(deck, 1, 0, [entry], { front: 'he', choices: 'some' }), { kind: 'choice', label: 'Fill in the blank: choose the word' })
  // Without distractors of its own, the same card is a flashcard.
  const plain = { ...blank, distractors: undefined, distractorsFor: undefined }
  assert.equal(askedOf([deck[0], { entry: { ...entry, forms: [plain] }, form: plain }], 1, 0, [{ ...entry, forms: [plain] }], { front: 'en', choices: 'some' }).label, 'Flashcard, English first')
  // Mixed: the side Study's own rule gives for the card at that place.
  const mixed = askedOf(deck, 0, 0, [deck[0].entry], { front: 'mixed', choices: 'off' })
  assert.equal(mixed.label, `Flashcard, ${frontFor(deck[0], 0, 'mixed') === 'en' ? 'English' : 'Hebrew'} first`)
  assert.equal(askedOf([{ entry, form: null, checkpoint: 'present' }], 0, 0, [entry], { front: 'he', choices: 'some' }).kind, 'checkpoint')
})

test('each card says why it is there, in plain words, from what the plan noted', () => {
  const due = word('due', { rank: 500, results: [false], last: at(2), forms: [form('meanings:sense1', { results: [false], last: at(2) })] })
  const fresh = word('fresh', { createdAt: now - DAY, rank: 900 })
  const plan = planRound([due, fresh], { include: 'both', order: 'smart' }, now)
  const rows = upcomingRows(plan.cards, 0, [due, fresh], { front: 'he', choices: 'some' }, plan.considered)
  const review = rows.find(row => row.wordId === 'due')!
  assert.match(review.reason, /^Due for review: last answer missed/)
  // A word card gives the word's first meaning; a sentence card its own.
  assert.equal(review.english, review.card === 'word card' ? 'due meaning' : 'en meanings:sense1')
  const incoming = rows.find(row => row.wordId === 'fresh')!
  assert.match(incoming.reason, /^New word/)
  assert.equal(incoming.english, 'fresh meaning')
  assert.equal(rows.length, plan.cards.length)
  assert.ok(rows.every(row => row.key === cardKey(plan.cards[rows.indexOf(row)])))
})

test('a round under way says why from its cards; unified and sequence cards say so plainly', () => {
  const entry = word('w')
  assert.equal(reasonOf({ entry, form: null, why: 'still learning · last seen yesterday' }), 'Still learning: last seen yesterday')
  assert.equal(reasonOf({ entry, form: null, why: 'unified · reinforce: first studied lately · recall now 45%' }), 'Reinforce: you started it in the last few days · recall now about 45%')
  assert.match(reasonOf({ entry, form: null, sequence: true, why: 'in sequence · after the word' }), /^Right after its word/)
  assert.match(ruleOf('smart', 'standard'), /a day after you miss it/)
  assert.match(ruleOf('smart', 'unified'), /month/)
})

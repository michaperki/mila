import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planRound } from '../src/lib/forms.ts'
import { evidenceOf, scoreOf, shadowLog, shadowRanking } from '../src/lib/scoring.ts'
import type { FormCard, VocabEntry } from '../src/lib/types.ts'

const DAY = 86_400_000
const now = new Date(2026, 9, 16, 10).getTime()
const at = (days: number) => new Date(2026, 9, 16 - days, 9).getTime()
const form = (key: string, extra: Partial<FormCard> = {}): FormCard => { const [stage, slot] = key.split(':'); return { key, stage, slot, he: key, en: key, sentence: '', mark: key, translation: '', ...extra } }
const word = (id: string, extra: Partial<VocabEntry> = {}): VocabEntry => ({ id, lemma: id, gloss: id, createdAt: 1, partOfSpeech: 'noun', forms: [form('meanings:sense1')], ...extra })

test('one answer is weak evidence, and an answer just after seeing the word counts a quarter', () => {
  const once = evidenceOf(word('a', { results: [false], last: at(1) }))
  assert.ok(once.need > 0.6 && once.need < 0.7)
  const primed = evidenceOf(word('b', { results: [true], primed: [true], last: at(1) }))
  const unprimed = evidenceOf(word('c', { results: [true], last: at(1) }))
  assert.ok(primed.need > unprimed.need)
  assert.ok(evidenceOf(word('d')).uncertainty === 1)
})

test('the score is its named parts: common, due, missed and recently introduced words come first', () => {
  const common = word('common', { rank: 400, results: [false], last: at(1), firstStudied: at(1) })
  const rare = word('rare', { rank: 30000, results: [false], last: at(1), firstStudied: at(20) })
  const a = scoreOf(common, 'review', now, { backlog: 0 })
  const b = scoreOf(rare, 'review', now, { backlog: 0 })
  assert.ok(a.score > b.score)
  assert.equal(a.score, Math.round((a.terms.core + a.terms.recent + a.terms.uncertainty) * 100) / 100)
  assert.ok(a.parts.recent > 0 && b.parts.recent === 0)
  assert.ok(a.notes.includes('common #400'))
  // Reading counts: the same word met often in reading scores higher.
  assert.ok(scoreOf({ ...rare, reading: { read: 8, texts: 2 } }, 'review', now, { backlog: 0 }).score > b.score)
  // A new word's timing is the room reviews leave.
  assert.ok(scoreOf(word('n', { rank: 500 }), 'new', now, { backlog: 30 }).parts.timing < scoreOf(word('n', { rank: 500 }), 'new', now, { backlog: 0 }).parts.timing)
})

test('the shadow ranking sets the score beside what Study chose, part by part, and never changes the round', () => {
  const due = Array.from({ length: 20 }, (_, i) => word(`d${i}`, { rank: i % 2 ? 500 : 20000, results: [false], last: at(2 + i), forms: [form('meanings:sense1', { results: [false], last: at(2 + i) })] }))
  const fresh = Array.from({ length: 5 }, (_, i) => word(`n${i}`, { createdAt: 100 + i, rank: 1000 + i }))
  const entries = [...due, ...fresh]
  const plan = planRound(entries, { include: 'both', order: 'smart' }, now)
  const before = plan.cards.map(card => card.entry.id)
  const ranked = shadowRanking(plan, entries, 'both', now)
  assert.deepEqual(plan.cards.map(card => card.entry.id), before)
  const reviews = ranked.filter(item => item.part === 'review')
  assert.equal(reviews.filter(item => item.scoreWould).length, reviews.filter(item => item.study.chosen).length)
  assert.ok(reviews.some(item => item.disagree))
  // Common words come first by score.
  assert.equal(entries.find(entry => entry.id === reviews[0].wordId)!.rank, 500)
  assert.ok(ranked.some(item => item.part === 'new'))
  const log = shadowLog(ranked)
  assert.equal(log.v, 'score-v0')
  assert.ok(JSON.stringify(log).length < 8000)
  void DAY
})

test('memory: a right answer makes a card last longer, a miss shorter, and practice helps most in between', async () => {
  const { practiceNow, retrievability, review } = await import('../src/lib/memory.ts')
  const first = review(null, 3, 0)
  assert.ok(review(first, 3, 3).s > first.s)
  assert.ok(review(first, 1, 3).s <= first.s)
  assert.ok(Math.abs(retrievability(first.s, first.s) - 0.9) < 0.001)
  const card = (s: number, daysAgo: number) => ({ s, d: 5, last: now - daysAgo * DAY, reviews: 2, lapses: 0, undated: 0 })
  const fresh = practiceNow(card(3, 0.1), now), due = practiceNow(card(3, 3), now), known = practiceNow(card(200, 3), now)
  assert.ok(due.gain > known.gain)
  assert.ok(fresh.r > due.r)
})

test('the unified ranking puts every activity on one list by value, knowledge and confidence kept apart', async () => {
  const { unifiedRanking } = await import('../src/lib/scoring.ts')
  const mem = (s: number, daysAgo: number, undated = 0) => ({ s, d: 5, last: now - daysAgo * DAY, reviews: 3, lapses: 1, undated })
  const shaky = word('shaky', { rank: 400, results: [false], last: at(3), memory: mem(1, 3), forms: [form('meanings:sense1', { results: [false], last: at(3), memory: mem(1, 3) })] })
  const solid = word('solid', { rank: 400, results: [true, true], last: at(3), memory: mem(300, 3), forms: [form('meanings:sense1', { results: [true, true], last: at(3), memory: mem(300, 3) })] })
  const recent = word('recent', { rank: 9000, results: [true], last: at(1), firstStudied: at(1), memory: mem(2, 1) })
  const fresh = Array.from({ length: 3 }, (_, i) => word(`n${i}`, { createdAt: 100 + i, rank: 300 }))
  const entries = [shaky, solid, recent, ...fresh]
  const plan = planRound(entries, { include: 'both', order: 'smart' }, now)
  const unified = unifiedRanking(plan, entries, 'both', now)
  const by = (id: string) => unified.activities.find(item => item.wordId === id)!
  assert.ok(by('shaky').value > by('solid').value)
  assert.equal(by('solid').kind, 'check')
  assert.equal(by('recent').kind, 'reinforce')
  assert.equal(by('n0').kind, 'new')
  assert.equal(by('n0').knowledge.source, 'assumed')
  assert.ok(by('shaky').knowledge.recall < by('solid').knowledge.recall)
  assert.ok(unified.activities.some(item => item.kind === 'new' && item.would))
  assert.ok(unified.cards <= 18)
})

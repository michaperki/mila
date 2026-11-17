import { describe, expect, it } from 'vitest'
import { memoriesOf, replay, retrievability, review, W } from '../netlify/functions/lib/memory'

const DAY = 86_400_000
const t = 1_800_000_000_000
describe('memory model (FSRS-5, default parameters)', () => {
  it('starts from the first answer and grows with right answers spaced out', () => {
    expect(review(null, 3, 0).s).toBe(W[2])
    expect(review(null, 1, 0).s).toBe(W[0])
    const spaced = replay([{ at: t, knew: true }, { at: t + 3 * DAY, knew: true }, { at: t + 10 * DAY, knew: true }]).memory!
    const missed = replay([{ at: t, knew: true }, { at: t + 3 * DAY, knew: false }]).memory!
    expect(spaced.s).toBeGreaterThan(10)
    expect(missed.s).toBeLessThan(W[2])
    expect(retrievability(spaced.s, spaced.s)).toBeCloseTo(0.9, 3)
  })
  it('says what it expected before each recorded answer, and nothing before a card’s first', () => {
    const { expected } = replay([{ at: t, knew: true, id: 'a' }, { at: t + 2 * DAY, knew: false, id: 'b' }])
    expect(expected.map(item => item.id)).toEqual(['b'])
    expect(expected[0].r).toBeGreaterThan(0.5)
  })
  it('replays recorded answers and older kept results, counting those without a time', () => {
    const entry = { id: 'w', lemma: 'w', results: [false, true, true], last: t + 5 * DAY }
    const answers = [{ session: 's', seq: 0, at: t + 5 * DAY, type: 'answer', id: 's:0', position: 0, key: 'w:word', knew: true }]
    const { memories, expected } = memoriesOf([entry], answers)
    expect(memories.get('w:word')).toEqual(expect.objectContaining({ reviews: 3, undated: 2 }))
    // Older results come from before the first recorded answer: a day or more before it, not minutes.
    expect(expected.get('s:0')!.days).toBeGreaterThanOrEqual(1)
  })
  it('takes a right answer just after seeing the word as an exposure, not a recall', () => {
    const primedFirst = replay([{ at: t, knew: true, primed: true }]).memory!
    const recalledFirst = replay([{ at: t, knew: true }]).memory!
    expect(primedFirst.s).toBe(W[0])
    expect(recalledFirst.s).toBe(W[2])
    const after = replay([{ at: t, knew: true }, { at: t + 60_000, knew: true, primed: true }]).memory!
    expect(after.s).toBe(recalledFirst.s)
    expect(after.last).toBe(t)
    expect(after.primed).toBe(1)
    // A miss just after seeing the word is a lapse like any other.
    expect(replay([{ at: t, knew: true }, { at: t + 3 * DAY, knew: false, primed: true }]).memory!.s).toBeLessThan(recalledFirst.s)
  })
})

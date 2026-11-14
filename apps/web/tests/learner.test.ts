import { describe, expect, it } from 'vitest'
import { rankOf, rankOfForm } from '../netlify/functions/lib/frequency'
import { estimate, learnerState, levelFromCheck, parseCardKey, priorKnown, type LearnerEntry, type LearnerEvent, type Level } from '../netlify/functions/lib/learner'

const DAY = 86_400_000
const now = 1_800_000_000_000
const level: Level = { words: 2000, low: 1000, high: 4000, basis: 'test' }
const answer = (seq: number, key: string, knew: boolean, front: 'en' | 'he', extra: Record<string, unknown> = {}): LearnerEvent =>
  ({ session: 's', seq, at: now - DAY + seq, type: 'answer', id: `s:${seq}`, position: seq, key, knew, primed: false, front, ...extra })

describe('frequency', () => {
  it('ranks a word by its most common form, with or without prefixes', () => {
    expect(rankOfForm('אני')).toBe(3)
    // A listed form keeps its own rank, rare as a prefixed form is; its dictionary form ranks the word.
    expect(rankOfForm('וְהַבַּיִת')).toBeGreaterThan(10000)
    expect(rankOf('וְהַבַּיִת', 'בַּיִת')).toBeLessThan(1000)
    expect(rankOfForm('ושהמכשפותיהן')).toBeUndefined()
    expect(rankOfForm('וכשהבית')).toBeLessThan(1000)
    expect(rankOf('לרצות', 'רוצה')).toBeLessThan(rankOf('לרצות')!)
    expect(rankOfForm('קקקקק')).toBeUndefined()
  })
})

describe('learner model', () => {
  it('starts common words likely known and rare ones not, by level', () => {
    expect(priorKnown(200, level)).toBeGreaterThan(0.9)
    expect(priorKnown(2000, level)).toBeCloseTo(0.5)
    expect(priorKnown(20000, level)).toBeLessThan(0.05)
    expect(priorKnown(undefined, level)).toBeLessThan(0.01)
  })
  it('moves with evidence, older evidence counting less', () => {
    const fresh = estimate(0.5, [{ at: now, channel: 'recognition', knew: true, weight: 1, what: '' }], 'recognition', now)
    const old = estimate(0.5, [{ at: now - 60 * DAY, channel: 'recognition', knew: true, weight: 1, what: '' }], 'recognition', now)
    expect(fresh.p).toBeGreaterThan(old.p)
    expect(old.p).toBeGreaterThan(0.5)
    expect(fresh.low).toBeLessThan(fresh.p)
  })
  it('reads card keys', () => {
    expect(parseCardKey('native-x:word')).toEqual({ wordId: 'native-x', kind: 'word' })
    expect(parseCardKey('native-x:past:2sg.f')).toEqual({ wordId: 'native-x', kind: 'form', stage: 'past', slot: '2sg.f' })
    expect(parseCardKey('native-x:checkpoint:past')).toEqual({ wordId: 'native-x', kind: 'checkpoint', stage: 'past' })
  })

  const verb: LearnerEntry = {
    id: 'native-v', lemma: 'לִכְתֹּב', lemmaPlain: 'לכתוב', partOfSpeech: 'verb',
    forms: [{ key: 'meanings:sense1', stage: 'meanings', slot: 'sense1', results: [true, true], last: now - DAY }, { key: 'past:2sg.f', stage: 'past', slot: '2sg.f', results: [false, false, true], last: now - DAY }],
  }
  it('keeps recognition and production apart when Study recorded the side', () => {
    const events = [answer(1, 'native-v:meanings:sense1', true, 'he'), answer(2, 'native-v:meanings:sense1', true, 'he')]
    const state = learnerState([verb], events, level, now)
    const word = state.words.find(item => item.id === 'native-v')!
    expect(word.recognition.p).toBeGreaterThan(word.production.p)
    // The two recorded answers are the card's two kept results, not two more.
    expect(word.evidence.filter(item => item.what.includes('meanings'))).toHaveLength(2)
  })
  it('counts kept results from before events as either side, and forms toward grammar', () => {
    const state = learnerState([verb], [], level, now)
    const word = state.words.find(item => item.id === 'native-v')!
    expect(word.answers).toBe(5)
    expect(word.evidence.every(item => item.channel === 'either')).toBe(true)
    const past = state.grammar.find(item => item.key === 'verb:past:2sg.f')!
    expect(past.answers).toBe(3)
    expect(past.estimate.p).toBeLessThan(state.overall.p)
  })
  it('notes a word looked up on a missed card without blaming either for the miss', () => {
    const events: LearnerEvent[] = [
      { session: 's', seq: 1, at: now - 1000, type: 'lookup', id: 's:1', key: 'native-v:meanings:sense1', word: 'תקציב', lemma: 'תַּקְצִיב', place: 2 },
      answer(2, 'native-v:meanings:sense1', false, 'he'),
    ]
    const without = learnerState([verb], [answer(2, 'native-v:meanings:sense1', false, 'he')], level, now).words.find(item => item.id === 'native-v')!
    const state = learnerState([verb], events, level, now)
    const target = state.words.find(item => item.id === 'native-v')!
    expect(target.recognition).toEqual(without.recognition)
    expect(target.evidence.some(item => item.uncertain && item.weight === 0)).toBe(true)
    const tapped = state.words.find(item => item.key === 'תקציב')!
    expect(tapped.saved).toBe(false)
    expect(tapped.band).toBe('unfamiliar')
    expect(tapped.evidence[0].what).toContain('looked up on a card')
  })
  it('takes a reader lookup\'s word from its explanation', () => {
    const events: LearnerEvent[] = [
      { session: 'r', seq: 1, at: now - 1000, type: 'lookup', id: 'r:1', text: 't', segment: 0, word: 'שכתבה' },
      { session: 'r', seq: 2, at: now - 500, type: 'explained', id: 'r:2', of: 'r:1', lemma: 'לכתוב' },
    ]
    const word = learnerState([verb], events, level, now).words.find(item => item.id === 'native-v')!
    expect(word.evidence.some(item => item.what.includes('looked up while reading'))).toBe(true)
  })
  it('finds the level a vocabulary check shows, discounting guesses', () => {
    const ranks = [100, 300, 600, 1000, 1500, 2500, 4000, 6000, 10000, 15000, 25000]
    const answers = ranks.flatMap(rank => [0, 1, 2].map(() => ({ rank, known: rank <= 2500 })))
    const found = levelFromCheck(answers, [{ known: false }, { known: false }, { known: false }, { known: false }])
    expect(found.words).toBeGreaterThan(2000)
    expect(found.words).toBeLessThan(4500)
    expect(found.low).toBeLessThanOrEqual(found.words)
    // Saying "known" of made-up words means some "known"s were guesses: a lower level.
    const guessing = levelFromCheck(answers, [{ known: true }, { known: true }, { known: false }, { known: false }])
    expect(guessing.words).toBeLessThan(found.words)
  })
})

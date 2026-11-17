import { describe, expect, it } from 'vitest'
import { learnerState, type Level } from '../netlify/functions/lib/learner'
import { backgroundSpans, IDLE_MS, modelChecks, predictionFor, sessionsOf, sessionStory, type Context, type Ev, type InsightEntry, type Prediction } from '../netlify/functions/lib/insights'

const now = 1_800_000_000_000
const level: Level = { words: 2000, low: 1000, high: 4000, basis: 'test' }
const ev = (session: string, seq: number, at: number, type: string, extra: Record<string, unknown> = {}): Ev => ({ session, seq, at, type, id: `${session}:${seq}`, ...extra })
const verb: InsightEntry = {
  id: 'native-v', lemma: 'לִכְתֹּב', lemmaPlain: 'לכתוב', partOfSpeech: 'verb', createdAt: now - 10 * 86_400_000,
  forms: [{ key: 'meanings:sense1', stage: 'meanings', slot: 'sense1', sentence: 'היא כותבת מכתב', translation: 'She writes a letter' }],
}
const key = 'native-v:meanings:sense1'

describe('sessions', () => {
  it('counts time spent, cut at idle gaps and at going to the background, and says how a session ended', () => {
    const t = now - 3_600_000
    const events = [
      ev('s', 0, t, 'start', { cards: 1, front: 'en' }),
      ev('s', 1, t + 1000, 'show', { key, position: 0, front: 'en' }),
      ev('s', 2, t + 11_000, 'reveal', { position: 0, ms: 10_000 }),
      ev('a', 0, t + 15_000, 'app', { state: 'background' }),
      ev('a', 1, t + 600_000, 'app', { state: 'active' }),
      ev('s', 3, t + 601_000, 'answer', { key, position: 0, knew: true, front: 'en' }),
      ev('s', 4, t + 2_000_000, 'show', { key, position: 1, front: 'en' }),
    ]
    expect(backgroundSpans(events, now)).toEqual([[t + 15_000, t + 600_000]])
    const [session] = sessionsOf(events, new Map(), now)
    // 1 s + 10 s, then 4 s until the background, then an idle gap counted as IDLE_MS at most.
    expect(session.activeMs).toBe(1000 + 10_000 + 4000 + IDLE_MS)
    expect(session).toEqual(expect.objectContaining({ kind: 'study', endedBy: 'no end recorded' }))
    expect(session.counts).toEqual(expect.objectContaining({ cards: 2, answers: 1, right: 1 }))
  })
})

describe('a session told', () => {
  const t = now - 3_600_000
  const events: Ev[] = [
    ev('s', 0, t, 'start', { cards: 1, front: 'en', order: 'smart' }),
    ev('s', 1, t + 1000, 'show', { key, position: 0, front: 'en', why: 'still learning' }),
    ev('s', 2, t + 3000, 'hold', { key, position: 0, english: 'letter', found: 'hebrew', hebrew: 'מכתב', from: 'card' }),
    ev('s', 3, t + 3001, 'lookup', { key, position: 0, word: 'מכתב', lemma: 'מִכְתָּב', place: 2, help: 'english', english: 'letter', own: false }),
    ev('s', 4, t + 9000, 'reveal', { position: 0, key, ms: 8000 }),
    ev('s', 5, t + 12_000, 'answer', { key, position: 0, knew: false, front: 'en', asked: [2], ms: 11_000 }),
    ev('s', 6, t + 13_000, 'end', { answered: 1 }),
  ]
  const ctx = (predict: Context['predict'] = () => null): Context => ({
    events, entries: [verb], texts: new Map(), now,
    stateAt: at => learnerState([verb as never], events.filter(item => item.at < at), level, at),
    predict,
  })
  it('tells each event with the evidence the model took from it', () => {
    const story = sessionStory('s', ctx())!
    expect(story.summary.endedBy).toBe('finished')
    const texts = story.rows.map(row => row.text)
    expect(texts[0]).toContain('Started a round')
    expect(texts[1]).toContain('Card: לכתוב · meaning 1 · English first')
    expect(story.rows[1].detail).toContain('She writes a letter')
    expect(texts[2]).toBe('Held “letter” → מכתב')
    // The help's lookup isn't told twice; its evidence goes with the hold.
    expect(story.rows[2].model).toEqual([expect.stringContaining('against producing it, weight 0.5')])
    expect(texts[3]).toBe('Turned over after 8 s')
    const answer = story.rows[4]
    expect(answer.text).toBe('Didn’t know it')
    expect(answer.detail).toContain('11 s on the card, 3 s of it on the answer side')
    expect(answer.insight?.rule).toBe('ambiguous-miss')
    expect(answer.model?.[0]).toContain('לִכְתֹּב: against producing it, weight 1')
    expect(story.rows.at(-1)!.text).toContain('changed by this session')
  })
  it('calls out a confident prediction that was wrong, with the evidence behind it', () => {
    const prediction: Prediction = { answer: 's:5', at: t + 12_000, key, wordId: 'native-v', lemma: 'לכתוב', channel: 'production', knew: false, p: 0.82, low: 0.6, high: 0.95, prior: 0.5, cardSoFar: 0.5, cardAnswers: 0, evidence: ['knew word card (2026-11-01, weight 1)'] }
    const story = sessionStory('s', ctx(answer => (answer.id === 's:5' ? prediction : null)))!
    const answer = story.rows.find(row => row.text === 'Didn’t know it')!
    expect(answer.insight).toEqual(expect.objectContaining({ rule: 'surprise', interpretation: expect.stringContaining('knew word card') }))
    expect(answer.detail).toContain('Mila expected 82% (production, range 60%–95%); the card’s own history said 50%')
  })
})

describe('predictions and checks', () => {
  it('predicts from the side shown and sets the card’s own history beside it', () => {
    const state = learnerState([verb as never], [], level, now)
    const word = state.words.find(item => item.id === 'native-v')
    const made = predictionFor(ev('s', 1, now, 'answer', { key, knew: true, front: 'he' }), word, { right: 2, all: 2 })!
    expect(made.channel).toBe('recognition')
    expect(made.p).toBe(word!.recognition.p)
    expect(made.cardSoFar).toBe(0.75)
  })
  it('scores the model against card history and lists surprises', () => {
    const base = { key, wordId: 'native-v', lemma: 'לכתוב', channel: 'recognition' as const, low: 0, high: 1, prior: 0.5, cardAnswers: 1, evidence: [] }
    const checks = modelChecks([
      { ...base, answer: 'a', at: 1, knew: false, p: 0.9, cardSoFar: 0.4 },
      { ...base, answer: 'b', at: 2, knew: true, p: 0.6, cardSoFar: 0.7 },
    ], [], [verb], 0)
    expect(checks.surprises.map(item => item.answer)).toEqual(['a'])
    expect(checks.loss.model).toBeGreaterThan(checks.loss.card)
  })
})

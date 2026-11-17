import { describe, expect, it } from 'vitest'
import { learnerState, type Level } from '../netlify/functions/lib/learner'
import { backgroundSpans, cardLabel, evidenceLineOf, IDLE_MS, shadowChecks, modelChecks, predictionFor, sessionsOf, sessionStory, type Context, type Ev, type InsightEntry, type Prediction } from '../netlify/functions/lib/insights'

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
    expect(session).toEqual(expect.objectContaining({ kind: 'study', endedBy: 'no end recorded', ended: 'round of 1: stopped after 1 answered; no end recorded' }))
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
    ev('s', 4, t + 9000, 'reveal', { position: 0, key, ms: 7600 }),
    ev('s', 5, t + 12_000, 'answer', { key, position: 0, knew: false, front: 'en', asked: [2], ms: 11_000 }),
    ev('s', 6, t + 14_500, 'lookup', { key, position: 0, side: 'back', front: 'en', word: 'מכתב', lemma: 'מִכְתָּב', place: 2, own: false }),
    ev('s', 7, t + 14_900, 'lookup', { key, position: 0, side: 'back', front: 'en', word: 'מכתב', lemma: 'מִכְתָּב', place: 2, own: false }),
    ev('s', 8, t + 15_000, 'end', { answered: 1 }),
  ]
  const ctx = (predict: Context['predict'] = () => null): Context => ({
    events, entries: [verb], texts: new Map(), now,
    stateAt: at => learnerState([verb as never], events.filter(item => item.at < at), level, at),
    predict,
  })
  it('tells each event with the evidence the model took from it', () => {
    const story = sessionStory('s', ctx())!
    expect(story.summary.ended).toBe('finished the round of 1, 1 answered')
    const texts = story.rows.map(row => row.text)
    expect(texts[0]).toContain('Started a round')
    expect(texts[1]).toContain('Card: לכתוב · meaning 1 · English first')
    expect(story.rows[1].detail).toEqual(['She writes a letter', 'Why this card: still learning'])
    expect(story.rows[1].words).toEqual([{ id: 'native-v', lemma: 'לכתוב' }])
    expect(texts[2]).toBe('Held “letter” for a hint: מכתב')
    // The hint's lookup isn't told twice; its evidence goes with the hold, in one plain sentence.
    expect(story.rows[2].model).toEqual(['Counts against producing מכתב, weight 0.5: you asked for its Hebrew.'])
    expect(texts[3]).toBe('Turned over after 8 s')
    const answer = story.rows[4]
    expect(answer.text).toBe('Didn’t know it')
    // One rounding: 8 s + 3 s = 11 s, though 7.6 s and 3.4 s were measured.
    expect(answer.detail).toContain('11 s on the card: 8 s on the question side, 3 s on the answer side')
    expect(answer.insight?.rule).toBe('ambiguous-miss')
    expect(answer.words).toBeUndefined()
    expect(answer.model).toEqual(['Counts against producing לִכְתֹּב, weight 1.'])
    // Tapped after turning over an English-first card: noted, with why; tapped again: why not again.
    expect(story.rows[5].model).toEqual(['Not counted for מכתב: you were checking the answer side of an English-first card.'])
    expect(story.rows[6].model).toEqual(['Not counted again: the same word was looked up here 0 s before.'])
    expect(story.rows.at(-1)!.text).toContain('changed by this session')
  })
  it('calls out a confident prediction that was wrong, with the evidence behind it', () => {
    const prediction: Prediction = { answer: 's:5', at: t + 12_000, key, wordId: 'native-v', lemma: 'לכתוב', channel: 'production', knew: false, p: 0.82, low: 0.6, high: 0.95, prior: 0.5, cardSoFar: 0.5, cardAnswers: 0, evidence: [{ text: 'Knew the word card', at: t - 86_400_000, dated: false, side: null, weight: 1, knew: true, kind: 'result' }] }
    const story = sessionStory('s', ctx(answer => (answer.id === 's:5' ? prediction : null)))!
    const answer = story.rows.find(row => row.text === 'Didn’t know it')!
    expect(answer.insight).toEqual(expect.objectContaining({ rule: 'surprise', interpretation: expect.stringContaining('knew the word card, date only') }))
    expect(answer.detail).toContain('Mila expected 82% for producing it, likely 60% to 95%. Card history: no answers yet, 50% by default.')
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
    expect(checks.rate).toBe(0.5)
    expect(checks.loss.base).toBeCloseTo(0.693, 2)
    expect(checks.calibration).toEqual([{ channel: 'recognition', range: '50–75%', n: 1, predicted: 0.6, actual: 1, card: 0.7 }, { channel: 'recognition', range: '75–100%', n: 1, predicted: 0.9, actual: 0, card: 0.4 }])
  })
})

describe('plain words', () => {
  it('says the model’s evidence without nested brackets, its side and date apart', () => {
    const line = evidenceLineOf({ at: 1, channel: 'either', knew: false, weight: 1, kind: 'result', dated: false, what: 'missed present f.pl (side not recorded, older result: date not kept)' })
    expect(line).toEqual(expect.objectContaining({ text: 'Missed present, feminine plural', side: null, dated: false }))
    expect(evidenceLineOf({ at: 1, channel: 'production', knew: false, weight: 0.5, kind: 'help', what: 'asked for on a card shown in English, for "deer." (הצבי) (word found by its spelling)' }).text)
      .toBe('Asked for its Hebrew on an English card: “deer” → הצבי, word found by its spelling')
    expect(evidenceLineOf({ at: 1, channel: 'recognition', knew: false, weight: 0.7, kind: 'lookup', what: 'looked up while reading (נהרס)' })).toEqual(expect.objectContaining({ text: 'Looked up while reading: נהרס', side: null }))
    expect(cardLabel('w:present:m.sg')).toBe('present, masculine singular')
    expect(cardLabel('w:imperative:pl')).toBe('command, to several people')
  })
  it('tells reading sessions on the same passage minutes apart as one visit', () => {
    const t = now - 3_600_000
    const events = [ev('r1', 0, t, 'read', { text: 'p' }), ev('r1', 1, t + 1000, 'select', { text: 'p', segment: 0 }), ev('r2', 0, t + 300_000, 'read', { text: 'p' }), ev('r2', 1, t + 301_000, 'select', { text: 'p', segment: 1 })]
    const [visit] = sessionsOf(events, new Map(), now)
    expect(visit).toEqual(expect.objectContaining({ id: 'r1+r2', parts: 2, counts: expect.objectContaining({ sentences: 2 }) }))
    expect(visit.ended).toContain('opened 2 times within minutes')
  })
  it('says late arrival once, and whether Study started without the events', () => {
    const t = now - 3_600_000
    const events = [ev('r', 0, t, 'lookup', { text: 'p', word: 'x', receivedAt: t + 7_200_000 }), ev('s', 0, t + 600_000, 'start', { cards: 3 })]
    const reading = sessionsOf(events, new Map(), now).find(item => item.id === 'r')!
    expect(reading.late).toEqual({ count: 1, receivedAt: t + 7_200_000, missed: [t + 600_000] })
  })
})

describe('shadow score against what happened', () => {
  it('follows each scored word to whether it was shown and how its next unprimed answer went', () => {
    const t = now - 3 * 86_400_000
    const words = [{ id: 'a', p: 'review', s: 0.9, n: 0.7, sr: 1, r: 2, c: true, w: true }, { id: 'b', p: 'review', s: 0.8, n: 0.65, sr: 2, r: 9, c: false, w: true }, { id: 'c', p: 'review', s: 0.2, n: 0.3, sr: 9, r: 1, c: true, w: false }]
    const events = [
      ev('s', 0, t, 'plan', { shadow: { v: 'score-v0', words } }),
      ev('s', 1, t + 1000, 'show', { key: 'a:word', position: 0 }), ev('s', 2, t + 2000, 'answer', { key: 'a:word', position: 0, knew: false }),
      ev('s', 3, t + 3000, 'show', { key: 'c:word', position: 1 }), ev('s', 4, t + 4000, 'answer', { key: 'c:word', position: 1, knew: true }),
    ]
    const checks = shadowChecks(events, now)
    expect(checks).toEqual(expect.objectContaining({ version: 'score-v0', plans: 1, words: 3 }))
    expect(checks.need.find(item => item.label === '0.6 and over')).toEqual(expect.objectContaining({ n: 2, answered: 1, missed: 1 }))
    expect(checks.need.find(item => item.label === 'under 0.4')).toEqual(expect.objectContaining({ n: 1, missed: 0 }))
    expect(checks.groups.find(item => item.label === 'Score only')).toEqual(expect.objectContaining({ n: 1, shown: 0, answered: 0 }))
  })
})

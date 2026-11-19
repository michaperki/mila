import { describe, expect, it } from 'vitest'
import { learnerState, type LearnerEntry, type Level } from '../netlify/functions/lib/learner'
import { feedOf } from '../netlify/functions/lib/feed'
import type { Ev, InsightEntry, TextDoc } from '../netlify/functions/lib/insights'

const DAY = 86_400_000
const now = 1_800_000_000_000
const level: Level = { words: 2000, low: 1000, high: 4000, basis: 'test' }
const t = now - DAY
const verb = { id: 'v', lemma: 'לִכְתֹּב', lemmaPlain: 'לכתוב', gloss: 'to write, to compose', partOfSpeech: 'verb', createdAt: t - 10 * DAY, forms: [{ key: 'meanings:sense1', stage: 'meanings', slot: 'sense1' }] }
const noun = { id: 'n', lemma: 'מִכְתָּב', lemmaPlain: 'מכתב', gloss: 'letter', partOfSpeech: 'noun', createdAt: t - 10 * DAY }
const ev = (seq: number, type: string, extra: Record<string, unknown> = {}): Ev => ({ session: 's', seq, at: t + seq * 1000, type, id: `s:${seq}`, ...extra })
const feedFor = (events: Ev[], entries: InsightEntry[] = [verb, noun] as InsightEntry[], texts = new Map<string, TextDoc>()) =>
  feedOf(events, entries, texts, learnerState(entries as LearnerEntry[], events, level, now), { now })

describe('the Feed', () => {
  it('tells an answer as observed, what the model took from it, and the estimate before and after', () => {
    const [item] = feedFor([ev(1, 'answer', { key: 'v:meanings:sense1', position: 0, knew: true, primed: false, front: 'he', ms: 6000 })])
    expect(item.observed).toBe('Knew it · meaning 1')
    expect(item.detail).toEqual(['Flashcard, Hebrew first', '6 s on the card'])
    expect(item.words).toHaveLength(1)
    const [word] = item.words
    expect(word.interpretation).toBe('For reading it · full weight')
    expect(word.change!.skill).toBe('reading')
    expect(word.change!.after).toBeGreaterThan(word.change!.before)
    // With the range it could be in, which one answer leaves wide.
    expect(word.change!.low).toBeLessThan(word.change!.after)
    expect(word.change!.high).toBeGreaterThan(word.change!.after)
  })
  it('says what help an answer had, and that it counted less', () => {
    const [item] = feedFor([
      ev(1, 'hint', { key: 'v:meanings:sense1', position: 0, kind: 'english' }),
      ev(2, 'answer', { key: 'v:meanings:sense1', position: 0, knew: true, exercise: 'choice', tests: 'word', quiz: true, assisted: ['english'] }),
    ])
    expect(item.observed).toBe('Chose right · meaning 1')
    expect(item.detail).toContain('with the English shown')
    expect(item.words[0].interpretation).toContain('the English was shown')
  })
  it('shows evidence too ambiguous to count as noted, with no change', () => {
    const events = [
      ev(1, 'show', { key: 'v:meanings:sense1', position: 0, front: 'en' }),
      ev(2, 'lookup', { key: 'v:meanings:sense1', position: 0, word: 'מכתב', lemma: 'מִכְתָּב', own: false }),
    ]
    const lookup = feedFor(events).find(item => item.icon === 'lookup')!
    expect(lookup.words[0].counted).toBe(false)
    expect(lookup.words[0].interpretation).toMatch(/^Noted, not counted/)
    expect(lookup.words[0].change).toBeNull()
  })
  it('tells reading a sentence at a time: how it was chosen, its lookups and saves, and saved words passed', () => {
    const texts = new Map<string, TextDoc>([['p', { textId: 'p', title: 'A letter', chunks: [{ text: 'הוא כתב מכתב ארוך' }] }]])
    const fresh = { id: 'w', lemma: 'אָרֹךְ', lemmaPlain: 'ארוך', gloss: 'long', partOfSpeech: 'adjective', createdAt: t + 5000 }
    const items = feedFor([
      ev(1, 'read', { text: 'p' }),
      ev(2, 'select', { text: 'p', segment: 0, english: 'tap', via: 'next' }),
      ev(3, 'lookup', { text: 'p', segment: 0, place: 3, word: 'ארוך', lemma: 'אָרֹךְ' }),
      ev(4, 'save', { of: 's:3', saved: 'w' }),
      ev(5, 'deselect', { text: 'p', segment: 0, ms: 32000, english: 'tap', how: 'next' }),
    ], [verb, noun, fresh] as InsightEntry[], texts)
    const [read] = items.filter(item => item.kind === 'reading')
    expect(read.observed).toBe('Read sentence 1 of “A letter”')
    expect(read.detail).toEqual(['Chosen with Next', 'selected for 32 s', 'its English on screen (which doesn’t say it was read)'])
    // Looked up and then saved: one line, though the lookup spelled it אָרֹךְ and the save ארוך.
    expect(read.words).toHaveLength(1)
    expect(read.words[0].interpretation).toContain('Then saved')
    // מכתב, saved before and not looked up, was passed; recorded, not counted.
    expect(read.passed).toEqual(['מכתב'])
  })
})

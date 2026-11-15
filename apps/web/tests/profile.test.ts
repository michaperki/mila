import { describe, expect, it } from 'vitest'
import type { LearnerEvent } from '../netlify/functions/lib/learner'
import { isPersonal, learnerProfile, profileBlock, supportOf, supportOfCard, type ProfileEntry } from '../netlify/functions/lib/profile'
import { relevanceOf } from '../netlify/functions/lib/relevance'
import { promptFor, slotsOf } from '../netlify/functions/lib/forms-writer'

const DAY = 86_400_000
const now = 1_800_000_000_000
const word = (id: string, lemma: string, extra: Partial<ProfileEntry> = {}): ProfileEntry =>
  ({ id: `native-${id}`, lemma, lemmaPlain: lemma, gloss: `${id} meaning`, partOfSpeech: 'verb', createdAt: now - 20 * DAY, encounters: [{ surface: lemma, at: now - 20 * DAY }], ...extra })
const event = (seq: number, type: string, fields: Record<string, unknown>): LearnerEvent => ({ session: 's', seq, at: now - DAY + seq * 1000, type, id: `s:${seq}`, ...fields })

describe('learner profile', () => {
  const steady = word('a', 'לכתוב', { results: [true, true], primed: [false, false], last: now - 2 * DAY })
  const primedOnly = word('b', 'לקרוא', { results: [true, true], primed: [true, true], last: now - 2 * DAY })
  const learning = word('c', 'לשמוע', { results: [false, true], last: now - 2 * DAY })
  const ahead = word('d', 'להצליח')
  const marked = word('e', 'לדבר', { known: ['word'] })
  const phrase = word('f', 'בהתה חזרה', { partOfSpeech: 'phrase', results: [true, true], last: now - DAY })

  it('places words by their own practice: recalled as Study counts it, learning, or saved and not studied', () => {
    const profile = learnerProfile([steady, primedOnly, learning, ahead, marked, phrase], [], now)
    const place = (lemma: string) => profile.words.get(lemma)?.place
    expect(place('לכתוב')).toBe('steady')
    // Right only straight after seeing it is not yet recalled.
    expect(place('לקרוא')).toBe('learning')
    expect(place('לשמוע')).toBe('learning')
    expect(place('להצליח')).toBe('ahead')
    expect(place('לדבר')).toBe('steady')
    // Selections saved as written are left out.
    expect(profile.words.has('בהתה חזרה')).toBe(false)
  })

  it('keeps which way round a word was answered, unprimed answers only, the latest deciding', () => {
    const events = [
      event(1, 'answer', { key: 'native-a:word', knew: false, primed: false, front: 'en' }),
      event(2, 'answer', { key: 'native-a:word', knew: true, primed: false, front: 'en' }),
      event(3, 'answer', { key: 'native-a:word', knew: true, primed: false, front: 'he' }),
      event(4, 'answer', { key: 'native-c:word', knew: true, primed: true, front: 'en' }),
    ]
    const profile = learnerProfile([steady, learning], events, now)
    expect(profile.words.get('לכתוב')).toMatchObject({ said: true, recognized: true })
    expect(profile.words.get('לשמוע')?.said).toBeUndefined()
  })

  it('a word looked up after it was recalled has slipped; a common word looked up once is not marked, twice it is', () => {
    const events = [
      event(1, 'lookup', { word: 'וכתב', saved: true, text: 't', segment: 1, place: 2 }),
      event(2, 'explained', { of: 's:1', lemma: 'לכתוב' }),
      event(3, 'lookup', { word: 'אוויר', saved: false, text: 't', segment: 2, place: 0 }),
      event(4, 'lookup', { word: 'שלהם', saved: false, text: 't', segment: 3, place: 1 }),
      // The same word tapped again where it stands is one lookup.
      event(5, 'lookup', { word: 'שלהם', saved: false, text: 't', segment: 3, place: 1 }),
      event(6, 'lookup', { word: 'ואם', saved: false, text: 't', segment: 4, place: 0 }),
      event(7, 'explained', { of: 's:6', lemma: 'אם' }),
      event(8, 'lookup', { word: 'שלהם', saved: false, key: 'native-c:word', place: 3 }),
    ]
    const profile = learnerProfile([steady], events, now)
    expect(profile.words.get('לכתוב')?.place).toBe('shaky')
    expect(profile.words.get('אוויר')?.place).toBe('shaky')
    expect(profile.words.get('שלהם')?.place).toBe('shaky')
    expect(profile.words.has('אם')).toBe(false)
  })

  it('a card\'s other words are what they are to the learner, or else how common', () => {
    const profile = learnerProfile([steady, learning, ahead], [], now)
    expect(supportOf('לכתוב', profile)).toBe('steady')
    expect(supportOf('לֹא', profile)).toBe('common')
    expect(supportOfCard([{ lemma: 'לשמוע' }, { lemma: 'להצליח' }, { lemma: 'של' }, { lemma: 'של' }], profile)).toEqual({ learning: 1, ahead: 1, common: 2 })
  })

  it('tells the writer about the word and the learner, after the word\'s own details, and only with room for a new word when asked', () => {
    const profile = learnerProfile([steady, learning, word('d', 'להצליח', { encounters: [{ surface: 'הצליח', at: 1 }, { surface: 'מצליח', at: 2 }] }), word('g', 'מכתב', { partOfSpeech: 'noun' })], [], now)
    const target = word('h', 'לרוץ')
    const block = profileBlock(profile, target, 'meanings')
    expect(block).toContain('these are their first cards for it')
    expect(block).toContain('Words they recall reliably: לכתוב')
    expect(block).toContain('Words they are learning now: לשמוע')
    expect(block).toContain('להצליח "d meaning"')
    expect(block).toContain('may also bring in one of the words they saved from their reading')
    const plain = profileBlock(profile, target, 'meanings', { stretch: false })
    expect(plain).not.toContain('saved from their reading and haven\'t studied')
    expect(plain).not.toContain('At most one')
    const prompt = promptFor({ lemma: 'לרוץ', gloss: 'to run', partOfSpeech: 'verb' }, 'meanings', slotsOf({ lemma: 'לרוץ', gloss: 'to run', partOfSpeech: 'verb' }, 'meanings'), [], block)
    expect(prompt.endsWith(block)).toBe(true)
    // Without it, the prompt is as before.
    expect(promptFor({ lemma: 'לרוץ', gloss: 'to run', partOfSpeech: 'verb' }, 'meanings', [])).not.toContain('About this learner')
  })
})

describe('which writer', () => {
  it('splits words in half by the word, all of a word\'s stages alike, unless set off or all', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `native-w${i}`)
    const personal = ids.filter(id => isPersonal(id, 'split')).length
    expect(personal).toBeGreaterThan(70)
    expect(personal).toBeLessThan(130)
    expect(isPersonal(ids[0], 'split')).toBe(isPersonal(ids[0], 'split'))
    expect(ids.some(id => isPersonal(id, 'off'))).toBe(false)
    expect(ids.every(id => isPersonal(id, 'all'))).toBe(true)
  })
})

describe('relevance for intake', () => {
  it('ranks each saved word by how common it is, and counts lookups after it was saved, once per place', () => {
    const docs = [word('a', 'לכתוב'), word('b', 'כלומניק')]
    const lookups = [
      event(1, 'lookup', { word: 'כתבתי', saved: true, text: 't', segment: 1, place: 0, at: now - DAY }),
      event(2, 'lookup', { word: 'כתבתי', saved: true, text: 't', segment: 1, place: 0, at: now - DAY + 5000 }),
      event(3, 'lookup', { word: 'לכתוב', saved: true, key: 'native-x:word', place: 2, lemma: 'לכתוב', at: now - 2 * DAY }),
      // The lookup it was saved from doesn't count.
      event(4, 'lookup', { word: 'כלומניק', saved: false, text: 't', segment: 2, place: 1, at: now - 20 * DAY - 1000 }),
    ]
    docs[0].encounters!.push({ surface: 'כתבתי', at: now - 10 * DAY })
    const [writing, other] = relevanceOf(docs, lookups)
    expect(writing.rank).toBeLessThan(3000)
    expect(writing.lookedUp).toEqual({ count: 2, last: now - DAY + 5000 })
    expect(other.lookedUp).toBeUndefined()
  })
})

describe('new sentences for cards already written', () => {
  it('asks for the same form and meaning per slot, only the slots asked for', () => {
    const entry = { lemma: 'לפתוח', gloss: 'to open', partOfSpeech: 'verb', forms: [{ stage: 'present', slot: 'm.sg', en: 'opens', sentence: 'הוא פותח את החלון' }] }
    const prompt = promptFor(entry, 'present', slotsOf(entry, 'present').filter(item => item.slot === 'm.sg'), [], '', [{ slot: 'm.sg', he: 'פּוֹתֵחַ', en: 'he opens' }])
    expect(prompt).toContain('slot "m.sg": פּוֹתֵחַ "he opens"')
    expect(prompt).toContain('in a new sentence that shows it in another situation')
    expect(prompt).not.toContain('Forms to write')
    expect(prompt).toContain('הוא פותח את החלון')
  })
})

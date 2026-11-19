import { type Channel, estimate, type Evidence, type LearnerEntry, type LearnerState, lemmaKeyOf, parseCardKey, savedFormMatcher, type WordState } from './learner.ts'
import { cardLabel, type Ev, finalAnswers, type InsightEntry, lessBecause, type TextDoc } from './insights.ts'

// Learning Insights → Feed (consolidation phase C, 2026-11-19): what Mila saw you do, newest first,
// and what it made of it, word by word, keeping three things apart:
// - observed: what happened, as the events recorded it (a card answered, how it was asked and with
//   what help; a sentence read, how it was chosen and how long it was selected; a word looked up);
// - interpretation: what the learner model took from it for a word, which skill (reading it,
//   producing it) and how much it counts; or that it was noted or only recorded, not counted,
//   because it doesn't say enough (a lookup on a card's answer side, a saved word read past);
// - change: the model's estimate for that skill just before and just after, from the same evidence
//   the model holds now (learner.ts estimate), so a row can show a change of nothing.
// Reading is told a sentence at a time, its lookups inside it and the saved words passed without
// one in a single line, rather than a row for every word.

export const FEED_VERSION = 'feed-v0'
// `low`, `high`: the 80% range of the estimate after, which says how little one change can mean.
export type FeedChange = { skill: 'reading' | 'producing'; before: number; after: number; low: number; high: number }
export type FeedWord = { id?: string; lemma: string; gloss?: string; card?: string; interpretation: string; counted: boolean; change: FeedChange | null }
export type FeedItem = {
  id: string; at: number; session: string; kind: 'study' | 'reading'
  icon: 'right' | 'wrong' | 'choice' | 'sentence' | 'lookup' | 'save'
  observed: string; detail: string[]; sentence?: string; words: FeedWord[]; passed?: string[]
}

const DAY = 86_400_000
const createdOf = (entry: InsightEntry) => (typeof entry.createdAt === 'string' ? Date.parse(entry.createdAt) : Number(entry.createdAt))
const seconds = (ms: unknown) => (typeof ms === 'number' && ms > 0 ? (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`) : null)
const SKILL: Record<Channel, FeedChange['skill']> = { recognition: 'reading', production: 'producing' }
const plainLemma = (word: Pick<WordState, 'lemma'>) => word.lemma.replace(/[֑-ׇ]/g, '')
// A card's name, once where its stage and slot say the same ("plural, plural").
const nameOf = (key: string) => { const name = cardLabel(key); const [a, b] = name.split(', '); return a === b ? a : name }

// What the model took from one piece of evidence, in a short line, and whether it counted.
export function interpretationOf(evidence: Evidence): { text: string; counted: boolean } {
  if (evidence.weight === 0) {
    if (evidence.what.startsWith('tapped on the answer side')) return { text: 'Noted, not counted: on the answer side of an English-first card, a tap is mostly checking the sentence', counted: false }
    if (evidence.what.includes('was looked up on this card')) return { text: 'Noted, not counted: a word looked up on its card may be why it was hard, or may not', counted: false }
    return { text: 'Noted, not counted: too ambiguous to say what it means', counted: false }
  }
  const skill = evidence.channel === 'production' ? 'producing it' : evidence.channel === 'recognition' ? 'reading it' : 'knowing it'
  const how = evidence.kind === 'help' ? 'you asked for its Hebrew on a card'
    : evidence.kind === 'lookup' ? (evidence.what.includes('on a card') ? 'looked up on a card' : 'looked up while reading; a lookup can also be a check')
      : evidence.weight >= 0.99 ? 'full weight' : lessBecause(evidence)
  return { text: `${evidence.knew ? 'For' : 'Against'} ${skill} · ${how}`, counted: true }
}

// The estimate for the evidence's skill just before it and just after it, at its moment.
export function changeOf(word: WordState, evidence: Evidence): FeedChange | null {
  if (evidence.weight === 0) return null
  const channel: Channel = evidence.channel === 'either' ? 'recognition' : evidence.channel
  const at = word.evidence.indexOf(evidence)
  const upTo = (included: boolean) => word.evidence.filter((item, i) => item.at < evidence.at || (item.at === evidence.at && (i < at || (included && i === at))))
  const after = estimate(word.prior[channel], upTo(true), channel, evidence.at)
  return { skill: SKILL[channel], before: estimate(word.prior[channel], upTo(false), channel, evidence.at).p, after: after.p, low: after.low, high: after.high }
}

export function feedOf(events: Ev[], entries: InsightEntry[], texts: Map<string, TextDoc>, state: LearnerState, { now = Date.now(), days = 7 } = {}): FeedItem[] {
  const since = now - days * DAY
  // The evidence the model holds, by the event it came from.
  const byEvent = new Map<string, { word: WordState; evidence: Evidence }[]>()
  for (const word of state.words) for (const evidence of word.evidence) for (const id of evidence.from ?? []) (byEvent.get(id) ?? byEvent.set(id, []).get(id)!).push({ word, evidence })
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const wordsOf = (event: Ev): FeedWord[] => (byEvent.get(event.id) ?? []).map(({ word, evidence }) => {
    const { text, counted } = interpretationOf(evidence)
    return { id: word.id, lemma: plainLemma(word), gloss: word.gloss?.split(/[,;]/)[0]?.trim(), interpretation: text, counted, change: changeOf(word, evidence) }
  })
  const recent = events.filter(event => event.at >= since)
  const answers = finalAnswers(recent)
  const items: FeedItem[] = []

  // Study: each card answered (its final answer), and each word looked up on a card.
  const hints = new Map<string, string[]>()
  for (const event of recent) if (event.type === 'hint') hints.set(`${event.session}:${event.position}`, [...(hints.get(`${event.session}:${event.position}`) ?? []), String(event.kind)])
  for (const event of recent) {
    if (event.type === 'answer' && answers.has(event) && typeof event.key === 'string') {
      const card = parseCardKey(event.key)
      const entry = byId.get(card.wordId)
      const choice = event.exercise === 'choice'
      const assisted = Array.isArray(event.assisted) ? event.assisted.map(String) : []
      const help = [...new Set([...assisted, ...(hints.get(`${event.session}:${event.position}`) ?? [])])]
      const detail = [
        choice ? `Fill in the blank, choosing the ${event.tests === 'form' ? 'form' : 'word'}${event.chosen && !event.knew ? `: chose ${String(event.chosen)}` : ''}` : `Flashcard, ${event.front === 'en' ? 'English' : 'Hebrew'} first`,
        event.primed ? 'just after another card of its word' : null,
        help.includes('english') ? 'with the English shown' : null,
        help.includes('hebrew-word') ? 'with Hebrew given for words around it' : null,
        seconds(event.ms) ? `${seconds(event.ms)} on the card` : null,
      ].filter((line): line is string => !!line)
      let words = wordsOf(event)
      // A form chosen counts toward that form's grammar, not the word: said so rather than left blank.
      if (!words.length && entry) words = [{ id: entry.id, lemma: entry.lemmaPlain || entry.lemma, gloss: entry.gloss?.split(/[,;]/)[0]?.trim(), interpretation: choice && event.tests === 'form' ? 'Counted for the grammar of this form, not for the word itself' : 'Not counted', counted: false, change: null }]
      items.push({ id: event.id, at: event.at, session: event.session, kind: 'study', icon: choice ? 'choice' : event.knew ? 'right' : 'wrong', observed: `${event.knew ? (choice ? 'Chose right' : 'Knew it') : (choice ? 'Chose wrong' : 'Didn’t know it')} · ${nameOf(event.key)}`, detail, words: words.map(word => ({ ...word, card: nameOf(event.key as string) })) })
    }
    if (event.type === 'lookup' && typeof event.key === 'string' && !event.text) {
      const words = wordsOf(event)
      const english = event.help === 'english'
      items.push({ id: event.id, at: event.at, session: event.session, kind: 'study', icon: 'lookup', observed: english ? `Held “${String(event.english ?? '')}” for its Hebrew` : `Looked up ${String(event.word ?? '')} on a card`, detail: [], words: words.length ? words : [{ lemma: String(event.lemma ?? event.word ?? ''), interpretation: 'Recorded, not counted: Mila couldn’t tell which word this is', counted: false, change: null }] })
    }
  }

  // Reading: a row a sentence, with what was looked up and saved in it, and the saved words in it
  // read past without a lookup (recorded, never counted: passing a word isn't understanding it).
  const match = savedFormMatcher(entries as LearnerEntry[])
  const sessions = new Map<string, Ev[]>()
  for (const event of recent) if (['select', 'deselect', 'lookup'].includes(event.type) && typeof event.text === 'string') (sessions.get(event.session) ?? sessions.set(event.session, []).get(event.session)!).push(event)
  // A save says which lookup it came from (`of`), not the passage.
  const savesOf = new Map<string, Ev[]>()
  for (const event of recent) if (event.type === 'save' && typeof event.of === 'string') savesOf.set(event.of, [...(savesOf.get(event.of) ?? []), event])
  for (const list of sessions.values()) {
    const selects = list.filter(event => event.type === 'select')
    for (const [i, select] of selects.entries()) {
      const next = selects[i + 1]
      const inside = list.filter(event => event.at >= select.at && (!next || event.at < next.at) && event.text === select.text && event.segment === select.segment)
      const end = inside.find(event => event.type === 'deselect')
      const doc = texts.get(String(select.text))
      const sentence = doc?.chunks?.[Number(select.segment)]?.text
      const lookups = inside.filter(event => event.type === 'lookup')
      const saves = lookups.flatMap(event => savesOf.get(event.id) ?? [])
      // Each line with the lookup it came from, so a save (which names its lookup) joins it.
      const lines = lookups.flatMap(event => {
        const found = wordsOf(event)
        return (found.length ? found : [{ lemma: plainLemma({ lemma: String(event.lemma ?? event.word ?? '') }), interpretation: 'Looked up; not counted: Mila couldn’t tell which word this is', counted: false, change: null }]).map(word => ({ word, of: event.id }))
      })
      const words = lines.map(line => line.word)
      // A word saved here: on its lookup's line when there is one, else a line of its own.
      const savedHere = new Set<string>()
      for (const save of saves) {
        const entry = byId.get(String(save.saved))
        if (!entry) continue
        savedHere.add(lemmaKeyOf(entry.lemmaPlain || entry.lemma))
        const same = lines.find(line => line.word.id === entry.id)?.word ?? lines.find(line => line.of === save.of)?.word
        if (same) same.interpretation += '. Then saved: a wish to learn it, not evidence either way'
        else words.push({ id: entry.id, lemma: entry.lemmaPlain || entry.lemma, gloss: entry.gloss?.split(/[,;]/)[0]?.trim(), interpretation: 'Saved: a wish to learn it, not evidence either way', counted: false, change: null })
      }
      // Passed: words saved before this sentence, in it, and neither looked up nor saved here.
      const looked = new Set([...lookups.map(event => lemmaKeyOf(String(event.lemma ?? event.word ?? ''))), ...words.map(word => lemmaKeyOf(word.lemma)), ...savedHere])
      const savedBefore = (key: string) => entries.some(entry => lemmaKeyOf(entry.lemmaPlain || entry.lemma) === key && !(createdOf(entry) >= select.at))
      const passed = new Set<string>()
      for (const token of (sentence ?? '').split(/[\s־]+/)) for (const key of match(token.replace(/[^א-ת֑-ׇ'"׳״]/g, ''))) if (!looked.has(key) && savedBefore(key)) passed.add(key)
      const via: Record<string, string> = { word: 'by tapping a word in it', sentence: 'by tapping it', next: 'with Next', previous: 'with Previous' }
      items.push({
        id: select.id, at: select.at, session: select.session, kind: 'reading', icon: 'sentence',
        observed: `Read sentence ${Number(select.segment) + 1}${doc?.title ? ` of “${doc.title}”` : ''}`,
        detail: [
          typeof select.via === 'string' ? `Chosen ${via[select.via] ?? select.via}` : null,
          end && seconds(end.ms) ? `selected for ${seconds(end.ms)}` : null,
          select.english === 'tap' || select.english === 'all' ? 'its English on screen (which doesn’t say it was read)' : select.english === 'off' ? 'English off' : null,
        ].filter((line): line is string => !!line),
        ...(sentence ? { sentence } : {}), words,
        ...(passed.size ? { passed: [...passed].map(key => { const entry = entries.find(item => lemmaKeyOf(item.lemmaPlain || item.lemma) === key); return entry ? entry.lemmaPlain || entry.lemma : key }) } : {}),
      })
    }
  }
  return items.sort((a, b) => b.at - a.at)
}

import { rankOf } from './frequency.ts'
import { readingExposure, type TextDoc } from './exposure.ts'
import { cardsOfEntry, type LearnerEntry, type LearnerEvent, lemmaKeyOf, parseCardKey, savedFormMatcher } from './learner.ts'

// What Study weighs when choosing which saved words come in next (apps/mobile/src/lib/forms.ts
// intakeOrder), worked out as the words are fetched (vocab.ts) rather than stored: `rank`, how
// common the word is (lib/frequency.ts, by its dictionary form or the forms it was met in), and
// `lookedUp`, how often it was looked up again after it was saved, in the reader or on a card (in
// different places: the same word tapped twice where it stands is once), and when last. Also, for
// Study's shadow score (mobile lib/scoring.ts), when given: `firstStudied`, when the word was first
// answered in Study (its first recorded answer; none for a word studied before answers were
// recorded, on 2026-11-05, which its cards' kept results show), and `reading`, how often it comes up in the part of the saved passages
// read so far and in how many (lib/exposure.ts), counted only where it does.
const SAVED_GRACE = 60_000
export function relevanceOf<T extends object>(docs: T[], lookups: LearnerEvent[], { answers, texts }: { answers?: LearnerEvent[]; texts?: TextDoc[] } = {}) {
  const entries = docs as unknown as LearnerEntry[]
  const matcher = savedFormMatcher(entries, { strict: false })
  const byKey = new Map(entries.map(entry => [lemmaKeyOf(entry.lemmaPlain || entry.lemma || ''), entry]))
  const looked = new Map<string, { places: Set<string>; last: number }>()
  for (const event of lookups) {
    if (event.type !== 'lookup' || typeof event.word !== 'string' || event.phrase) continue
    const key = typeof event.lemma === 'string' && event.lemma ? lemmaKeyOf(event.lemma) : matcher(event.word)[0]
    const entry = key ? byKey.get(key) : undefined
    if (!entry || event.at < Number(entry.createdAt) + SAVED_GRACE) continue
    const seen = looked.get(entry.id) ?? { places: new Set<string>(), last: 0 }
    seen.places.add(`${event.key ?? event.text}:${event.segment ?? ''}:${event.place}`)
    looked.set(entry.id, { places: seen.places, last: Math.max(seen.last, event.at) })
  }
  const first = new Map<string, number>()
  const recorded = new Map<string, number>()
  for (const answer of answers ?? []) {
    if (answer.type !== 'answer' || typeof answer.key !== 'string') continue
    const { wordId } = parseCardKey(answer.key)
    recorded.set(answer.key, (recorded.get(answer.key) ?? 0) + 1)
    if (!first.has(wordId) || answer.at < first.get(wordId)!) first.set(wordId, answer.at)
  }
  // A card keeping more results than it has recorded answers was studied before answers were
  // recorded: when its word was first studied isn't known, only that it was earlier.
  const studiedBefore = (entry: LearnerEntry) => cardsOfEntry(entry).some(card => (card.results.results?.length ?? 0) > (recorded.get(card.key) ?? 0))
  const exposure = texts?.length ? readingExposure(texts, entries).words : null
  return docs.map((doc, i) => {
    const entry = entries[i]
    const rank = rankOf(entry.lemmaPlain || entry.lemma, ...(entry.encounters || []).map(met => met.surface))
    const again = looked.get(entry.id)
    const read = exposure?.get(lemmaKeyOf(entry.lemmaPlain || entry.lemma || ''))
    return {
      ...doc, ...(rank ? { rank } : {}), ...(again ? { lookedUp: { count: again.places.size, last: again.last } } : {}),
      ...(first.has(entry.id) && !studiedBefore(entry) ? { firstStudied: first.get(entry.id) } : {}), ...(read?.read ? { reading: { read: read.read, texts: read.texts } } : {}),
    }
  })
}

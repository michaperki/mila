import { rankOf } from './frequency.ts'
import { type LearnerEntry, type LearnerEvent, lemmaKeyOf, savedFormMatcher } from './learner.ts'

// What Study weighs when choosing which saved words come in next (apps/mobile/src/lib/forms.ts
// intakeOrder), worked out as the words are fetched (vocab.ts) rather than stored: `rank`, how
// common the word is (lib/frequency.ts, by its dictionary form or the forms it was met in), and
// `lookedUp`, how often it was looked up again after it was saved, in the reader or on a card (in
// different places: the same word tapped twice where it stands is once), and when last.
const SAVED_GRACE = 60_000
export function relevanceOf<T extends object>(docs: T[], lookups: LearnerEvent[]) {
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
  return docs.map((doc, i) => {
    const entry = entries[i]
    const rank = rankOf(entry.lemmaPlain || entry.lemma, ...(entry.encounters || []).map(met => met.surface))
    const again = looked.get(entry.id)
    return { ...doc, ...(rank ? { rank } : {}), ...(again ? { lookedUp: { count: again.places.size, last: again.last } } : {}) }
  })
}

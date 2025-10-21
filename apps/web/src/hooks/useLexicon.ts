import { useCallback, useMemo } from 'react'
import { LEXICON, LexiconEntry } from '../data/lexicon'

type SearchOptions = {
  limit?: number
}

const normalise = (value: string) => value.replace(/\s+/g, '').toLowerCase()

const stripNikud = (value: string) => value.normalize('NFD').replace(/[\u0591-\u05BD\u05BF\u05C1-\u05C7]/g, '')

const scoreEntry = (entry: LexiconEntry, query: string) => {
  if (!query) return 0
  const normalQuery = normalise(query)
  const lemmaScore = entry.lemma.startsWith(query) ? 10 : entry.lemma.includes(query) ? 6 : 0
  const bareLemma = stripNikud(entry.lemma)
  const bareScore = bareLemma.startsWith(stripNikud(query)) ? 8 : 0
  const glossScore = entry.gloss.toLowerCase().includes(normalQuery) ? 5 : 0
  const pronunciationScore = entry.pronunciation.toLowerCase().includes(normalQuery) ? 4 : 0
  return Math.max(lemmaScore, bareScore) + glossScore + pronunciationScore
}

export const useLexicon = () => {
  const entries = useMemo(() => LEXICON, [])

  const search = useCallback(
    (query: string, options?: SearchOptions): LexiconEntry[] => {
      const trimmed = query.trim()
      if (!trimmed) return []

      const results = entries
        .map((entry) => ({
          entry,
          score: scoreEntry(entry, trimmed),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.entry)

      const limit = options?.limit ?? 6
      return results.slice(0, limit)
    },
    [entries],
  )

  const findByLemma = useCallback(
    (lemma: string) => {
      const clean = stripNikud(lemma.trim())
      return entries.find(
        (entry) =>
          stripNikud(entry.lemma) === clean ||
          entry.lemma === lemma.trim() ||
          entry.forms?.some((form) => stripNikud(form) === clean),
      )
    },
    [entries],
  )

  return {
    entries,
    search,
    findByLemma,
  }
}

export type { LexiconEntry } from '../data/lexicon'

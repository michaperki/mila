import { getStrongNumber } from '../data/hebrew/wordDictionary'
import { extractRootFromDictionary, getGlossForRoot } from '../data/hebrew/rootDictionary'
import { removeNikud } from '../lib/nikud'

export type LexiconEntry = {
  lemma: string
  root?: string
  sense?: string
  strongs?: string
}

export function lookupLemma(candidate: string): LexiconEntry | null {
  const normalized = removeNikud(candidate)
  if (!normalized) return null

  const strongs = getStrongNumber(normalized)
  if (!strongs) {
    return null
  }

  const root = extractRootFromDictionary(normalized) ?? undefined
  const sense = root ? getGlossForRoot(root) ?? undefined : undefined

  return {
    lemma: normalized,
    root,
    sense,
    strongs,
  }
}

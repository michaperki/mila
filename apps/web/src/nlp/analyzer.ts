import { categorizeWord } from '../lib/roots'
import { removeNikud } from '../lib/nikud'
import type { MorphCandidate, Morpheme, TokenSpan } from './types'
import { lookupLemma } from './lexicon'
import { proposeSplits } from './morphRules'

type AnalyzerOptions = {
  isKnownLemma: (candidate: string) => boolean
}

const DEFAULT_OPTIONS: AnalyzerOptions = {
  isKnownLemma: (candidate: string) => Boolean(lookupLemma(candidate)),
}

export function analyzeTokenLocally(
  token: TokenSpan,
  options: AnalyzerOptions = DEFAULT_OPTIONS,
): MorphCandidate[] {
  const proposals = proposeSplits(token.text, options.isKnownLemma)
  const candidates: MorphCandidate[] = []

  proposals.forEach((proposal) => {
    const stem = proposal.find((morpheme) => morpheme.type === 'stem')?.form ?? token.text
    const lexiconEntry = lookupLemma(stem)
    const category = categorizeWord(stem)

    const pos = mapCategoryToPos(category)
    const morphemes: Morpheme[] = proposal.map((part) => ({ ...part }))

    if (lexiconEntry) {
      candidates.push({
        lemma: lexiconEntry.lemma,
        pos,
        binyan: category.startsWith('past') || category === 'participle' ? category : undefined,
        sense: lexiconEntry.sense,
        confidence: proposal.length === 1 ? 0.92 : 0.82,
        morphemes,
        source: 'lexicon',
      })
      return
    }

    const normalizedStem = removeNikud(stem)
    if (normalizedStem.length >= 3) {
      candidates.push({
        lemma: normalizedStem,
        pos,
        binyan: category.startsWith('past') || category === 'participle' ? category : undefined,
        sense: undefined,
        confidence: proposal.length === 1 ? 0.55 : 0.45,
        morphemes,
        source: 'heuristic',
      })
    }
  })

  if (candidates.length === 0) {
    candidates.push({
      lemma: removeNikud(token.text) || token.text,
      pos: 'unknown',
      sense: undefined,
      confidence: 0.25,
      morphemes: [{ form: token.text, type: 'stem' }],
      source: 'heuristic',
    })
  }

  return dedupeCandidates(candidates).sort((a, b) => b.confidence - a.confidence)
}

function mapCategoryToPos(category: string): MorphCandidate['pos'] {
  if (category.includes('verb') || category.includes('past') || category.includes('future') || category === 'infinitive') {
    return 'verb'
  }
  if (category.includes('plural') || category === 'feminine' || category === 'base') {
    return 'noun'
  }
  if (category === 'participle') {
    return 'adjective'
  }
  return 'unknown'
}

function dedupeCandidates(candidates: MorphCandidate[]): MorphCandidate[] {
  const seen = new Map<string, MorphCandidate>()
  candidates.forEach((candidate) => {
    const key = `${candidate.lemma}|${candidate.pos}|${candidate.source}`
    const existing = seen.get(key)
    if (!existing || existing.confidence < candidate.confidence) {
      seen.set(key, candidate)
    }
  })
  return Array.from(seen.values())
}

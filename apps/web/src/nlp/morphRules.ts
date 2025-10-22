import { removeNikud } from '../lib/nikud'
import type { Morpheme } from './types'

const PREFIXES = ['וש', 'שה', 'וה', 'ומ', 'מש', 'מ', 'ו', 'ב', 'כ', 'ל', 'ש', 'ה'] as const
const SUFFIXES = ['ים', 'ות', 'נו', 'כם', 'כן', 'יהם', 'יהן', 'יו', 'יה', 'ך', 'ה', 'ן', 'ו', 'י'] as const

const HEBREW_LETTER = /[\u0590-\u05FF]/

const isHebrew = (value: string) => HEBREW_LETTER.test(value)

export type SplitProposal = Morpheme[]

export function proposeSplits(token: string, isKnownLemma: (candidate: string) => boolean): SplitProposal[] {
  const proposals: SplitProposal[] = [[{ form: token, type: 'stem' }]]
  const normalized = removeNikud(token)

  const tryStem = (stem: string) => {
    const clean = removeNikud(stem)
    if (clean.length < 2) return false
    if (!isHebrew(clean)) return false
    return isKnownLemma(stem)
  }

  for (const prefix of PREFIXES) {
    if (!normalized.startsWith(prefix)) continue
    const stem = token.slice(prefix.length)
    if (stem.length < 2) continue
    if (!tryStem(stem)) continue
    proposals.push([
      { form: token.slice(0, prefix.length), type: 'prefix' },
      { form: stem, type: 'stem' },
    ])
  }

  for (const suffix of SUFFIXES) {
    if (!normalized.endsWith(suffix)) continue
    const stem = token.slice(0, token.length - suffix.length)
    if (stem.length < 2) continue
    if (!tryStem(stem)) continue
    proposals.push([
      { form: stem, type: 'stem' },
      { form: token.slice(stem.length), type: 'suffix' },
    ])
  }

  return dedupeProposals(proposals)
}

function dedupeProposals(proposals: SplitProposal[]): SplitProposal[] {
  const seen = new Set<string>()
  return proposals.filter((proposal) => {
    const key = proposal.map((part) => `${part.type}:${part.form}`).join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

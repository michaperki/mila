import { NLP_CONFIG } from '../config/nlp'
import type { MorphCandidate, TokenAnalysis } from './types'
import { normalizeHebrew } from './normalize'
import { tokenizeHebrew } from './tokenize'
import { analyzeTokenLocally } from './analyzer'
import { llmDisambiguate } from './llm'
import { fetchRemoteMorphology, fetchLlmDisambiguation } from './remote'

export type AnalyzeOptions = {
  allowLlm?: boolean
}

export async function analyzeSentence(sentence: string, options: AnalyzeOptions = {}): Promise<TokenAnalysis[]> {
  const allowLlm = options.allowLlm ?? NLP_CONFIG.useLLM
  const normalizedSentence = normalizeHebrew(sentence)
  const tokens = tokenizeHebrew(normalizedSentence)

  const remoteCandidates = await fetchRemoteMorphology(normalizedSentence, tokens).catch(() => ({} as Record<string, MorphCandidate>))

  const localAnalyses = tokens.map((token) => {
    const key = `${token.start}-${token.end}`
    const remoteCandidate = remoteCandidates[key]
    const candidates = combineCandidates([
      ...(remoteCandidate ? [remoteCandidate] : []),
      ...analyzeTokenLocally(token),
    ])
    const [best, ...rest] = candidates
    return {
      token,
      best,
      alternatives: rest,
    }
  })

  const lowConfidenceTokens = localAnalyses
    .filter(({ best }) => best.confidence < NLP_CONFIG.lowThreshold)
    .map(({ token }) => token)

  let llmResults: Record<string, TokenAnalysis> = {}

  if (allowLlm && lowConfidenceTokens.length > 0) {
    try {
      const remoteResponse = await fetchLlmDisambiguation(normalizedSentence, lowConfidenceTokens)
      const fallbackResponse = remoteResponse.length > 0 ? [] : await llmDisambiguate({
        sentence: normalizedSentence,
        tokens: lowConfidenceTokens,
      })
      const response = remoteResponse.length > 0 ? remoteResponse : fallbackResponse
      llmResults = response.reduce<Record<string, TokenAnalysis>>((acc, item) => {
        const key = `${item.start}-${item.end}`
        acc[key] = item
        return acc
      }, {})
    } catch (error) {
      console.warn('LLM disambiguation failed', error)
    }
  }

  return localAnalyses.map(({ token, best, alternatives }) => {
    const key = `${token.start}-${token.end}`
    const llmCandidate = llmResults[key]
    if (llmCandidate) {
      return {
        ...llmCandidate,
        source: 'llm',
      }
    }

    return {
      token: token.text,
      start: token.start,
      end: token.end,
      lemma: best.lemma,
      pos: best.pos,
      binyan: best.binyan,
      sense_en: best.sense,
      confidence: best.confidence,
      morphemes: best.morphemes,
      alternatives: buildAlternatives(alternatives),
      source: 'local',
    }
  })
}

function buildAlternatives(candidates: MorphCandidate[]): TokenAnalysis['alternatives'] {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return undefined
  }

  return candidates.slice(0, 3).map((candidate) => ({
    lemma: candidate.lemma,
    pos: candidate.pos,
    sense_en: candidate.sense,
    confidence: candidate.confidence,
    morphemes: candidate.morphemes,
  }))
}

function combineCandidates(candidates: MorphCandidate[]): MorphCandidate[] {
  const seen = new Map<string, MorphCandidate>()
  candidates.forEach((candidate) => {
    const key = `${candidate.lemma}|${candidate.pos}`
    const existing = seen.get(key)
    if (!existing || existing.confidence < candidate.confidence) {
      seen.set(key, candidate)
    }
  })
  return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence)
}

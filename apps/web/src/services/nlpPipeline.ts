import { NLP_CONFIG } from '../config/nlp'
import { normalizeHebrew } from '../nlp/normalize'
import { analyzeSentence } from '../nlp/resolver'
import type { TokenAnalysis } from '../nlp/types'

type CacheEntry = {
  createdAt: number
  analyses: TokenAnalysis[]
}

const cache = new Map<string, CacheEntry>()

function getCacheKey(sentence: string): string {
  return normalizeHebrew(sentence)
}

export async function analyzeSentenceWithCache(sentence: string): Promise<TokenAnalysis[]> {
  const key = getCacheKey(sentence)
  const existing = cache.get(key)

  if (existing && Date.now() - existing.createdAt < NLP_CONFIG.cacheTTL * 1000) {
    return existing.analyses
  }

  const analyses = await analyzeSentence(sentence)
  cache.set(key, { createdAt: Date.now(), analyses })
  return analyses
}

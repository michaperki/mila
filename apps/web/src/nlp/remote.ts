import type { MorphCandidate, Morpheme, TokenAnalysis } from './types'
import type { TokenSpan } from './types'

type RemoteMorphResponse = {
  analyses: Array<{
    token: string
    start: number
    end: number
    lemma: string
    pos?: string
    binyan?: string
    sense?: string
    confidence?: number
    morphemes?: Array<{ form: string; type: Morpheme['type']; lemma?: string; gloss?: string }>
  }>
}

export async function fetchRemoteMorphology(
  sentence: string,
  tokens: TokenSpan[],
): Promise<Record<string, MorphCandidate>> {
  try {
    const response = await fetch('/.netlify/functions/nlp-analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sentence, tokens }),
    })

    if (!response.ok) {
      console.warn('Remote morphology request failed', response.status, response.statusText)
      return {}
    }

    const payload = (await response.json()) as RemoteMorphResponse
    if (!payload?.analyses) {
      return {}
    }

    return payload.analyses.reduce<Record<string, MorphCandidate>>((acc, item) => {
      const key = `${item.start}-${item.end}`
      acc[key] = {
        lemma: item.lemma,
        pos: normalizePos(item.pos),
        binyan: item.binyan,
        sense: item.sense,
        confidence: item.confidence ?? 0.85,
        morphemes: (item.morphemes ?? [{ form: item.token, type: 'stem' }]).map((morpheme) => ({
          ...morpheme,
        })),
        source: 'lexicon',
      }
      return acc
    }, {})
  } catch (error) {
    console.warn('Remote morphology request threw', error)
    return {}
  }
}

type RemoteLlmResponse = TokenAnalysis[]

export async function fetchLlmDisambiguation(
  sentence: string,
  tokens: TokenSpan[],
): Promise<RemoteLlmResponse> {
  try {
    const response = await fetch('/.netlify/functions/nlp-disambiguate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sentence, tokens }),
    })

    if (!response.ok) {
      console.warn('LLM disambiguation request failed', response.status, response.statusText)
      return []
    }

    const payload = (await response.json()) as RemoteLlmResponse
    return Array.isArray(payload) ? payload : []
  } catch (error) {
    console.warn('LLM disambiguation request threw', error)
    return []
  }
}

function normalizePos(pos?: string): MorphCandidate['pos'] {
  if (!pos) return 'unknown'
  const lower = pos.toLowerCase()
  if (lower.startsWith('verb') || lower === 'v') return 'verb'
  if (lower.startsWith('noun') || lower === 'n') return 'noun'
  if (lower.startsWith('adj')) return 'adjective'
  if (lower.startsWith('adv')) return 'adverb'
  return 'particle'
}

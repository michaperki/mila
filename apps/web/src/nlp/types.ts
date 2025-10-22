export type TokenSpan = {
  text: string
  start: number
  end: number
}

export type Morpheme = {
  form: string
  type: 'prefix' | 'stem' | 'suffix'
  lemma?: string
  gloss?: string
}

export type MorphCandidate = {
  lemma: string
  pos: 'noun' | 'verb' | 'adjective' | 'adverb' | 'particle' | 'unknown'
  binyan?: string
  sense?: string
  confidence: number
  morphemes: Morpheme[]
  source: 'lexicon' | 'heuristic'
}

export type TokenAnalysis = {
  token: string
  start: number
  end: number
  lemma: string
  pos: MorphCandidate['pos']
  binyan?: string
  sense_en?: string
  confidence: number
  morphemes: Morpheme[]
  alternatives?: Array<{
    lemma: string
    pos: MorphCandidate['pos']
    sense_en?: string
    confidence: number
    morphemes: Morpheme[]
  }>
  source: 'local' | 'llm'
}

export type LlmRequest = {
  sentence: string
  tokens: TokenSpan[]
}

export type LlmResponse = TokenAnalysis[]

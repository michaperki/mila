import type { LlmRequest, LlmResponse } from './types'

/**
 * Placeholder LLM disambiguation layer.
 * The real implementation would call a serverless function and return structured JSON.
 */
export async function llmDisambiguate(request: LlmRequest): Promise<LlmResponse> {
  console.warn('LLM disambiguation fallback not implemented; returning empty response.', {
    tokenCount: request.tokens.length,
  })
  return []
}

import { claudeCost, type Feature } from './ai-usage'
import { capturing, note, promptsWanted } from './trace'

type Reply = { model?: string; stop_reason?: string | null; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } }

// A model call as a debug span (lib/trace.ts), recorded at the provider call: why it was made,
// which inputs went into the request (by name: `sent`), how long it took, its tokens and cost. The
// request exactly as sent to the provider (`params`) is kept only in a capture started with exact
// prompts. Outside a capture it only makes the call.
export async function tracedModel<R>(feature: Feature, why: string, sent: string[], params: unknown, call: () => Promise<R>): Promise<R> {
  if (!capturing()) return call()
  const start = Date.now()
  try {
    const result = await call()
    const response = result as unknown as Reply
    const usage = response.usage ?? {}
    note({
      kind: 'ai', name: `Claude · ${feature}`, start, end: Date.now(), source: 'model',
      fields: {
        why, sent, model: response.model, stop: response.stop_reason, inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0, cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        cost: response.model ? claudeCost(response.model, { input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_read_input_tokens: usage.cache_read_input_tokens, cache_creation_input_tokens: usage.cache_creation_input_tokens }) : null,
      },
      ...(promptsWanted() ? { prompt: params } : {}),
    })
    return result
  } catch (error) {
    note({ kind: 'ai', name: `Claude · ${feature}`, start, end: Date.now(), source: 'model', fields: { why, sent, failed: (error as Error).name }, ...(promptsWanted() ? { prompt: params } : {}) })
    throw error
  }
}

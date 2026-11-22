import { noteFailedRequest } from './crashes'
import { type Act, requestSpan } from './trace'
export const API_BASE = (process.env.EXPO_PUBLIC_API_URL || 'https://mila-hebrew.netlify.app').replace(/\/$/, '')
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ApiError' }
}
// `act`: the user action this request is for, so a debug capture links them (lib/trace.ts).
export async function request<T>(path: string, options: { token?: string; body?: unknown; method?: string; signal?: AbortSignal; timeoutMs?: number; act?: Act } = {}): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timeout = setTimeout(abort, options.timeoutMs ?? 20000)
  options.signal?.addEventListener('abort', abort)
  if (options.signal?.aborted) abort()
  const method = options.method || (options.body === undefined ? 'GET' : 'POST')
  // In a debug capture: which fields went, by name only.
  const traced = requestSpan(options.act, path.split('?')[0], method, options.body && typeof options.body === 'object' ? Object.keys(options.body) : [], options.token)
  let status: number | string = 'failed'
  try {
    const response = await fetch(`${API_BASE}/.netlify/functions/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), ...(traced?.headers ?? {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: controller.signal,
    })
    status = response.status
    if (response.status === 204) { traced?.done(204); return undefined as T }
    let data
    // The request ends when its whole reply is in (its size is the reply's text, as a measure).
    let text = ''
    try { text = await response.text(); data = JSON.parse(text) } catch { traced?.done(response.status, text.length); throw new ApiError(`The service returned an unexpected response (${response.status}). Please try again.`, response.status) }
    traced?.done(response.status, text.length)
    if (!response.ok) {
      noteFailedRequest(path, response.status, data?.requestId)
      const reference = data?.requestId ? ` Reference: ${data.code || 'REQUEST_FAILED'} / ${data.requestId}` : ''
      throw new ApiError((data?.message || (response.status === 401 ? 'Please sign in again.' : 'The service is unavailable. Please try again.')) + reference, response.status)
    }
    return data as T
  } catch (error) {
    if (traced && status === 'failed') traced.done(controller.signal.aborted ? 'timed out' : 'failed')
    if (options.signal?.aborted || error instanceof ApiError) throw error
    if (controller.signal.aborted) throw new Error('The service took too long to respond. Please try again.')
    throw new Error('Could not connect. Check your internet connection and try again.')
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }
}

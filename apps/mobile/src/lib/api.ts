export const API_BASE = (process.env.EXPO_PUBLIC_API_URL || 'https://mila-hebrew.netlify.app').replace(/\/$/, '')
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ApiError' }
}
export async function request<T>(path: string, options: { token?: string; body?: unknown; method?: string; signal?: AbortSignal } = {}): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timeout = setTimeout(abort, 20000)
  options.signal?.addEventListener('abort', abort)
  if (options.signal?.aborted) abort()
  try {
    const response = await fetch(`${API_BASE}/.netlify/functions/${path}`, {
      method: options.method || (options.body === undefined ? 'GET' : 'POST'),
      headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: controller.signal,
    })
    if (response.status === 204) return undefined as T
    let data
    try { data = await response.json() } catch { throw new ApiError(`The service returned an unexpected response (${response.status}). Please try again.`, response.status) }
    if (!response.ok) {
      const reference = data?.requestId ? ` Reference: ${data.code || 'REQUEST_FAILED'} / ${data.requestId}` : ''
      throw new ApiError((data?.message || (response.status === 401 ? 'Please sign in again.' : 'The service is unavailable. Please try again.')) + reference, response.status)
    }
    return data as T
  } catch (error) {
    if (options.signal?.aborted || error instanceof ApiError) throw error
    if (controller.signal.aborted) throw new Error('The service took too long to respond. Please try again.')
    throw new Error('Could not connect. Check your internet connection and try again.')
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }
}

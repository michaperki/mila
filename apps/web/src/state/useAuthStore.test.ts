import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './useAuthStore'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  useAuthStore.setState({ user: null, token: null, usage: null, authStatus: 'guest', error: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('authentication responses', () => {
  it('shows a server diagnostic reference without authenticating', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: 'Account storage unavailable.', code: 'DATABASE_UNAVAILABLE', requestId: 'test-reference' }), { status: 503 }))
    await expect(useAuthStore.getState().signIn('person@example.com', 'password')).rejects.toThrow('DATABASE_UNAVAILABLE / test-reference')
    expect(useAuthStore.getState().authStatus).toBe('guest')
    expect(useAuthStore.getState().token).toBeNull()
  })
  it('handles HTML errors without showing a JSON parsing error', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(useAuthStore.getState().signIn('person@example.com', 'password')).rejects.toThrow('unexpected response (HTTP 502)')
  })
  it('explains network failures', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(useAuthStore.getState().signIn('person@example.com', 'password')).rejects.toThrow('Check your connection')
  })
  it('rejects an incomplete successful response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }))
    await expect(useAuthStore.getState().signIn('person@example.com', 'password')).rejects.toThrow('incomplete sign-in response')
    expect(useAuthStore.getState().user).toBeNull()
  })
  it('keeps a successful login when the subsequent usage request fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ token: 'session', user: { id: 'user', email: 'person@example.com', tier: 'free' } })))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await useAuthStore.getState().signIn('person@example.com', 'password')
    expect(useAuthStore.getState().authStatus).toBe('authenticated')
    expect(useAuthStore.getState().token).toBe('session')
  })
})

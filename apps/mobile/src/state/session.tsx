import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { ApiError, request } from '../lib/api'
import { tokenExpiry } from '../lib/token'
import type { Recognition, Session } from '../lib/types'

const KEY = 'mila.session.v1'
const DAY = 24 * 60 * 60 * 1000
const Context = createContext<{
  session: Session | null; ready: boolean; error: string | null;
  authenticate: (mode: 'login' | 'signup', email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  recognition: Recognition | null; setRecognition: (value: Recognition | null) => void;
} | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recognition, setRecognition] = useState<Recognition | null>(null)
  const signOut = useCallback(async () => {
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(KEY)
    setSession(null); setRecognition(null)
  }, [])
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const saved = Platform.OS === 'web' ? null : await SecureStore.getItemAsync(KEY)
        if (saved) {
          let value = JSON.parse(saved) as Session
          if (!value.token || !value.user?.id) throw new Error('Invalid saved session')
          // Each launch trades the saved token for a fresh one, so someone who keeps using Mila
          // stays signed in; an expired token or a deleted account signs out. A token with a day
          // or more left opens the app at once and is traded in the background: the fresh one is
          // kept for the next launch, while this one stays good for the rest of this one.
          // Only while the saved session is still this one: a sign-out or another sign-in meanwhile wins.
          const unchanged = async () => (await SecureStore.getItemAsync(KEY)) === saved
          const refresh = async () => {
            try {
              const fresh = await request<Session>('auth', { token: value.token, body: { mode: 'refresh' } })
              if (fresh.token && fresh.user?.id) {
                if (await unchanged()) await SecureStore.setItemAsync(KEY, JSON.stringify(fresh))
                return fresh
              }
            } catch (failure) {
              if (failure instanceof ApiError && failure.status === 401) {
                if (!(await unchanged())) return value
                await SecureStore.deleteItemAsync(KEY)
                return null
              }
              // A temporary network failure should not erase an existing session.
            }
            return value
          }
          const expires = tokenExpiry(value.token)
          if (expires !== null && expires - Date.now() > DAY) {
            void refresh().then(fresh => { if (!fresh && active) { setSession(null); setRecognition(null) } })
          } else {
            const fresh = await refresh()
            if (!fresh) return
            value = fresh
          }
          if (active) setSession(value)
        }
      } catch {
        if (active) setError('Your saved session could not be restored. Please sign in again.')
      } finally { if (active) setReady(true) }
    })()
    return () => { active = false }
  }, [])
  const authenticate = async (mode: 'login' | 'signup', email: string, password: string) => {
    const value = await request<Session>('auth', { body: { mode, email: email.trim().toLowerCase(), password } })
    if (!value.token || !value.user?.id) throw new Error('The service returned an incomplete session. Please try again.')
    if (Platform.OS !== 'web') await SecureStore.setItemAsync(KEY, JSON.stringify(value))
    setSession(value); setError(null)
  }
  return <Context.Provider value={{ session, ready, error, authenticate, signOut, recognition, setRecognition }}>{children}</Context.Provider>
}
export function useSession() {
  const value = useContext(Context)
  if (!value) throw new Error('SessionProvider is missing')
  return value
}

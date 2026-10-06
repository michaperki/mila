import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { ApiError, request } from '../lib/api'
import type { Recognition, Session } from '../lib/types'

const KEY = 'mila.session.v1'
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
          const value = JSON.parse(saved) as Session
          if (!value.token || !value.user?.id) throw new Error('Invalid saved session')
          try { await request('usage', { token: value.token }) } catch (failure) {
            if (failure instanceof ApiError && failure.status === 401) {
              await SecureStore.deleteItemAsync(KEY)
              return
            }
            // A temporary network failure should not erase an existing session.
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

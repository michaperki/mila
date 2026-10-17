import { useCallback, useState, useSyncExternalStore } from 'react'
import { useFocusEffect } from 'expo-router'
import { request } from '../lib/api'
import type { Session, VocabEntry } from '../lib/types'

// The saved words, loaded once and shared by every screen, so opening Vocabulary, a word or
// practice shows what is already known at once and refreshes it in the background. Changes made
// in the app (a result, a stage marked known, a deletion) are applied here as well as sent.
// Kept per account: another sign-in starts empty.
// `at`: when the words were last loaded, the moment due dates are judged against.
type Store = { owner: string | null; entries: VocabEntry[] | null; at: number }
let store: Store = { owner: null, entries: null, at: 0 }
let loading: { owner: string; promise: Promise<VocabEntry[]> } | null = null
const listeners = new Set<() => void>()
const set = (next: Store) => { store = next; listeners.forEach(listener => listener()) }
const EMPTY: VocabEntry[] = []
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

// The saved words known so far for this account, or null before the first load.
export const cachedVocab = (session: Session) => (store.owner === session.user.id ? store.entries : null)

// Fetches the saved words; calls made while one is on its way share it.
export function loadVocab(session: Session): Promise<VocabEntry[]> {
  const owner = session.user.id
  if (loading?.owner === owner) return loading.promise
  const promise = request<{ vocab?: VocabEntry[] }>('vocab', { token: session.token })
    .then(data => { const entries = data.vocab || []; set({ owner, entries, at: Date.now() }); return entries })
    .finally(() => { if (loading?.promise === promise) loading = null })
  loading = { owner, promise }
  return promise
}

// The cached words for this account if any, otherwise the first load.
export const vocabFor = (session: Session) => Promise.resolve(cachedVocab(session) ?? loadVocab(session))

// Local changes, applied to the cache once the screen has sent them (or optimistically).
const edit = (session: Session, change: (entries: VocabEntry[]) => VocabEntry[]) => {
  const entries = cachedVocab(session)
  if (entries) set({ ...store, entries: change(entries) })
}
export const putEntry = (session: Session, entry: VocabEntry) =>
  edit(session, entries => (entries.some(item => item.id === entry.id) ? entries.map(item => (item.id === entry.id ? entry : item)) : [entry, ...entries]))
export const dropEntry = (session: Session, id: string) => edit(session, entries => entries.filter(item => item.id !== id))
export const clearVocab = (session: Session) => edit(session, () => [])

// The saved words for a screen: what is cached shows at once, and every visit refreshes it.
// `loaded` is false only until the first load for this account finishes (or fails).
export function useVocab(session: Session | null) {
  const snapshot = useSyncExternalStore(subscribe, () => store)
  const entries = session && snapshot.owner === session.user.id ? snapshot.entries : null
  const [loadingNow, setLoadingNow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(() => {
    if (!session) return
    setLoadingNow(true); setError(null)
    void loadVocab(session).catch((failure: Error) => setError(failure.message)).finally(() => setLoadingNow(false))
  }, [session])
  useFocusEffect(refresh)
  return { entries: entries ?? EMPTY, at: snapshot.at, loaded: !!entries || !!error, loading: loadingNow, error, refresh }
}

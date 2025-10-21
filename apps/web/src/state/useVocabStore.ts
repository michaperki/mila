import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { initAppDB } from '../lib/database'
import { safeLocalStorage } from '../lib/storage'
import { StarredItem } from '../types'
import { useReviewStore } from './useReviewStore'
import { useAuthStore } from './useAuthStore'

type VocabState = {
  vocab: StarredItem[]
  isLoading: boolean
  error: string | null
  lastUpdated: number
  getVocab: () => Promise<StarredItem[]>
  starItem: (item: StarredItem) => Promise<void>
  removeItem: (id: string) => Promise<void>
  searchVocab: (query: string) => StarredItem[]
  exportVocab: () => string
  importVocab: (jsonData: string) => Promise<boolean>
  clearVocab: () => Promise<void>
}

const hasRandomUUID = typeof globalThis !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function'
const generateId = () =>
  hasRandomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`

type ApiOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  token?: string | null
  searchParams?: Record<string, string | undefined>
}

const API_BASE = '/.netlify/functions'

const normalizeLemma = (lemma: string) => lemma.replace(/[,،，]+/g, '').trim() || lemma.trim()

const apiFetch = async <T = unknown>(endpoint: string, options: ApiOptions = {}): Promise<T> => {
  const { method = 'GET', body, token, searchParams } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  const url = new URL(`${API_BASE}/${endpoint}`, origin)
  if (searchParams) {
    Object.entries(searchParams)
      .filter(([, value]) => Boolean(value))
      .forEach(([key, value]) => url.searchParams.set(key, value as string))
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (response.status === 204) {
    return null as T
  }

  const text = await response.text()
  const data = text ? (JSON.parse(text) as T & { message?: string }) : ({} as T)

  if (!response.ok) {
    const message = (data as { message?: string }).message || `Request failed (${response.status})`
    throw new Error(message)
  }

  return data
}

const ensureFrequency = (item: StarredItem): StarredItem => ({
  ...item,
  frequency: item.frequency && item.frequency > 0 ? item.frequency : 1,
})

const normalizeRemoteItem = (item: any): StarredItem => ({
  ...item,
  lemma: normalizeLemma(item.lemma),
  createdAt:
    typeof item.createdAt === 'number'
      ? item.createdAt
      : item.createdAt
      ? new Date(item.createdAt).getTime()
      : Date.now(),
  id: item.id ?? item._id ?? generateId(),
  frequency: item.frequency && item.frequency > 0 ? item.frequency : 1,
})

const syncLocalVocab = async (items: StarredItem[]) => {
  const db = await initAppDB()
  const tx = db.transaction('vocab', 'readwrite')
  await tx.store.clear()
  for (const item of items) {
    await tx.store.put(item)
  }
  await tx.done
}

const getLocalVocab = async (): Promise<StarredItem[]> => {
  const db = await initAppDB()
  const items = await db.getAll('vocab')
  return items.map(ensureFrequency).sort((a, b) => b.createdAt - a.createdAt)
}

export const useVocabStore = create<VocabState>()(
  persist(
    (set, get) => ({
      vocab: [],
      isLoading: false,
      error: null,
      lastUpdated: Date.now(),

      getVocab: async () => {
        set({ isLoading: true, error: null })
        const token = useAuthStore.getState().token

        try {
          if (token) {
            const data = await apiFetch<{ vocab: unknown[] }>('vocab', { token })
            const items = (data.vocab || []).map(normalizeRemoteItem).sort((a, b) => b.createdAt - a.createdAt)
            await syncLocalVocab(items)
            set({ vocab: items, isLoading: false, lastUpdated: Date.now() })
            queueForReview(items)
            return items
          }
        } catch (error) {
          console.error('Remote vocab sync failed', error)
          set({ error: (error as Error).message })
        }

        try {
          const local = await getLocalVocab()
          set({ vocab: local, isLoading: false, lastUpdated: Date.now() })
          queueForReview(local)
          return local
        } catch (error) {
          set({ error: (error as Error).message, isLoading: false })
          return []
        }
      },

      starItem: async (item: StarredItem) => {
        const token = useAuthStore.getState().token
        const normalizedItem = ensureFrequency({ ...item, lemma: normalizeLemma(item.lemma) })

        set({ isLoading: true, error: null })

        try {
          if (token) {
            await apiFetch('vocab', { method: 'POST', token, body: { ...normalizedItem, id: normalizedItem.id } })
            await get().getVocab()
            return
          }
        } catch (error) {
          console.error('Failed to sync vocab remotely', error)
          set({ error: (error as Error).message })
        }

        try {
          const db = await initAppDB()
          const vocab = get().vocab
          const existing = vocab.find((entry) => entry.lemma === normalizedItem.lemma)

          if (existing) {
            const updated: StarredItem = {
              ...existing,
              gloss: normalizedItem.gloss,
              root: normalizedItem.root ?? existing.root,
              createdAt: Date.now(),
              frequency: (existing.frequency || 1) + 1,
            }
            await db.put('vocab', updated)
            const updatedList = vocab.map((entry) => (entry.id === existing.id ? updated : entry))
            set({ vocab: updatedList, isLoading: false, lastUpdated: Date.now() })
            queueForReview([updated])
          } else {
            await db.put('vocab', normalizedItem)
            set({
              vocab: [normalizedItem, ...vocab],
              isLoading: false,
              lastUpdated: Date.now(),
            })
            queueForReview([normalizedItem])
          }
        } catch (error) {
          console.error('Error starring item locally:', error)
          set({ error: (error as Error).message, isLoading: false })
        }
      },

      removeItem: async (id: string) => {
        const token = useAuthStore.getState().token
        set({ isLoading: true, error: null })

        try {
          if (token) {
            await apiFetch('vocab', { method: 'DELETE', token, searchParams: { id } })
            await get().getVocab()
            useReviewStore.getState().removeCard(id)
            return
          }
        } catch (error) {
          console.error('Failed to remove vocab remotely', error)
          set({ error: (error as Error).message })
        }

        try {
          const db = await initAppDB()
          await db.delete('vocab', id)
          const vocab = get().vocab.filter((item) => item.id !== id)
          useReviewStore.getState().removeCard(id)
          set({ vocab, isLoading: false, lastUpdated: Date.now(), error: null })
        } catch (error) {
          console.error('Error removing item locally:', error)
          set({ error: (error as Error).message, isLoading: false })
        }
      },

      searchVocab: (query: string) => {
        if (!query || !query.trim()) {
          return get().vocab
        }

        const normalized = query.toLowerCase().trim()
        return get().vocab.filter(
          (item) =>
            item.lemma.toLowerCase().includes(normalized) || item.gloss.toLowerCase().includes(normalized),
        )
      },

      exportVocab: () => {
        const vocab = get().vocab
        return JSON.stringify(
          {
            version: 1,
            timestamp: Date.now(),
            items: vocab,
          },
          null,
          2,
        )
      },

      importVocab: async (jsonData: string) => {
        try {
          set({ isLoading: true, error: null })

          const parsed = JSON.parse(jsonData)
          if (!parsed.items || !Array.isArray(parsed.items)) {
            throw new Error('Invalid vocabulary data format')
          }

          const imported = parsed.items
            .filter((item: any) => item.id && item.lemma && item.gloss)
            .map((item: StarredItem) => ensureFrequency({ ...item, lemma: normalizeLemma(item.lemma) }))

          if (imported.length === 0) {
            throw new Error('No valid vocabulary items found')
          }

          const token = useAuthStore.getState().token

          if (token) {
            await Promise.all(
              imported.map((item: StarredItem) => apiFetch('vocab', { method: 'POST', token, body: { ...item, id: item.id } })),
            )
            await get().getVocab()
          } else {
            const db = await initAppDB()
            const tx = db.transaction('vocab', 'readwrite')
            for (const item of imported) {
              await tx.store.put(item)
            }
            await tx.done
            const vocab = await getLocalVocab()
            set({ vocab, lastUpdated: Date.now() })
          }

          queueForReview(imported)
          set({ isLoading: false, error: null })
          return true
        } catch (error) {
          console.error('Error importing vocab:', error)
          set({ error: (error as Error).message, isLoading: false })
          return false
        }
      },

      clearVocab: async () => {
        try {
          const token = useAuthStore.getState().token
          if (token) {
            // No remote clear endpoint; remove items one by one
            const vocab = get().vocab
            await Promise.all(vocab.map((item) => apiFetch('vocab', { method: 'DELETE', token, searchParams: { id: item.id } })))
          }

          const db = await initAppDB()
          await db.clear('vocab')
          set({ vocab: [], lastUpdated: Date.now() })
        } catch (error) {
          set({ error: (error as Error).message })
        }
      },
    }),
    {
      name: 'mila-vocab-store-v2',
      storage: createJSONStorage(safeLocalStorage),
      partialize: (state) => ({
        vocab: state.vocab,
        lastUpdated: state.lastUpdated,
      }),
    },
  ),
)

const queueForReview = (items: StarredItem[]) => {
  const reviewState = useReviewStore.getState()
  items.forEach((item) => reviewState.queueFromStarred(item))
}

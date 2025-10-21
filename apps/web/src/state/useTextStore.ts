import { create } from 'zustand'
import { TextDoc } from '../types'
import { initAppDB } from '../lib/database'
import { useAuthStore } from './useAuthStore'

type TextState = {
  texts: TextDoc[]
  currentText: TextDoc | null
  isLoading: boolean
  error: string | null
  getTexts: () => Promise<TextDoc[]>
  getTextById: (id: string) => Promise<TextDoc | null>
  saveText: (text: TextDoc) => Promise<void>
  deleteText: (id: string) => Promise<void>
  updateText: (id: string, updates: Partial<TextDoc>) => Promise<void>
  setCurrentText: (text: TextDoc | null) => void
  syncLocalToRemote: () => Promise<void>
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

const normalizeRemoteText = (text: any): TextDoc => ({
  ...text,
  id: text.id ?? text.textId ?? text._id ?? String(text.id || text.textId || generateId()),
  createdAt:
    typeof text.createdAt === 'number'
      ? text.createdAt
      : text.createdAt
      ? new Date(text.createdAt).getTime()
      : Date.now(),
})

const syncLocalTexts = async (texts: TextDoc[]) => {
  const db = await initAppDB()
  const tx = db.transaction('texts', 'readwrite')
  await tx.store.clear()
  for (const text of texts) {
    await tx.store.put(text)
  }
  await tx.done
}

const getLocalTexts = async (): Promise<TextDoc[]> => {
  const db = await initAppDB()
  const raw = await db.getAll('texts')
  return raw.sort((a, b) => b.createdAt - a.createdAt)
}

export const useTextStore = create<TextState>((set, get) => ({
  texts: [],
  currentText: null,
  isLoading: false,
  error: null,

  getTexts: async () => {
    set({ isLoading: true, error: null })
    const token = useAuthStore.getState().token

    try {
      if (token) {
        const data = await apiFetch<{ texts: unknown[] }>('texts', { token })
        const remoteTexts = (data.texts || []).map(normalizeRemoteText).sort((a, b) => b.createdAt - a.createdAt)
        await syncLocalTexts(remoteTexts)
        set({ texts: remoteTexts, isLoading: false })
        return remoteTexts
      }
    } catch (error) {
      console.error('Remote text sync failed', error)
      set({ error: (error as Error).message })
    }

    try {
      const local = await getLocalTexts()
      set({ texts: local, isLoading: false })
      return local
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return []
    }
  },

  getTextById: async (id: string) => {
    const existing = get().texts.find((text) => text.id === id)
    if (existing) {
      set({ currentText: existing })
      return existing
    }

    const texts = await get().getTexts()
    const text = texts.find((candidate) => candidate.id === id) ?? null
    set({ currentText: text })
    return text
  },

  saveText: async (text: TextDoc) => {
    set({ isLoading: true, error: null })
    const token = useAuthStore.getState().token

    try {
      if (token) {
        const payload = {
          ...text,
          textId: text.id,
          createdAt: text.createdAt ?? Date.now(),
        }
        await apiFetch('texts', { method: 'POST', body: payload, token })
        await get().getTexts()
        set({ currentText: { ...text } })
        return
      }
    } catch (error) {
      console.error('Failed to sync text remotely', error)
      set({ error: (error as Error).message })
    }

    try {
      const db = await initAppDB()
      await db.put('texts', text)
      const texts = get().texts
      const existingIndex = texts.findIndex((item) => item.id === text.id)
      if (existingIndex >= 0) {
        const updated = [...texts]
        updated[existingIndex] = text
        set({ texts: updated, currentText: text, isLoading: false })
      } else {
        set({ texts: [text, ...texts], currentText: text, isLoading: false })
      }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  deleteText: async (id: string) => {
    set({ isLoading: true, error: null })
    const token = useAuthStore.getState().token

    try {
      if (token) {
        await apiFetch('texts', { method: 'DELETE', token, searchParams: { textId: id } })
        await get().getTexts()
        const current = get().currentText
        set({
          currentText: current?.id === id ? null : current,
          isLoading: false,
        })
        return
      }
    } catch (error) {
      console.error('Failed to delete text remotely', error)
      set({ error: (error as Error).message })
    }

    try {
      const db = await initAppDB()
      await db.delete('texts', id)
      const texts = get().texts.filter((text) => text.id !== id)
      const currentText = get().currentText
      set({
        texts,
        currentText: currentText?.id === id ? null : currentText,
        isLoading: false,
      })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  updateText: async (id: string, updates: Partial<TextDoc>) => {
    const existing = get().texts.find((text) => text.id === id)
    if (!existing) {
      throw new Error(`Text with id ${id} not found`)
    }

    const updatedText: TextDoc = { ...existing, ...updates }
    await get().saveText(updatedText)
  },

  setCurrentText: (text) => {
    set({ currentText: text })
  },

  syncLocalToRemote: async () => {
    const token = useAuthStore.getState().token
    if (!token) return

    try {
      const localTexts = await getLocalTexts()
      if (localTexts.length === 0) return

      for (const text of localTexts) {
        try {
          await apiFetch('texts', {
            method: 'POST',
            token,
            body: {
              ...text,
              textId: text.id,
              createdAt: text.createdAt,
            },
          })
        } catch (error) {
          console.error('Failed to sync text', text.id, error)
        }
      }

      await get().getTexts()
    } catch (error) {
      console.error('Failed to sync local texts to remote', error)
    }
  },
}))

useAuthStore.subscribe(
  (state) => state.user?.id ?? null,
  (userId, previousUserId) => {
    if (userId && userId !== previousUserId) {
      void useTextStore.getState().syncLocalToRemote()
    }
  },
)

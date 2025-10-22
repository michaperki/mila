import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { safeLocalStorage } from '../lib/storage'

type ProfileState = {
  displayName: string
  setDisplayName: (name: string) => void
  primeDisplayName: (name: string | null) => void
}

const DEFAULT_NAME = 'friend'

const formatName = (raw: string) => {
  const cleaned = raw.trim().replace(/\s+/g, ' ')
  if (!cleaned) return ''
  return cleaned
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      displayName: DEFAULT_NAME,
      setDisplayName: (name) => {
        const formatted = formatName(name)
        set({ displayName: formatted || DEFAULT_NAME })
      },
      primeDisplayName: (name) => {
        if (get().displayName !== DEFAULT_NAME) return
        const formatted = name ? formatName(name) : ''
        if (formatted) {
          set({ displayName: formatted })
        }
      },
    }),
    {
      name: 'profile-store-v1',
      storage: createJSONStorage(safeLocalStorage),
      version: 2,
      migrate: (persistedState: unknown, version) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return { displayName: DEFAULT_NAME }
        }

        if (version < 2) {
          const legacy = persistedState as { displayName?: string }
          const formatted = legacy.displayName ? formatName(legacy.displayName) : ''
          return {
            displayName: formatted || DEFAULT_NAME,
          }
        }

        const state = persistedState as { displayName?: string }
        const formatted = state.displayName ? formatName(state.displayName) : ''
        return {
          displayName: formatted || DEFAULT_NAME,
        }
      },
    },
  ),
)

export const DEFAULT_DISPLAY_NAME = DEFAULT_NAME

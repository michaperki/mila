import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { safeLocalStorage } from '../lib/storage'

type ProfileState = {
  displayName: string
  setDisplayName: (name: string) => void
}

const DEFAULT_NAME = 'Mike'

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      displayName: DEFAULT_NAME,
      setDisplayName: (name) => set({ displayName: name.trim() || DEFAULT_NAME }),
    }),
    {
      name: 'profile-store-v1',
      storage: createJSONStorage(safeLocalStorage),
    },
  ),
)

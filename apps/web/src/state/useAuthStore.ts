import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { safeLocalStorage } from '../lib/storage'

const API_BASE = '/.netlify/functions'
const GUEST_CAPTURE_LIMIT = Number(import.meta.env.VITE_GUEST_CAPTURE_LIMIT ?? 1)
const USE_MOCK_PAYMENTS = import.meta.env.VITE_USE_MOCK_PAYMENTS !== 'false'

type Tier = 'guest' | 'free' | 'premium'

export type AuthUser = {
  id: string
  email: string
  tier: Exclude<Tier, 'guest'>
  createdAt: string
}

type UsageSnapshot = {
  captures: number
  limit: number | null
  periodStart: string
}

export type CaptureAllowanceReason = 'guest-limit' | 'quota-exceeded'

export type CaptureAllowance = {
  allowed: boolean
  tier: Tier
  remaining: number | null
  limit: number | null
  reason?: CaptureAllowanceReason
}

type AuthState = {
  token: string | null
  user: AuthUser | null
  usage: UsageSnapshot | null
  guestCaptures: number
  authStatus: 'guest' | 'authenticating' | 'authenticated'
  isMockPayments: boolean
  error: string | null
  getCaptureAllowance: () => CaptureAllowance
  consumeCapture: () => Promise<CaptureAllowance>
  refreshUsage: () => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
  upgradeTier: () => Promise<void>
  resetUsage: () => Promise<void>
  canSaveProgress: () => boolean
}

type ApiOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  token?: string | null
}

const apiFetch = async <T = unknown>(endpoint: string, options: ApiOptions = {}): Promise<T> => {
  const { method = 'GET', body, token } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}/${endpoint}`, {
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      usage: null,
      guestCaptures: 0,
      authStatus: 'guest',
      isMockPayments: USE_MOCK_PAYMENTS,
      error: null,

      getCaptureAllowance: () => {
        const { user, usage, guestCaptures } = get()

        if (!user) {
          const remaining = Math.max(GUEST_CAPTURE_LIMIT - guestCaptures, 0)
          return {
            allowed: remaining > 0,
            tier: 'guest' as Tier,
            remaining,
            limit: GUEST_CAPTURE_LIMIT,
            reason: remaining > 0 ? undefined : 'guest-limit',
          }
        }

        if (!usage || usage.limit === null) {
          return {
            allowed: true,
            tier: user.tier,
            remaining: null,
            limit: null,
          }
        }

        const remaining = Math.max(usage.limit - usage.captures, 0)
        return {
          allowed: remaining > 0,
          tier: user.tier,
          remaining,
          limit: usage.limit,
          reason: remaining > 0 ? undefined : 'quota-exceeded',
        }
      },

      consumeCapture: async () => {
        const { user, token } = get()

        if (!user) {
          set((state) => ({ guestCaptures: state.guestCaptures + 1 }))
          return get().getCaptureAllowance()
        }

        try {
          const usage = await apiFetch<UsageSnapshot>('usage', { method: 'POST', token })
          set({ usage })
        } catch (error) {
          const message = (error as Error).message || 'Capture limit reached'
          set({ error: message })
        }

        return get().getCaptureAllowance()
      },

      refreshUsage: async () => {
        const { user, token } = get()
        if (!user || !token) return

        try {
          const snapshot = await apiFetch<UsageSnapshot>('usage', { method: 'GET', token })
          set({ usage: snapshot, error: null })
        } catch (error) {
          console.error('Failed to refresh usage', error)
          set({ error: (error as Error).message })
        }
      },

      signUp: async (email, password) => {
        const trimmedEmail = email.trim().toLowerCase()
        if (!trimmedEmail) {
          throw new Error('Email is required')
        }
        if (password.length < 4) {
          throw new Error('Password must be at least 4 characters')
        }

        set({ authStatus: 'authenticating', error: null })

        try {
          const result = await apiFetch<{ token: string; user: AuthUser }>('auth', {
            method: 'POST',
            body: { email: trimmedEmail, password, mode: 'signup' },
          })

          set({
            token: result.token,
            user: { ...result.user, id: result.user.id ?? result.user.email },
            guestCaptures: 0,
            authStatus: 'authenticated',
            error: null,
          })
          await get().refreshUsage()
        } catch (error) {
          set({ authStatus: get().user ? 'authenticated' : 'guest', error: (error as Error).message })
          throw error
        }
      },

      signIn: async (email, password) => {
        const trimmedEmail = email.trim().toLowerCase()
        if (!trimmedEmail) {
          throw new Error('Email is required')
        }

        set({ authStatus: 'authenticating', error: null })

        try {
          const result = await apiFetch<{ token: string; user: AuthUser & { id?: string } }>('auth', {
            method: 'POST',
            body: { email: trimmedEmail, password, mode: 'login' },
          })

          set({
            token: result.token,
            user: { ...result.user, id: result.user.id ?? trimmedEmail },
            guestCaptures: 0,
            authStatus: 'authenticated',
            error: null,
          })
          await get().refreshUsage()
        } catch (error) {
          set({ authStatus: get().user ? 'authenticated' : 'guest', error: (error as Error).message })
          throw error
        }
      },

      signOut: () => {
        set({
          token: null,
          user: null,
          usage: null,
          guestCaptures: 0,
          authStatus: 'guest',
          error: null,
        })
      },

      upgradeTier: async () => {
        const { token, user, isMockPayments } = get()
        if (!token || !user) return

        try {
          await apiFetch('payments', { method: 'POST', token })
          set({ user: { ...user, tier: 'premium' }, error: null })
          await get().refreshUsage()
        } catch (error) {
          if (!isMockPayments) {
            set({ error: (error as Error).message })
            throw error
          }
          console.error('Upgrade failed', error)
        }
      },

      resetUsage: async () => {
        const { token } = get()
        if (!token) return

        try {
          await apiFetch('usage', { method: 'DELETE', token })
          set({ usage: { captures: 0, limit: get().usage?.limit ?? 5, periodStart: new Date().toISOString() } })
        } catch (error) {
          console.error('Failed to reset usage', error)
        }
      },

      canSaveProgress: () => Boolean(get().user && get().token),
    }),
    {
      name: 'mila-auth-store-v2',
      storage: createJSONStorage(safeLocalStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        usage: state.usage,
        guestCaptures: state.guestCaptures,
        isMockPayments: state.isMockPayments,
      }),
    },
  ),
)

export const selectTier = (state: AuthState): Tier => state.user?.tier ?? 'guest'

export const selectCaptureAllowance = (state: AuthState): CaptureAllowance => state.getCaptureAllowance()

export const selectAuthStatus = (state: AuthState) => state.authStatus

export const selectRemainingCapturesLabel = (state: AuthState): string => {
  const allowance = state.getCaptureAllowance()
  if (allowance.limit === null) {
    return 'Unlimited captures'
  }
  const remaining = allowance.remaining ?? 0
  return `${remaining} capture${remaining === 1 ? '' : 's'} left`
}

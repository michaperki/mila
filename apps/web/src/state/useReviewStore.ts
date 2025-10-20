import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { ReviewCard, ReviewRating, StarredItem } from '../types'
import { safeLocalStorage } from '../lib/storage'

type ReviewState = {
  cards: ReviewCard[]
  lastSessionAt?: number
  queueFromStarred: (item: StarredItem) => void
  gradeCard: (cardId: string, rating: ReviewRating, now?: number) => void
  getDueCards: (now?: number) => ReviewCard[]
  upcomingCount: (withinHours?: number, now?: number) => number
  removeCard: (cardId: string) => void
  reset: () => void
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

const defaultCard = (item: StarredItem, timestamp: number): ReviewCard => ({
  id: item.id,
  lemma: item.lemma,
  gloss: item.gloss,
  root: item.sourceRef?.chunkId,
  createdAt: timestamp,
  due: timestamp,
  interval: 0,
  ease: 250,
  streak: 0,
  lapses: 0,
  sourceRef: item.sourceRef,
})

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const scheduleNext = (card: ReviewCard, rating: ReviewRating, now: number): ReviewCard => {
  if (rating === 1) {
    const nextInterval = DAY_IN_MS
    return {
      ...card,
      due: now + nextInterval,
      interval: 1,
      ease: clamp(card.ease - 20, 130, 350),
      streak: 0,
      lapses: card.lapses + 1,
      lastReviewedAt: now,
    }
  }

  const currentInterval = Math.max(card.interval, 1)
  let nextIntervalDays = currentInterval
  let nextEase = card.ease

  if (rating === 2) {
    nextEase = clamp(card.ease - 15, 130, 400)
    nextIntervalDays = Math.max(1, Math.round(currentInterval * 1.2))
  } else if (rating === 3) {
    nextIntervalDays = Math.max(1, Math.round(currentInterval * (card.ease / 100)))
  } else if (rating === 4) {
    nextEase = clamp(card.ease + 15, 130, 450)
    nextIntervalDays = Math.max(1, Math.round(currentInterval * (card.ease / 100) * 1.3))
  }

  return {
    ...card,
    due: now + nextIntervalDays * DAY_IN_MS,
    interval: nextIntervalDays,
    ease: nextEase,
    streak: card.streak + 1,
    lastReviewedAt: now,
  }
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set, get) => ({
      cards: [],
      lastSessionAt: undefined,

      queueFromStarred: (item) => {
        const now = Date.now()
        set((state) => {
          const existing = state.cards.find((card) => card.id === item.id)
          if (existing) {
            if (existing.gloss !== item.gloss || existing.lemma !== item.lemma) {
              return {
                cards: state.cards.map((card) =>
                  card.id === item.id
                    ? {
                        ...card,
                        lemma: item.lemma,
                        gloss: item.gloss,
                        sourceRef: item.sourceRef ?? card.sourceRef,
                      }
                    : card,
                ),
              }
            }
            return state
          }

          return {
            cards: [...state.cards, defaultCard(item, now)],
          }
        })
      },

      gradeCard: (cardId, rating, now = Date.now()) => {
        set((state) => {
          const target = state.cards.find((card) => card.id === cardId)
          if (!target) return state

          const updated = scheduleNext(target, rating, now)
          const cards = state.cards.map((card) => (card.id === cardId ? updated : card))
          return { cards, lastSessionAt: now }
        })
      },

      getDueCards: (now = Date.now()) => {
        return get().cards.filter((card) => card.due <= now)
      },

      upcomingCount: (withinHours = 24, now = Date.now()) => {
        const windowLimit = now + withinHours * 60 * 60 * 1000
        return get().cards.filter((card) => card.due <= windowLimit).length
      },

      removeCard: (cardId) => {
        set((state) => ({
          cards: state.cards.filter((card) => card.id !== cardId),
        }))
      },

      reset: () => set({ cards: [], lastSessionAt: undefined }),
    }),
    {
      name: 'review-store-v1',
      storage: createJSONStorage(safeLocalStorage),
      partialize: (state) => ({
        cards: state.cards,
        lastSessionAt: state.lastSessionAt,
      }),
    },
  ),
)

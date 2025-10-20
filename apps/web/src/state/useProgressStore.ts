import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { safeLocalStorage } from '../lib/storage'

type DailyMinutes = Record<string, number>

type ProgressState = {
  streak: number
  lastReviewDate?: string
  readingMinutes: DailyMinutes
  reviewMinutes: DailyMinutes
  recordReading: (minutes: number, at?: Date) => void
  recordReviewSession: (minutes: number, at?: Date) => void
  getReadingMinutesForRange: (days: number, anchor?: Date) => number
}

const formatDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const diffInDays = (later: Date, earlier: Date) => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  const utcLater = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate())
  const utcEarlier = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate())
  return Math.round((utcLater - utcEarlier) / MS_PER_DAY)
}

const addMinutes = (collection: DailyMinutes, key: string, minutes: number): DailyMinutes => ({
  ...collection,
  [key]: (collection[key] || 0) + minutes,
})

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      streak: 0,
      lastReviewDate: undefined,
      readingMinutes: {},
      reviewMinutes: {},

      recordReading: (minutes, at = new Date()) => {
        const key = formatDateKey(at)
        set((state) => ({
          readingMinutes: addMinutes(state.readingMinutes, key, minutes),
        }))
      },

      recordReviewSession: (minutes, at = new Date()) => {
        const key = formatDateKey(at)
        const lastDateKey = get().lastReviewDate
        let nextStreak = 1

        if (lastDateKey) {
          const lastDate = new Date(lastDateKey)
          const diff = diffInDays(at, lastDate)

          if (diff === 0) {
            nextStreak = get().streak
          } else if (diff === 1) {
            nextStreak = get().streak + 1
          }
        }

        set((state) => ({
          streak: nextStreak,
          lastReviewDate: key,
          reviewMinutes: addMinutes(state.reviewMinutes, key, minutes),
        }))
      },

      getReadingMinutesForRange: (days, anchor = new Date()) => {
        const keys = []
        for (let i = 0; i < days; i++) {
          const date = new Date(anchor)
          date.setDate(anchor.getDate() - i)
          keys.push(formatDateKey(date))
        }

        return keys.reduce((total, key) => total + (get().readingMinutes[key] || 0), 0)
      },
    }),
    {
      name: 'progress-store-v1',
      storage: createJSONStorage(safeLocalStorage),
    },
  ),
)

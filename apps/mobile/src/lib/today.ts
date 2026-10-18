import { dayOf, unlockedStages } from './forms.ts'
import type { VocabEntry } from './types'

// The Today screen's pieces, kept here so they can be tested: which days of the week were
// studied, which stages have just opened, how long the due cards take, and where reading stopped.

// The days a learner studied: kept on this phone as each card is graded (`noteStudyDay`, from
// practice), joined with what the saved words remember (each card's last review and the days it
// was answered Got it), so the dots aren't empty on a new phone.
export function studiedDays(entries: VocabEntry[], recorded: string[]): Set<string> {
  const days = new Set(recorded)
  for (const entry of entries) {
    if (entry.review?.last) days.add(dayOf(entry.review.last))
    for (const form of entry.forms || []) {
      if (form.review?.last) days.add(dayOf(form.review.last))
      form.goodDays?.forEach(day => days.add(day))
    }
  }
  return days
}

// The last seven days, oldest first, for the streak dots: a gentle record, not a counter to lose.
export type Dot = { day: string; letter: string; studied: boolean; today: boolean }
export function weekDots(days: Set<string>, now = Date.now()): Dot[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now); date.setDate(date.getDate() - (6 - i))
    const day = dayOf(date.getTime())
    return { day, letter: 'SMTWTFS'[date.getDay()], studied: days.has(day), today: i === 6 }
  })
}

// Stages opened by progress (not the ones a word starts with) and not studied yet: "לפתוח: past
// tense". A stage marked known is left out.
export type Ready = { entry: VocabEntry; label: string }
export function readyStages(entries: VocabEntry[], limit = 3): Ready[] {
  const ready: Ready[] = []
  for (const entry of entries) {
    const initial = new Set(unlockedStages({ ...entry, forms: [], known: [] }).map(stage => stage.key))
    for (const stage of unlockedStages(entry)) {
      if (initial.has(stage.key) || entry.known?.includes(stage.key)) continue
      if ((entry.forms || []).some(form => form.stage === stage.key && form.review)) continue
      ready.push({ entry, label: stage.label })
    }
  }
  return ready.slice(0, limit)
}

// About how long the due cards take, at roughly ten seconds a card.
export const minutesFor = (cards: number) => Math.max(1, Math.round((cards * 10) / 60))

// Where reading stopped: the saved passage and the sentence last selected in it.
export type LastRead = { id: string; segment: number; title: string; at: number }
export function parseLastRead(value: string): LastRead | null {
  try {
    const read = JSON.parse(value) as Partial<LastRead>
    return typeof read.id === 'string' && typeof read.segment === 'number' && typeof read.title === 'string' && typeof read.at === 'number' ? read as LastRead : null
  } catch { return null }
}

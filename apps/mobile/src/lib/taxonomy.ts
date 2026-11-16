import type { VocabEntry } from './types'

// How saved words are organised (VOCAB-2): the themes, registers and levels the server defines
// (functions/lib/taxonomy.ts, whose ids these must match; tests/taxonomy.test.ts checks), with
// the names the phone shows. Organisation describes a word; it never decides by itself what is
// studied or when. Decisions that use it (which words come in next, STUDY-3) read it through
// these functions, as one signal among frequency, reading and what is known.
export const CATEGORY_LABELS = {
  people: 'People', body: 'Body and health', feelings: 'Feelings', character: 'Character', mind: 'Mind',
  senses: 'Seeing and light', speech: 'Speech and sounds', movement: 'Movement', doing: 'Doing',
  appearance: 'Clothes and looks', home: 'Home', town: 'Town and work', nature: 'Nature', place: 'Place',
  time: 'Time', magic: 'Magic and stories', grammar: 'Grammar',
} as const
export type Category = keyof typeof CATEGORY_LABELS
export const LEVELS = ['core', 'common', 'uncommon', 'rare'] as const
export type Level = typeof LEVELS[number]
export const LEVEL_LABELS: Record<Level, string> = { core: 'core word', common: 'common', uncommon: 'less common', rare: 'rare' }
export const REGISTERS = ['everyday', 'formal', 'literary', 'informal', 'technical'] as const

// Its themes, the main one first, only those this version of the phone knows.
export const themesOf = (entry: Pick<VocabEntry, 'categories'>) =>
  (entry.categories || []).filter((item): item is Category => item in CATEGORY_LABELS)

// How common it is: from its frequency rank where it has one, as the server works it out, or the
// level an import gave a word frequency can't place.
export function levelOf(entry: Pick<VocabEntry, 'rank' | 'level'>): Level | undefined {
  const { rank } = entry
  if (rank) return rank <= 1000 ? 'core' : rank <= 3000 ? 'common' : rank <= 10000 ? 'uncommon' : 'rare'
  return LEVELS.find(level => level === entry.level)
}

// The themes the words have, the most words first, with how many each has; `unsorted` counts the
// words not organised yet.
export function themeCounts(entries: Pick<VocabEntry, 'categories' | 'taxonomy'>[]) {
  const counts = new Map<Category, number>()
  let unsorted = 0
  for (const entry of entries) {
    const themes = themesOf(entry)
    if (!themes.length && !entry.taxonomy) unsorted++
    for (const theme of themes) counts.set(theme, (counts.get(theme) || 0) + 1)
  }
  const themes = [...counts].sort((a, b) => b[1] - a[1]).map(([theme, count]) => ({ theme, count }))
  return { themes, unsorted }
}

// Whether a word is in a theme ('unsorted': not organised yet).
export const inTheme = (entry: Pick<VocabEntry, 'categories' | 'taxonomy'>, theme: Category | 'unsorted') =>
  (theme === 'unsorted' ? !themesOf(entry).length && !entry.taxonomy : themesOf(entry).includes(theme))

// What the word page says of it: its themes, register and level.
export const organisationLine = (entry: Pick<VocabEntry, 'categories' | 'register' | 'rank' | 'level'>) => {
  const level = levelOf(entry)
  return [...themesOf(entry).map(theme => CATEGORY_LABELS[theme]), entry.register, level && LEVEL_LABELS[level]].filter(Boolean).join(' · ')
}

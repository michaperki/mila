import type { Card } from './forms.ts'
import type { Results, VocabEntry } from './types'

// The round being studied, kept on the phone so Study opens where it was left (the same card,
// turned over or not, with the round's order and answers) until the round is finished, Done is
// tapped or a new round is started (lib/saved-round.ts keeps it; practice.tsx saves it). Only
// the round in front of the learner is kept, its positions counted from its first card. Cards
// are kept by reference and rebuilt from the saved words, so a card follows its word's latest
// copy, and a card whose word or form has since gone is left out.

export type CardRef = { id: string; form?: string; checkpoint?: string; why?: string; sequence?: boolean }
// `answers` and `before` by position in `cards` (as in practice.tsx).
export type SavedRound = {
  owner: string; savedAt: number; cards: CardRef[]; position: number; flipped: boolean
  answers: Record<number, boolean>; before: Record<number, Results>
}
export type Resumed = { deck: Card[]; position: number; flipped: boolean; answers: Record<number, boolean>; before: Record<number, Results> }

const refOf = ({ entry, form, checkpoint, why, sequence }: Card): CardRef => ({
  id: entry.id, ...(checkpoint ? { checkpoint } : form ? { form: form.key } : {}), ...(why ? { why } : {}), ...(sequence ? { sequence } : {}),
})

// What to keep of the deck from `roundStart` (earlier rounds can't be gone back to).
export function roundToSave(owner: string, deck: Card[], roundStart: number, position: number, flipped: boolean,
  answers: Record<number, boolean>, before: Record<number, Results>, now = Date.now()): SavedRound {
  const shifted = <T>(byPosition: Record<number, T>) => Object.fromEntries(Object.entries(byPosition)
    .filter(([at]) => Number(at) >= roundStart).map(([at, value]) => [Number(at) - roundStart, value])) as Record<number, T>
  return { owner, savedAt: now, cards: deck.slice(roundStart).map(refOf), position: position - roundStart, flipped, answers: shifted(answers), before: shifted(before) }
}

// The saved round rebuilt from the saved words, on the card it was left on (or the next one
// still there, on its question side); null if nothing of it is left to study.
export function resumeRound(saved: SavedRound | null, entries: VocabEntry[]): Resumed | null {
  if (!saved?.cards?.length) return null
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const deck: Card[] = []
  // Each saved position's place in the rebuilt deck, if its card is still there.
  const moved = new Map<number, number>()
  saved.cards.forEach((ref, at) => {
    const entry = byId.get(ref.id)
    if (!entry) return
    const form = ref.form ? entry.forms?.find(item => item.key === ref.form) : null
    if (ref.form && !form) return
    moved.set(at, deck.length)
    deck.push({ entry, form: form ?? null, ...(ref.checkpoint ? { checkpoint: ref.checkpoint } : {}), ...(ref.why ? { why: ref.why } : {}), ...(ref.sequence ? { sequence: true } : {}) })
  })
  const from = [...moved.keys()].find(at => at >= saved.position)
  if (from === undefined) return null
  const remap = <T>(byPosition: Record<number, T>) => Object.fromEntries(Object.entries(byPosition ?? {})
    .filter(([at]) => moved.has(Number(at))).map(([at, value]) => [moved.get(Number(at))!, value])) as Record<number, T>
  return { deck, position: moved.get(from)!, flipped: from === saved.position && !!saved.flipped, answers: remap(saved.answers), before: remap(saved.before) }
}

// Where a saved round is, for Home ("card 12 of 30").
export const roundProgress = (saved: SavedRound | null) => (saved?.cards?.length ? { at: Math.min(saved.position, saved.cards.length - 1) + 1, of: saved.cards.length } : null)

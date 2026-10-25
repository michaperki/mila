import { useSyncExternalStore } from 'react'
import { getPref, setPref } from '../lib/prefs'

// Hebrew in print (כתב דפוס) or cursive (כתב יד), one setting for every screen: the reader,
// word explanations, flashcards, a word's page and the word list. Only how the letters are drawn
// changes, never the text. Cursive is written without vowels, so it hides them (state/vowels.ts).
// The cursive is Gveret Levin by AlefAlefAlef (assets/fonts, SIL Open Font License), loaded in
// app/_layout.tsx; until it has loaded, Hebrew is drawn in print.
export const CURSIVE_FONT = 'GveretLevin'
// The font has one weight, so bold Hebrew isn't asked for (it would fall back to print).
const CURSIVE = { fontFamily: CURSIVE_FONT, fontWeight: 'normal' } as const

let cursive = false
const listeners = new Set<() => void>()
const tell = () => listeners.forEach(listener => listener())
void getPref('cursive').then(value => { cursive = value; tell() })
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export function useCursive(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, () => cursive)
  return [on, (value: boolean) => { cursive = value; setPref('cursive', value); tell() }]
}
// The style Hebrew text adds to its own: the cursive font when it is chosen, else nothing.
export const useHebrew = () => (useCursive()[0] ? CURSIVE : undefined)

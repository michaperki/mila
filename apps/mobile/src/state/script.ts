import { createContext, useContext, useSyncExternalStore } from 'react'
import { getPref, setPref } from '../lib/prefs'

// Hebrew in print (כתב דפוס) or cursive (כתב יד), chosen separately for reading and for the
// answers of flashcards: Hebrew is read in print, but answers written down in a notebook are
// checked against cursive. The reader's choice (a button in its toolbar, and Account) also holds
// for word explanations, a word's page, the word list, tables and roots; a card's question side
// is always in print, and its answer side follows the answers' choice (a chip in Study, and
// Account), cursive unless changed. Only how the letters are drawn changes, never the text.
// Cursive is written without vowels, so it hides them (state/vowels.ts).
// The cursive is Gveret Levin by AlefAlefAlef (assets/fonts, SIL Open Font License), loaded in
// app/_layout.tsx; until it has loaded, Hebrew is drawn in print.
export const CURSIVE_FONT = 'GveretLevin'
// The font has one weight, so bold Hebrew isn't asked for (it would fall back to print).
const CURSIVE = { fontFamily: CURSIVE_FONT, fontWeight: 'normal' } as const

// Which choice Hebrew follows: the reader's, the answers', or always print (a card's question side).
export type Script = 'reader' | 'answers'
export const ScriptContext = createContext<Script | 'print'>('reader')

function store(pref: 'readerCursive' | 'answerCursive', initial: boolean) {
  let on = initial
  const listeners = new Set<() => void>()
  const tell = () => listeners.forEach(listener => listener())
  void getPref(pref).then(value => { on = value; tell() })
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    get: () => on,
    set: (value: boolean) => { on = value; setPref(pref, value); tell() },
  }
}
const stores: Record<Script, ReturnType<typeof store>> = { reader: store('readerCursive', false), answers: store('answerCursive', true) }

export function useCursive(where: Script = 'reader'): [boolean, (on: boolean) => void] {
  const chosen = stores[where]
  return [useSyncExternalStore(chosen.subscribe, chosen.get), chosen.set]
}
// Whether the Hebrew here (by ScriptContext) is drawn in cursive.
export function useCursiveHere() {
  const where = useContext(ScriptContext)
  const reader = useCursive('reader')[0], answers = useCursive('answers')[0]
  return where === 'print' ? false : where === 'reader' ? reader : answers
}
// The style Hebrew text adds to its own: the cursive font when it is chosen here, else nothing.
export const useHebrew = () => (useCursiveHere() ? CURSIVE : undefined)

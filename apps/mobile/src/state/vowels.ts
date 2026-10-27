import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { getPref, setPref } from '../lib/prefs'
import { useCursiveHere } from './script'

// The vowels setting, re-read whenever a screen comes into view so a change made in Account
// or the reader shows everywhere. Cursive Hebrew is written without vowels (state/script.ts),
// so where it is drawn in cursive they are hidden, and the setting comes back with print. The
// third value is the setting itself, for a screen with both (Study: print questions, cursive answers).
export function useVowels(): [boolean, (show: boolean) => void, boolean] {
  const [show, setShow] = useState(true)
  const cursive = useCursiveHere()
  useFocusEffect(useCallback(() => { void getPref('showNiqqud').then(setShow) }, []))
  const change = useCallback((value: boolean) => { setPref('showNiqqud', value); setShow(value) }, [])
  return [show && !cursive, change, show]
}

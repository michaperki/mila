import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { getPref, setPref } from '../lib/prefs'
import { useCursive } from './script'

// The vowels setting, re-read whenever a screen comes into view so a change made in Account
// or the reader shows everywhere. Cursive Hebrew is written without vowels (state/script.ts),
// so while it is chosen they are hidden, and the setting comes back when print is.
export function useVowels(): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState(true)
  const [cursive] = useCursive()
  useFocusEffect(useCallback(() => { void getPref('showNiqqud').then(setShow) }, []))
  const change = useCallback((value: boolean) => { setPref('showNiqqud', value); setShow(value) }, [])
  return [show && !cursive, change]
}

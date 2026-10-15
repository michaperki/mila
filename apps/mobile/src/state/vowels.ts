import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { getPref, setPref } from '../lib/prefs'

// The vowels setting, re-read whenever a screen comes into view so a change made in Account
// or the reader shows everywhere.
export function useVowels(): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState(true)
  useFocusEffect(useCallback(() => { void getPref('showNiqqud').then(setShow) }, []))
  const change = useCallback((value: boolean) => { setPref('showNiqqud', value); setShow(value) }, [])
  return [show, change]
}

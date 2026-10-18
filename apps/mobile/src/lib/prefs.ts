import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import type { Include, Order } from './forms'
// Small per-device UI choices (live preview, English, vowels, sounds, haptics, voice, speed, studying). Failures fall back to defaults.
// English in the reader: only the sentence you tapped ('tap'), every sentence ('all'), or none.
export type EnglishMode = 'tap' | 'all' | 'off'
// voice: the read-aloud voice (lib/speech.ts); speechRate: '1', '0.5' or '0.25'.
// textSize: the reader's text scale, one of TEXT_SIZES. readerHint: the reader's one line of
// help, shown until the learner has selected a sentence once.
// Studying (practice.tsx): which side a card shows first, the order, which cards, and quiz mode.
export type Front = 'he' | 'en' | 'mixed'
export const TEXT_SIZES = [0.85, 1, 1.15, 1.3, 1.5]
type Prefs = {
  livePreview: boolean; english: EnglishMode; showNiqqud: boolean; sounds: boolean; haptics: boolean; voice: 'sarah' | 'charon'; speechRate: string; textSize: string; readerHint: boolean
  studyFront: Front; studyOrder: Order; studyCards: Include; studyQuiz: boolean
}
const defaults: Prefs = {
  livePreview: false, english: 'tap', showNiqqud: true, sounds: true, haptics: true, voice: 'sarah', speechRate: '1', textSize: '1', readerHint: true,
  studyFront: 'he', studyOrder: 'smart', studyCards: 'both', studyQuiz: false,
}
const key = (name: keyof Prefs) => `mila.pref.${name}`
export async function getPref<K extends keyof Prefs>(name: K): Promise<Prefs[K]> {
  if (Platform.OS === 'web') return defaults[name]
  try {
    const saved = await SecureStore.getItemAsync(key(name))
    if (saved === null) return defaults[name]
    return (typeof defaults[name] === 'boolean' ? saved === 'true' : saved) as Prefs[K]
  } catch { return defaults[name] }
}
export function setPref<K extends keyof Prefs>(name: K, value: Prefs[K]) {
  if (Platform.OS !== 'web') void SecureStore.setItemAsync(key(name), String(value)).catch(() => {})
}

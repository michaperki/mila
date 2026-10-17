import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
// Small per-device UI choices (live preview, English, vowels, sounds, haptics, voice, speed). Failures fall back to defaults.
// English in the reader: only the sentence you tapped ('tap'), every sentence ('all'), or none.
export type EnglishMode = 'tap' | 'all' | 'off'
// voice: the read-aloud voice (lib/speech.ts); speechRate: '1', '0.5' or '0.25'.
type Prefs = { livePreview: boolean; english: EnglishMode; showNiqqud: boolean; sounds: boolean; haptics: boolean; voice: 'sarah' | 'charon'; speechRate: string }
const defaults: Prefs = { livePreview: false, english: 'tap', showNiqqud: true, sounds: true, haptics: true, voice: 'sarah', speechRate: '1' }
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

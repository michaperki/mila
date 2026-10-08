import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
// Small per-device UI choices (live preview on/off, show English). Failures fall back to defaults.
type Prefs = { livePreview: boolean; showEnglish: boolean; showNiqqud: boolean }
const defaults: Prefs = { livePreview: false, showEnglish: true, showNiqqud: true }
const key = (name: keyof Prefs) => `mila.pref.${name}`
export async function getPref<K extends keyof Prefs>(name: K): Promise<Prefs[K]> {
  if (Platform.OS === 'web') return defaults[name]
  try { const saved = await SecureStore.getItemAsync(key(name)); return saved === null ? defaults[name] : saved === 'true' } catch { return defaults[name] }
}
export function setPref<K extends keyof Prefs>(name: K, value: Prefs[K]) {
  if (Platform.OS !== 'web') void SecureStore.setItemAsync(key(name), String(value)).catch(() => {})
}

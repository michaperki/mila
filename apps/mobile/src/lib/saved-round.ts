import { Platform } from 'react-native'
import { File, Paths } from 'expo-file-system'
import type { SavedRound } from './rounds'

// The round being studied, in a file on the phone (lib/rounds.ts): one round, whoever is signed
// in; another account's round is not theirs to resume. Failures are quiet: the next round is
// simply a new one.
const file = new File(Paths.document, 'study-round.json')

export function loadRound(owner: string): SavedRound | null {
  if (Platform.OS === 'web') return null
  try {
    if (!file.exists) return null
    const saved = JSON.parse(file.textSync()) as SavedRound
    return saved.owner === owner ? saved : null
  } catch { return null }
}
export function saveRound(round: SavedRound) {
  if (Platform.OS === 'web') return
  try { file.write(JSON.stringify(round)) } catch { /* kept for this visit only */ }
}
export function clearRound() {
  if (Platform.OS === 'web') return
  try { if (file.exists) file.delete() } catch { /* already gone */ }
}

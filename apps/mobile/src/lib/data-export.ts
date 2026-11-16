import { Share } from 'react-native'
import { File, Paths } from 'expo-file-system'
import { request } from './api'
import { loadRound } from './saved-round'
import { waitingResults } from './results'
import { waitingEvents } from './study-log'
import type { Session } from './types'

// Your data out of Mila (DATA-1, Account → Saved words), through the share sheet: to Files, Mail,
// or straight into ChatGPT or Claude. The server makes it (functions/data.ts); the phone adds
// what hasn't reached the server yet. Nothing here calls an AI.
export type TaskName = 'classify-v1' | 'normalize-v1'
type TaskExport = { title: string; instructions: string; rows: unknown[]; waiting?: number; taxonomy?: unknown }

const day = () => new Date().toISOString().slice(0, 10)
async function share(name: string, text: string, title: string) {
  const file = new File(Paths.cache, name)
  file.write(text)
  await Share.share({ url: file.uri, title })
}

// Everything kept for the account, as stored, with this phone's unsent answers and events and the
// round in progress: a backup to keep, and what an analysis would start from.
export async function shareBackup(session: Session) {
  const backup = await request<Record<string, unknown>>('data?export=backup', { token: session.token, timeoutMs: 60000 })
  const owner = session.user.id
  const phone = { unsentResults: waitingResults(owner), unsentEvents: waitingEvents(owner), round: loadRound(owner) }
  await share(`mila-backup-${day()}.json`, JSON.stringify({ ...backup, phone }), 'Mila backup')
}

// The words a task works on, with its instructions first: one file to give an AI, whose answer
// comes back through Import changes. A long list goes a file at a time (the server says how many
// wait in all); the next file has the words still waiting once an answer is imported. Returns how
// many went, and how many wait.
export async function shareTask(session: Session, task: TaskName) {
  const found = await request<TaskExport>(`data?export=${task}`, { token: session.token, timeoutMs: 60000 })
  const waiting = found.waiting ?? found.rows.length
  if (!found.rows.length) return { sent: 0, waiting }
  const text = `${found.instructions}\n\nThe words (JSON):\n${JSON.stringify(found.rows, null, 1)}\n`
  await share(`mila-${task}-${day()}.txt`, text, found.title)
  return { sent: found.rows.length, waiting }
}

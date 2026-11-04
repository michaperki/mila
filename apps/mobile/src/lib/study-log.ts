import { Platform } from 'react-native'
import { File, Paths } from 'expo-file-system'
import { request } from './api'

// What happens in Study, kept as events: a session starting, every card shown, turned over and
// answered (with which side came first, whether the answer was primed, and what of the word had
// been shown before), and a round ending. They are for looking back at what Study chose, how
// often things came round and what was remembered (apps/web/scripts/study-events.mjs), and are
// sent to apps/web/netlify/functions/study-events.ts. Until the server has them they wait in a
// file on the phone, so a lost connection or a closed app loses nothing; each has its own id, so
// one sent twice is kept once. Each is kept with whose it is, and only sent as that account.
export type StudyEventType = 'start' | 'show' | 'reveal' | 'answer' | 'end'
export type StudyEvent = { id: string; session: string; seq: number; at: number; type: StudyEventType; owner: string } & Record<string, unknown>

const file = new File(Paths.document, 'study-events.json')
const LIMIT = 5000
let queue: StudyEvent[] | null = null
const pending = () => {
  if (queue) return queue
  queue = []
  if (Platform.OS === 'web') return queue
  try { if (file.exists) queue = JSON.parse(file.textSync()) as StudyEvent[] } catch { /* a damaged file starts over */ }
  return queue
}
const keep = () => {
  if (Platform.OS === 'web') return
  try { file.write(JSON.stringify(queue)) } catch { /* kept for this visit only */ }
}

// One study session's log: events are numbered in order, and `id` ties them together.
export function studySession(owner: string) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  let seq = 0
  return {
    id,
    log(type: StudyEventType, fields: Record<string, unknown> = {}) {
      const events = pending()
      events.push({ ...fields, id: `${id}:${seq}`, session: id, seq: seq++, at: Date.now(), type, owner })
      if (events.length > LIMIT) events.splice(0, events.length - LIMIT)
      keep()
    },
  }
}

// Sends what is waiting for this account, a batch at a time; whatever fails waits for next time.
let sending: Promise<void> | null = null
export function sendStudyLog(owner: string, token: string): Promise<void> {
  sending ??= drain(owner, token).finally(() => { sending = null })
  return sending
}
async function drain(owner: string, token: string) {
  try {
    for (;;) {
      const batch = pending().filter(event => event.owner === owner).slice(0, 200)
      if (!batch.length) return
      await request('study-events', { token, body: { events: batch.map(({ owner: _owner, ...event }) => event) } })
      const sent = new Set(batch.map(event => event.id))
      queue = pending().filter(event => !sent.has(event.id))
      keep()
    }
  } catch { /* offline or refused: sent next time */ }
}

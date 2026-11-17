import { AppState, Platform } from 'react-native'
import { File, Paths } from 'expo-file-system'
import { request } from './api'

// What happens in Study, kept as events: a session starting, every card shown, turned over and
// answered (with which side came first, whether the answer was primed, and what of the word had
// been shown before), and a round ending. Reading is kept the same way: a passage opened, each
// sentence selected (and whether its English showed), and in both, each word looked up (where,
// and whether it was saved already), its explanation arriving, and saves made or undone. They
// are observations, not conclusions: a word looked up on a card that was then missed may or may
// not be why it was missed. They are for looking back at what Study chose, how
// often things came round and what was remembered (apps/web/scripts/study-events.mjs), and are
// sent to apps/web/netlify/functions/study-events.ts. Until the server has them they wait in a
// file on the phone, so a lost connection or a closed app loses nothing; each has its own id, so
// one sent twice is kept once. Each is kept with whose it is, and only sent as that account.
// Also kept, since 2026-11-17, for Learning Insights: the app going to the background and coming
// back (`app`), how far a passage was scrolled (`view`), a lookup's drawer closing (`closed`) and
// a word held on a card shown in English (`hold`). Waiting events are sent while the app is in use
// too (every SEND_EVERY events or SEND_AFTER), not only when it is left.
export type StudyEventType = 'start' | 'show' | 'reveal' | 'answer' | 'end' | 'read' | 'select' | 'lookup' | 'explained' | 'save' | 'unsave' | 'app' | 'view' | 'closed' | 'hold'
export type LogEvent = (type: StudyEventType, fields?: Record<string, unknown>) => string
export type StudyEvent = { id: string; session: string; seq: number; at: number; type: StudyEventType; owner: string } & Record<string, unknown>

const file = new File(Paths.document, 'study-events.json')
const LIMIT = 5000
const SEND_EVERY = 20
const SEND_AFTER = 60_000
// Whose events go out while the app is in use, and when they last did (sendStudyLogInBackground).
let sender: { owner: string; token: string } | null = null
let lastSent = 0
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

// One study or reading session's log: events are numbered in order, and `id` ties them together.
// `log` returns the event's id, so a later event can say which one it follows from.
export function studySession(owner: string) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  let seq = 0
  return {
    id,
    log: ((type, fields = {}) => {
      const events = pending()
      const event = `${id}:${seq}`
      events.push({ ...fields, id: event, session: id, seq: seq++, at: Date.now(), type, owner })
      if (events.length > LIMIT) events.splice(0, events.length - LIMIT)
      keep()
      // Not more than once in a few seconds, so a phone offline doesn't try at every event.
      const since = Date.now() - lastSent
      if (sender?.owner === owner && ((events.length >= SEND_EVERY && since > 5000) || since > SEND_AFTER)) void sendStudyLog(owner, sender.token)
      return event
    }) as LogEvent,
  }
}

// This account's events not yet on the server (for a backup, lib/data-export.ts).
export const waitingEvents = (owner: string) => pending().filter(event => event.owner === owner)

// Sends what is waiting for this account, a batch at a time; whatever fails waits for next time.
let sending: Promise<void> | null = null
export function sendStudyLog(owner: string, token: string): Promise<void> {
  lastSent = Date.now()
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

// Notes the app leaving the foreground and coming back (so time away isn't taken for time spent),
// sends what is waiting each time it leaves, and while it is in use; returns the way to stop.
export function sendStudyLogInBackground(owner: string, token: string) {
  sender = { owner, token }
  const app = studySession(owner)
  let was = AppState.currentState
  const subscription = AppState.addEventListener('change', state => {
    const active = state === 'active'
    if (active === (was === 'active')) { was = state; return }
    was = state
    app.log('app', { state: active ? 'active' : 'background' })
    if (!active) void sendStudyLog(owner, token)
  })
  return () => { subscription.remove(); if (sender?.owner === owner) sender = null }
}

// A short fingerprint of a text (FNV-1a, base 36): which sentence a card showed, without its words.
export function fingerprint(text: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0
  return hash.toString(36)
}

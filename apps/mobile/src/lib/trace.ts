import { File, Paths } from 'expo-file-system'
import { AppState, Platform } from 'react-native'

// Debug capture, phone side (2026-11-22), for the developers (Account → Debug capture): while a
// capture is on, what Mila does is recorded as spans and sent to the server (debug-trace), to be
// read on a laptop (/debug.html): the screen's state each time it changes (`state`), each thing
// the learner did (`action`), each request to the server (`net`, with the action that caused it),
// and work done on the phone instead of a request (`phone`: an explanation from memory, a card's
// own data, an answer scored), each saying where its result came from. The functions add their
// side (apps/web/netlify/functions/lib/trace.ts). With no capture on, everything here is a no-op.
//
// An action is passed explicitly to the work it starts (`Act`), through every await, so rapid taps
// and prefetches each stay linked to their own action; a prefetch is an action of its own with the
// action that set it off as `parent`. Spans are metadata: names, timings, sources, field names and
// sizes. The screen states carry the sentence or card on screen, which is the learner's own.

export type Act = { id: string; name: string }
type Span = {
  kind: 'state' | 'action' | 'phone' | 'net'; name: string; start: number; end?: number
  action?: string | null; parent?: string | null; source?: string; request?: string; fields?: Record<string, unknown>; state?: Record<string, unknown>
}
type Capture = { id: string; prompts: boolean; startedAt: number }

const BASE = (process.env.EXPO_PUBLIC_API_URL || 'https://mila-hebrew.netlify.app').replace(/\/$/, '')
const file = new File(Paths.document, 'debug-capture.json')
let capture: Capture | null = null
let token: string | null = null
let buffer: Span[] = []
let sent = 0
let counter = 0
const listeners = new Set<() => void>()
const changed = () => listeners.forEach(listener => listener())
const now = () => Date.now()
const newId = () => `${now().toString(36)}-${(counter++).toString(36)}`

// A capture left on survives a restart of the app.
try { if (Platform.OS !== 'web' && file.exists) capture = JSON.parse(file.textSync()) as Capture } catch { capture = null }
const keep = () => { if (Platform.OS === 'web') return; try { if (capture) file.write(JSON.stringify(capture)); else if (file.exists) file.delete() } catch { /* this visit only */ } }

export const captureNow = () => (capture ? { ...capture, sent, waiting: buffer.length } : null)
export const onCaptureChange = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const push = (span: Span) => { if (capture) { buffer.push(span); if (buffer.length >= 60) void flush() } }

// Something the learner did, which work done because of it will point to. Undefined with no capture.
export function act(name: string, fields?: Record<string, unknown>, parent?: Act | null): Act | undefined {
  if (!capture) return undefined
  const id = newId()
  push({ kind: 'action', name, start: now(), action: id, parent: parent?.id ?? null, ...(fields ? { fields } : {}) })
  return { id, name }
}
// Work done on the phone for `action`, from `start` until now, and where its result came from.
export function onPhone(action: Act | undefined, name: string, source: string, start = now(), fields?: Record<string, unknown>) {
  if (!capture) return
  push({ kind: 'phone', name, start, end: now(), action: action?.id ?? null, source, ...(fields ? { fields } : {}) })
}
// The screen's state, each time it differs from the last one recorded for that screen.
const lastState = new Map<string, string>()
export function screenState(screen: string, state: Record<string, unknown>) {
  if (!capture) return
  const json = JSON.stringify(state)
  if (lastState.get(screen) === json) return
  lastState.set(screen, json)
  push({ kind: 'state', name: screen, start: now(), state })
}
// A request about to go out for `action`: the headers that tell the function to record its side,
// and a function to call when the reply is in. Null with no capture.
export function requestSpan(action: Act | undefined, op: string, method: string, fields: string[], bearer?: string) {
  if (!capture) return null
  if (bearer) token = bearer
  const request = newId(), start = now(), id = capture.id
  return {
    headers: { 'x-mila-capture': id, 'x-mila-request': request, ...(action ? { 'x-mila-action': action.id } : {}) },
    done: (status: number | string, bytes?: number | null) =>
      push({ kind: 'net', name: op, start, end: now(), action: action?.id ?? null, request, source: 'network', fields: { method, status, sent: fields, ...(bytes ? { bytes } : {}) } }),
  }
}

async function post(body: unknown, bearer = token) {
  if (!bearer) throw new Error('Sign in first.')
  const response = await fetch(`${BASE}/.netlify/functions/debug-trace`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.message || `Debug capture failed (${response.status}).`)
  return data
}
let flushing: Promise<void> | null = null
// Sends what is waiting; what fails to go waits for the next time.
export function flush(): Promise<void> {
  if (flushing || !capture || !buffer.length || !token) return flushing ?? Promise.resolve()
  const batch = buffer.splice(0, 300)
  flushing = post({ op: 'spans', capture: capture.id, spans: batch })
    .then(() => { sent += batch.length }, () => { buffer.unshift(...batch) })
    .finally(() => { flushing = null; changed() })
  return flushing
}
let timer: ReturnType<typeof setInterval> | null = null
const tick = () => { timer ??= setInterval(() => { if (capture) void flush() }, 2500) }
AppState.addEventListener('change', state => { if (state !== 'active') void flush() })
if (capture) tick()

export async function startCapture(bearer: string, prompts: boolean, device: string) {
  token = bearer
  const { capture: started } = await post({ op: 'start', prompts, device }, bearer) as { capture: Capture }
  capture = started; buffer = []; sent = 0; lastState.clear()
  keep(); tick(); changed()
  return started
}
export async function stopCapture(bearer: string) {
  if (!capture) return
  token = bearer
  await flush()
  const id = capture.id
  capture = null; keep(); changed()
  await post({ op: 'stop', capture: id }, bearer).catch(() => undefined)
}

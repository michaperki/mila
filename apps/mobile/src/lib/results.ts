import { AppState, Platform } from 'react-native'
import { File, Paths } from 'expo-file-system'
import { ApiError, request } from './api'
import type { Act } from './trace'
import { drain, enqueue, type Outcome, type Pending, type ResultBody, withPending } from './result-queue'
import type { VocabEntry } from './types'

// Study's answers, sent to the server reliably (lib/result-queue.ts says how): each waits in a
// file on the phone, beside the study log, until the server has it, so a lost connection, leaving
// Study or closing Mila loses nothing. They are sent at once, and again when Study opens, when
// the words are fetched and whenever Mila comes back to the foreground or leaves it. Nothing
// waits on them: an answer is shown and the round goes on as before.
const file = new File(Paths.document, 'study-results.json')
let queue: Pending[] | null = null
const read = () => {
  if (queue) return queue
  queue = []
  if (Platform.OS === 'web') return queue
  try { if (file.exists) queue = JSON.parse(file.textSync()) as Pending[] } catch { /* a damaged file starts over */ }
  return queue
}
const write = (next: Pending[]) => {
  queue = next
  if (Platform.OS === 'web') return
  try { file.write(JSON.stringify(next)) } catch { /* kept for this visit only */ }
}

// The answer each card's update was saved for, in a debug capture (lib/trace.ts), until it is sent.
const actOf = new Map<string, Act>()
const cardOf = (body: ResultBody) => `${body.id}:${body.form?.key ?? body.checkpoint?.stage ?? 'word'}`
const deliver = (token: string) => async (body: ResultBody): Promise<Outcome> => {
  const act = actOf.get(cardOf(body))
  actOf.delete(cardOf(body))
  try {
    await request('vocab', { token, method: 'PATCH', body, act })
    return 'sent'
  } catch (failure) {
    // The word was deleted: nothing to keep it on. Invalid: it never will be kept.
    if (failure instanceof ApiError && (failure.status === 404 || failure.status === 400)) return failure.status === 404 ? 'sent' : 'refused'
    return 'later'
  }
}

// One send at a time; a call while one is on its way gets that one, and anything queued
// meanwhile goes in the next.
let sending: Promise<unknown> | null = null
let again = false
export function sendResults(owner: string, token: string): Promise<unknown> {
  if (sending) { again = true; return sending }
  sending = drain(read, write, owner, deliver(token)).finally(() => {
    sending = null
    if (again) { again = false; void sendResults(owner, token) }
  })
  return sending
}

// An answer's update: kept, then sent.
export function saveResult(owner: string, token: string, body: ResultBody, act?: Act) {
  if (act) actOf.set(cardOf(body), act)
  write(enqueue(read(), owner, body))
  void sendResults(owner, token)
}

// This account's answers not yet on the server (for a backup, lib/data-export.ts).
export const waitingResults = (owner: string) => read().filter(item => item.owner === owner)

// The words as fetched, with what hasn't reached the server yet.
export const withUnsent = (entries: VocabEntry[], owner: string) => withPending(entries, read(), owner)

// Sends what is waiting whenever Mila comes back or leaves; returns the way to stop.
export function sendResultsOnChange(owner: string, token: string) {
  void sendResults(owner, token)
  const subscription = AppState.addEventListener('change', () => { void sendResults(owner, token) })
  return () => subscription.remove()
}

import { useSyncExternalStore } from 'react'
import { AppState, Platform } from 'react-native'
import * as Crypto from 'expo-crypto'
import { Directory, File, Paths } from 'expo-file-system'
import { request } from './api'
import { documentFromRecognition } from './documents'
import { recognizeImage } from './recognition'
import type { CapturedImage, Recognition, Session } from './types'

// Photos of pages being read, kept on the phone from the moment they are taken until the page is
// in the library, so nothing is lost when Mila is left or the phone is locked while a page is
// read (several seconds). A page read goes on while Mila is in the background as long as the
// phone lets it; one that didn't finish, or failed (offline), is read again when Mila is back
// in front, and at the next launch. Once read, the page is saved to the library from here, so it
// is there whether or not the reader was opened. A photo in which no text was found is let go.
// Pages still waiting are listed at the top of the Library, to read again or delete.

// `failed`: why the last attempt didn't work; `result`: the page as read, if only saving it failed.
export type Scan = { id: string; owner: string; file: string; width: number; height: number; takenAt: number; attempts: number; failed?: string; result?: Recognition }
export class NoText extends Error {}

const folder = new Directory(Paths.document, 'scans')
const indexFile = new File(folder, 'scans.json')
// After this many failed attempts in a row a page waits for Try again in the Library.
const MAX_ATTEMPTS = 3
// A read that was in the background longer than this is started again on coming back (the
// phone has most likely stopped it, and its answer would only arrive at the timeout).
const STALE_MS = 15000

let scans: Scan[] = load()
const listeners = new Set<() => void>()
const tell = () => listeners.forEach(listener => listener())
function load(): Scan[] {
  if (Platform.OS === 'web') return []
  try { return indexFile.exists ? (JSON.parse(indexFile.textSync()) as Scan[]).filter(scan => new File(folder, scan.file).exists) : [] } catch { return [] }
}
function save(next: Scan[]) {
  scans = next; tell()
  try { if (!folder.exists) folder.create({ intermediates: true, idempotent: true }); indexFile.write(JSON.stringify(next)) } catch { /* kept in memory for this launch */ }
}
const patch = (id: string, change: Partial<Scan>) => save(scans.map(scan => (scan.id === id ? { ...scan, ...change } : scan)))

// The photo as it is kept (the folder moves between app updates on iOS, so only its name is stored).
export const imageOf = (scan: Scan): CapturedImage => ({ uri: new File(folder, scan.file).uri, width: scan.width, height: scan.height })

// Keeps a photo just taken or chosen: copied out of the camera's or picker's temporary files.
export async function keepScan(image: CapturedImage, owner: string): Promise<Scan> {
  const id = Crypto.randomUUID()
  const scan: Scan = { id, owner, file: `${id}.jpg`, width: image.width, height: image.height, takenAt: Date.now(), attempts: 0 }
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true })
  await new File(image.uri).copy(new File(folder, scan.file))
  save([...scans, scan])
  return scan
}
export function dropScan(id: string) {
  reads.get(id)?.controller.abort(); reads.delete(id)
  const scan = scans.find(item => item.id === id)
  if (scan) try { new File(folder, scan.file).delete() } catch { /* already gone */ }
  save(scans.filter(item => item.id !== id))
}

// Reads in progress, by scan: one at a time per page, shared by everyone waiting on it.
const reads = new Map<string, { controller: AbortController; promise: Promise<Recognition>; started: number }>()
let backgroundSince: number | null = null
export const isReading = (id: string) => reads.has(id)

// Reads a kept page and saves it to the library (under the scan's id, so it can't be saved
// twice); resolves with it as the reader opens it, already in the library.
export function readScan(id: string, session: Session): Promise<Recognition> {
  const running = reads.get(id)
  if (running) return running.promise
  const scan = scans.find(item => item.id === id)
  if (!scan) return Promise.reject(new Error('This photo is no longer kept.'))
  const controller = new AbortController()
  const promise = (async () => {
    try {
      const read = scan.result ?? { ...(await recognizeImage(imageOf(scan), session.token, { signal: controller.signal, read: true })), id }
      if (!read.text) throw new NoText('No text found. Move closer and hold steady.')
      if (controller.signal.aborted) throw new Error('Canceled')
      patch(id, { result: read })
      const doc = documentFromRecognition(read, id)
      await request('texts', { token: session.token, body: { ...doc, textId: doc.id }, signal: controller.signal })
      dropScan(id)
      return { ...read, library: 'saved' as const }
    } catch (failure) {
      if (failure instanceof NoText) dropScan(id)
      else if (!controller.signal.aborted && scans.some(item => item.id === id)) patch(id, { attempts: scan.attempts + 1, failed: (failure as Error).message })
      throw failure
    } finally { if (reads.get(id)?.controller === controller) { reads.delete(id); tell() } }
  })()
  reads.set(id, { controller, promise, started: Date.now() })
  patch(id, { failed: undefined })
  return promise
}

// Starts again every page of this account that isn't being read and hasn't failed too often, and
// any read left in the background too long. At launch and each time Mila comes back to the front.
export function resumeScans(session: Session) {
  const stale = backgroundSince !== null && Date.now() - backgroundSince > STALE_MS
  backgroundSince = null
  for (const scan of scans) {
    if (scan.owner !== session.user.id) continue
    const running = reads.get(scan.id)
    if (running && stale) {
      reads.delete(scan.id); running.controller.abort()
      // Whoever waits on the read that was stopped gets the new one's answer.
      void readScan(scan.id, session).catch(() => {})
      continue
    }
    if (!running && scan.attempts < MAX_ATTEMPTS) void readScan(scan.id, session).catch(() => {})
  }
}
// Keeps resuming while signed in (app/_layout.tsx); returns how to stop.
export function watchScans(session: Session) {
  resumeScans(session)
  const subscription = AppState.addEventListener('change', state => {
    if (state === 'active') resumeScans(session)
    else if (backgroundSince === null) backgroundSince = Date.now()
  })
  return () => subscription.remove()
}

// The page a read in progress will end with, following it if it is started again: what the
// camera waits on to open the reader.
export async function waitForScan(id: string, session: Session): Promise<Recognition> {
  for (;;) {
    const running = reads.get(id)?.promise ?? readScan(id, session)
    try { return await running } catch (failure) {
      // Stopped to be started again (resumeScans): wait on the new read.
      if (reads.has(id)) continue
      throw failure
    }
  }
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
// This account's pages waiting to be read, oldest first.
export function useScans(owner: string | undefined) {
  const all = useSyncExternalStore(subscribe, () => scans)
  return all.filter(scan => scan.owner === owner)
}

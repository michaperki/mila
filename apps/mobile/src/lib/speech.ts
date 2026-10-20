import { useSyncExternalStore } from 'react'
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import * as Speech from 'expo-speech'
import * as Crypto from 'expo-crypto'
import { Directory, File, Paths } from 'expo-file-system'
import { request } from './api'
import { getPref, setPref } from './prefs'
import { RATES, speechPieces, type Rate } from './speech-text'

// Hebrew read aloud everywhere in the app. Signed in, it plays the voice chosen in Account
// (Sarah by default, or Charon) from the `speech` function, one sentence at a time, keeping
// each clip on the device so a replay is instant and free. Signed out, offline, or if the
// service fails, it falls back to the phone's own voice. One thing plays at a time; playing
// the same text again stops it. Speed (1×, ½×, ¼×) is one setting for the whole app.
export type Voice = 'sarah' | 'charon'
export const VOICES: { id: Voice; name: string; detail: string }[] = [
  { id: 'sarah', name: 'Sarah', detail: 'Warm and clear (ElevenLabs)' },
  { id: 'charon', name: 'Charon', detail: 'Calm and low (Google Gemini)' },
]

type State = { voice: Voice; rate: Rate; playing: string | null; loading: boolean }
let state: State = { voice: 'sarah', rate: 1, playing: null, loading: false }
const listeners = new Set<() => void>()
const update = (change: Partial<State>) => { state = { ...state, ...change }; listeners.forEach(listener => listener()) }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const useSpeech = () => useSyncExternalStore(subscribe, () => state)

let loaded: Promise<void> | null = null
export function startSpeech() {
  loaded ??= (async () => {
    const [voice, rate] = await Promise.all([getPref('voice'), getPref('speechRate')])
    update({ voice: voice === 'charon' ? 'charon' : 'sarah', rate: RATES.find(value => String(value) === rate) ?? 1 })
  })()
  return loaded
}
export function setVoice(voice: Voice) { setPref('voice', voice); update({ voice }) }
export function setRate(rate: Rate) {
  setPref('speechRate', String(rate)); update({ rate })
  try { player?.setPlaybackRate(rate, 'high') } catch { /* nothing playing */ }
}

let player: AudioPlayer | null = null
let run = 0 // bumped by every speak/stop; a reading that sees a newer run gives up
const clips = new Directory(Paths.cache, 'speech')

// `key` identifies what is playing, so its button can show Stop. Pieces are read in order.
export async function speak(text: string | string[], token?: string | null, key = Array.isArray(text) ? text.join(' ') : text) {
  if (state.playing === key) return stop()
  stop()
  const mine = ++run
  const pieces = speechPieces(text)
  if (!pieces.length) return
  update({ playing: key, loading: true })
  await startSpeech()
  await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {})
  const voice = state.voice
  let next = token ? clip(pieces[0], voice, token) : null
  for (let i = 0; i < pieces.length && mine === run; i++) {
    const uri = await next?.catch(() => null)
    if (mine !== run) return
    if (!uri) { await device(pieces.slice(i).join(' '), mine); break }
    next = i + 1 < pieces.length ? clip(pieces[i + 1], voice, token!) : null
    update({ loading: false })
    await play(uri, mine)
  }
  if (mine === run) finish()
}

export function stop() {
  run++
  try { player?.pause() } catch { /* already gone */ }
  void Speech.stop()
  if (state.playing) finish()
}

function finish() {
  update({ playing: null, loading: false })
  void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {})
}

// Fetches the clips for `text` ahead of time, so reading it next starts at once. Only the voice
// in use, and nothing signed out (the phone's own voice needs nothing fetched).
export async function prefetchSpeech(text: string, token?: string | null) {
  if (!token) return
  await startSpeech()
  const voice = state.voice
  for (const piece of speechPieces(text).slice(0, 2)) await clip(piece, voice, token).catch(() => null)
}

// The clip's file on the device, fetched from the `speech` function the first time. A clip
// still on its way is shared, so a prefetch and a tap never pay for the same clip twice.
const fetching = new Map<string, Promise<string>>()
function clip(text: string, voice: Voice, token: string) {
  const key = `${voice}|${text}`
  let pending = fetching.get(key)
  if (!pending) {
    pending = fetchClip(text, voice, token).finally(() => fetching.delete(key))
    fetching.set(key, pending)
  }
  return pending
}
async function fetchClip(text: string, voice: Voice, token: string) {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${voice}|${text}`)
  for (const extension of ['mp3', 'wav']) {
    const file = new File(clips, `${hash}.${extension}`)
    if (file.exists) return file.uri
  }
  const { audio, mime } = await request<{ audio: string; mime: string }>('speech', { token, body: { text, voice }, timeoutMs: 30000 })
  if (!clips.exists) clips.create({ intermediates: true, idempotent: true })
  const file = new File(clips, `${hash}.${mime === 'audio/wav' ? 'wav' : 'mp3'}`)
  file.write(audio, { encoding: 'base64' })
  return file.uri
}

function play(uri: string, mine: number) {
  return new Promise<void>(resolve => {
    try {
      player ??= createAudioPlayer()
      const subscription = player.addListener('playbackStatusUpdate', status => {
        if (status.didJustFinish || mine !== run || status.error) { subscription.remove(); clearInterval(watch); resolve() }
      })
      // Stopping pauses without a status update, so a stop is also noticed here.
      const watch = setInterval(() => { if (mine !== run) { subscription.remove(); clearInterval(watch); resolve() } }, 200)
      player.replace({ uri })
      player.setPlaybackRate(state.rate, 'high')
      player.play()
    } catch { resolve() }
  })
}

// The phone's own Hebrew voice; 0.8 is the pace it used before the recorded voices.
function device(text: string, mine: number) {
  update({ loading: false })
  return new Promise<void>(resolve => {
    if (mine !== run) return resolve()
    Speech.speak(text, { language: 'he-IL', rate: 0.8 * state.rate, onDone: resolve, onStopped: resolve, onError: () => resolve() })
  })
}

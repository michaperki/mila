import * as Haptics from 'expo-haptics'
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { getPref, setPref } from './prefs'

// The app's feel, in one vocabulary of named moments. Each is a haptic and, for a few, a short
// sound. Screens call `feel('right')` and never pick haptics or sounds themselves.
// One action is one moment: a grade that also moves on plays the grade, not the move as well.
// Reading stays quiet: reader moments are touch only, except a soft sound on saving a word.
// Sounds: Kenney "Interface Sounds" (CC0), assets/sounds; Account → Sounds / Haptics.
export type Moment =
  | 'press' // any button
  | 'shutter' // taking a photo
  | 'tick' // a selection moving: a word added to a drag, the next sentence
  | 'select' // a word or sentence picked
  | 'reveal' // Show answer
  | 'advance' // the next or previous study card, by swipe, arrow or Next
  | 'right' | 'wrong' // a choice answered
  | 'graded' // a card answered as still learning
  | 'gotIt' // a card answered as known
  | 'saved' // a word saved
  | 'unlock' // a stage opened
  | 'complete' // a practice session done

const SOUNDS = {
  advance: require('../../assets/sounds/advance.wav'),
  reveal: require('../../assets/sounds/reveal.wav'),
  right: require('../../assets/sounds/right.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
  graded: require('../../assets/sounds/graded.wav'),
  saved: require('../../assets/sounds/saved.wav'),
  unlock: require('../../assets/sounds/unlock.wav'),
  complete: require('../../assets/sounds/complete.wav'),
} as const
type Sound = keyof typeof SOUNDS
const SOUND_OF: Partial<Record<Moment, Sound>> = {
  advance: 'advance', reveal: 'reveal', right: 'right', gotIt: 'right', wrong: 'wrong', graded: 'graded', saved: 'saved', unlock: 'unlock', complete: 'complete',
}
const HAPTIC: Record<Moment, () => Promise<void>> = {
  press: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  shutter: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  tick: () => Haptics.selectionAsync(),
  select: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
  reveal: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  advance: () => Haptics.selectionAsync(),
  right: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  gotIt: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  wrong: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  graded: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),
  saved: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  unlock: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  complete: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
}

const settings = { sounds: true, haptics: true }
let ready: Promise<void> | null = null
const players = new Map<Sound, AudioPlayer>()

// Reads the switches and sets audio to mix with music and respect the silent switch.
// Called once at startup; `feel` works before it finishes, with the defaults.
export function startFeedback() {
  ready ??= (async () => {
    const [sounds, haptics] = await Promise.all([getPref('sounds'), getPref('haptics')])
    Object.assign(settings, { sounds, haptics })
    await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {})
  })()
  return ready
}

export function feel(moment: Moment) {
  if (settings.haptics) void HAPTIC[moment]().catch(() => {})
  const sound = SOUND_OF[moment]
  if (!settings.sounds || !sound) return
  try {
    let player = players.get(sound)
    if (!player) { player = createAudioPlayer(SOUNDS[sound]); player.volume = 0.6; players.set(sound, player) }
    player.seekTo(0).catch(() => {})
    player.play()
  } catch { /* a sound must never break the interaction */ }
}

export const feedbackSettings = () => ({ ...settings })
export function setFeedback(name: 'sounds' | 'haptics', value: boolean) {
  settings[name] = value
  setPref(name, value)
  if (value) feel(name === 'sounds' ? 'right' : 'press')
}

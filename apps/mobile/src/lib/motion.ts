import { Easing, FadeIn, FadeInLeft, FadeInRight, FadeOut, FadeOutLeft, LinearTransition, ReduceMotion, SlideInDown, SlideOutDown, withTiming } from 'react-native-reanimated'

// Motion is only for changes the learner just caused, and it is quick and settles without
// overshoot: ease-out timing, never springs. Everything follows the system's Reduce Motion.
export const EASE_OUT = Easing.out(Easing.cubic)
export const DURATION = { press: 90, quick: 150, base: 190 }

// Moves a shared value to `value` (presses, the progress bar, snapping a card back).
// No default parameter: on the UI thread a worklet's defaults are evaluated before its captured
// variables exist, so `duration = DURATION.base` threw there and ended the app (the swipe crash).
export const settle = (value: number, duration?: number) => {
  'worklet'
  return withTiming(value, { duration: duration ?? DURATION.base, easing: EASE_OUT, reduceMotion: ReduceMotion.System })
}

// Layout animations, for things that appear, leave or move because of a tap.
const system = ReduceMotion.System
export const APPEAR = FadeIn.duration(DURATION.quick).reduceMotion(system)
export const DISAPPEAR = FadeOut.duration(DURATION.quick).reduceMotion(system)
export const REFLOW = LinearTransition.duration(DURATION.base).reduceMotion(system)
export const SHEET_IN = SlideInDown.duration(DURATION.base).reduceMotion(system)
export const SHEET_OUT = SlideOutDown.duration(DURATION.quick).reduceMotion(system)
// The next practice card: a short slide and fade, so it reads as "next", not a show.
export const CARD_IN = FadeInRight.duration(DURATION.base).reduceMotion(system)
// The card before, when going back: the same slide from the other side.
export const CARD_BACK_IN = FadeInLeft.duration(DURATION.base).reduceMotion(system)
export const CARD_OUT = FadeOutLeft.duration(120).reduceMotion(system)

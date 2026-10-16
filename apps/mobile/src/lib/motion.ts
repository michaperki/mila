import { ReduceMotion, withSpring, withTiming, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated'

// Shared motion so the app moves with one character. Every animation follows the system's
// Reduce Motion setting (ReduceMotion.System): with it on, values jump to their end.
export const SPRING = {
  // Presses and small pops: quick, a little bounce.
  snappy: { damping: 18, stiffness: 380, mass: 0.6, reduceMotion: ReduceMotion.System },
  // Cards and drawers: settles without wobbling.
  gentle: { damping: 22, stiffness: 220, mass: 0.9, reduceMotion: ReduceMotion.System },
  // Celebrations: a visible bounce.
  bouncy: { damping: 10, stiffness: 260, mass: 0.7, reduceMotion: ReduceMotion.System },
} satisfies Record<string, WithSpringConfig>
export const TIMING = {
  quick: { duration: 140, reduceMotion: ReduceMotion.System },
  calm: { duration: 260, reduceMotion: ReduceMotion.System },
} satisfies Record<string, WithTimingConfig>

export const spring = (value: number, kind: keyof typeof SPRING = 'snappy') => {
  'worklet'
  return withSpring(value, SPRING[kind])
}
export const timing = (value: number, kind: keyof typeof TIMING = 'quick') => {
  'worklet'
  return withTiming(value, TIMING[kind])
}

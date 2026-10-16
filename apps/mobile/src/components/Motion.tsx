import { type ReactNode, useEffect } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { Easing, interpolate, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { scheduleOnRN } from 'react-native-worklets'
import { colors } from './ui'
import { feel } from '../lib/feedback'
import { spring, SPRING } from '../lib/motion'

// A thin bar that fills smoothly as a session moves on.
export function ProgressBar({ value }: { value: number }) {
  const progress = useSharedValue(value)
  useEffect(() => { progress.set(spring(value, 'gentle')) }, [value, progress])
  const fill = useAnimatedStyle(() => ({ width: `${Math.min(1, Math.max(0, progress.get())) * 100}%` }))
  return <View style={motion.track}><Animated.View style={[motion.fill, fill]} /></View>
}

const SWIPE = 110
// A card that can be swiped to grade it: right for Got it, left for Again. While dragging it
// tilts and shows which way it will go; crossing the line gives a tick. Short of the line it
// springs back. `enabled` is off until the answer is showing.
export function SwipeCard({ enabled, onSwipe, children, style }: { enabled: boolean; onSwipe: (rating: 'good' | 'again') => void; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const x = useSharedValue(0)
  const past = useSharedValue(0)
  const pan = Gesture.Pan().enabled(enabled).activeOffsetX([-14, 14]).failOffsetY([-16, 16])
    .onUpdate(event => {
      x.set(event.translationX)
      const side = event.translationX > SWIPE ? 1 : event.translationX < -SWIPE ? -1 : 0
      if (side !== past.get()) { past.set(side); if (side) scheduleOnRN(feel, 'tick') }
    })
    .onEnd(event => {
      const far = Math.abs(event.translationX) > SWIPE || Math.abs(event.velocityX) > 900
      if (!far) { x.set(withSpring(0, SPRING.gentle)); past.set(0); return }
      const right = event.translationX > 0
      x.set(withTiming(right ? 520 : -520, { duration: 170, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }, done => {
        if (done) scheduleOnRN(onSwipe, right ? 'good' : 'again')
      }))
    })
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { rotate: `${x.get() / 28}deg` }] }))
  const good = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [20, SWIPE], [0, 1], 'clamp') }))
  const again = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [-SWIPE, -20], [1, 0], 'clamp') }))
  return <GestureDetector gesture={pan}>
    <Animated.View style={[style, moving]}>
      {children}
      <Animated.View pointerEvents="none" style={[motion.stamp, motion.stampGood, good]}><Text style={[motion.stampText, { color: colors.green }]}>Got it</Text></Animated.View>
      <Animated.View pointerEvents="none" style={[motion.stamp, motion.stampAgain, again]}><Text style={[motion.stampText, { color: colors.red }]}>Again</Text></Animated.View>
    </Animated.View>
  </GestureDetector>
}

// Plays a short animation when `state` changes: a pop for the right answer, a shake for a
// wrong one.
export function Reaction({ state, children, style }: { state: 'idle' | 'right' | 'wrong'; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const scale = useSharedValue(1)
  const shift = useSharedValue(0)
  useEffect(() => {
    if (state === 'right') scale.set(withSequence(withSpring(1.05, SPRING.snappy), withSpring(1, SPRING.gentle)))
    if (state === 'wrong') shift.set(withSequence(...[-9, 9, -6, 6, -3, 0].map(value => withTiming(value, { duration: 45, reduceMotion: ReduceMotion.System }))))
  }, [state, scale, shift])
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }, { translateX: shift.get() }] }))
  return <Animated.View style={[style, animated]}>{children}</Animated.View>
}

// A small burst of confetti from the middle of its parent, for finishing a session or
// opening a stage. Purely decorative.
const BURST_COLORS = [colors.green, colors.lime, '#E8B04A', '#7FB7A4', '#F28C7C']
export function Burst({ count = 18, delay = 0 }: { count?: number; delay?: number }) {
  const t = useSharedValue(0)
  useEffect(() => { t.set(withDelay(delay, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }))) }, [t, delay])
  return <View pointerEvents="none" style={motion.burst}>
    {Array.from({ length: count }, (_, i) => <Particle key={i} t={t} angle={(i / count) * Math.PI * 2 + (i % 3) * 0.2} distance={70 + (i % 4) * 22} color={BURST_COLORS[i % BURST_COLORS.length]} />)}
  </View>
}
function Particle({ t, angle, distance, color }: { t: ReturnType<typeof useSharedValue<number>>; angle: number; distance: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const p = t.get()
    return {
      opacity: interpolate(p, [0, 0.1, 0.7, 1], [0, 1, 1, 0]),
      transform: [{ translateX: Math.cos(angle) * distance * p }, { translateY: Math.sin(angle) * distance * p + 40 * p * p }, { scale: interpolate(p, [0, 0.2, 1], [0.4, 1, 0.6]) }, { rotate: `${p * 300}deg` }],
    }
  })
  return <Animated.View style={[motion.particle, { backgroundColor: color }, style]} />
}

// A number that counts up to its value when it appears.
export function CountUp({ value, style, delay = 0 }: { value: number; style?: StyleProp<ViewStyle>; delay?: number }) {
  const scale = useSharedValue(0.6)
  useEffect(() => { scale.set(withDelay(delay, withSpring(1, SPRING.bouncy))) }, [scale, delay])
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }], opacity: interpolate(scale.get(), [0.6, 1], [0, 1], 'clamp') }))
  return <Animated.View style={[style, pop]}><Text style={motion.count}>{value}</Text></Animated.View>
}

const motion = StyleSheet.create({
  track: { height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.green },
  stamp: { position: 'absolute', top: 14, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 2, backgroundColor: colors.white },
  stampGood: { left: 14, borderColor: colors.green, transform: [{ rotate: '-8deg' }] },
  stampAgain: { right: 14, borderColor: colors.red, transform: [{ rotate: '8deg' }] },
  stampText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  burst: { position: 'absolute', left: '50%', top: '40%', width: 0, height: 0 },
  particle: { position: 'absolute', width: 9, height: 9, borderRadius: 2, left: -4.5, top: -4.5 },
  count: { fontSize: 30, fontWeight: '700', color: colors.ink },
})

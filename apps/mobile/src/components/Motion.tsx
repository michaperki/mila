import { type ComponentProps, type ReactNode, useEffect, useState } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { Easing, interpolate, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { scheduleOnRN } from 'react-native-worklets'
import { colors } from './ui'
import { feel } from '../lib/feedback'
import { DURATION, settle, SHEET_IN, SHEET_OUT } from '../lib/motion'

// A thin bar that fills smoothly as a session moves on.
export function ProgressBar({ value }: { value: number }) {
  const progress = useSharedValue(value)
  useEffect(() => { progress.set(settle(value)) }, [value, progress])
  const fill = useAnimatedStyle(() => ({ width: `${Math.min(1, Math.max(0, progress.get())) * 100}%` }))
  return <View style={motion.track}><Animated.View style={[motion.fill, fill]} /></View>
}

const SWIPE = 110
// A card that can be swiped to grade it: right for Got it, left for Again. While dragging it
// tilts and shows which way it will go; crossing the line gives a tick. Short of the line it
// slides back. `enabled` is off until the answer is showing.
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
      if (!far) { x.set(settle(0)); past.set(0); return }
      const right = event.translationX > 0
      x.set(withTiming(right ? 520 : -520, { duration: DURATION.quick, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }, done => {
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

// A quick shake when a choice turns out wrong: the one animation that says "no" faster than
// the colour does.
export function Shake({ on, children, style }: { on: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const shift = useSharedValue(0)
  useEffect(() => {
    if (on) shift.set(withSequence(...[-7, 7, -4, 4, 0].map(value => withTiming(value, { duration: 40, reduceMotion: ReduceMotion.System }))))
  }, [on, shift])
  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: shift.get() }] }))
  return <Animated.View style={[style, animated]}>{children}</Animated.View>
}

// A bottom sheet that rises into place and can be dragged down by its `handle` area to close.
// Dragged past the line (or flicked), it slides away and calls `onDismiss`.
export function DraggableSheet({ onDismiss, handle, children, style, onLayout, ...props }: {
  onDismiss: () => void; handle: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle>
  onLayout?: ComponentProps<typeof View>['onLayout']; accessibilityViewIsModal?: boolean
}) {
  const y = useSharedValue(0)
  const pan = Gesture.Pan().activeOffsetY(10).failOffsetX([-20, 20])
    .onUpdate(event => { y.set(Math.max(0, event.translationY)) })
    .onEnd(event => {
      if (event.translationY < 70 && event.velocityY < 800) { y.set(settle(0)); return }
      y.set(withTiming(600, { duration: DURATION.quick, reduceMotion: ReduceMotion.System }, done => { if (done) scheduleOnRN(onDismiss) }))
    })
  const moving = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }))
  return <Animated.View {...props} onLayout={onLayout} entering={SHEET_IN} exiting={SHEET_OUT} style={[style, moving]}>
    <GestureDetector gesture={pan}>
      <View><View style={motion.grabber} />{handle}</View>
    </GestureDetector>
    {children}
  </Animated.View>
}

// A soft band of light sweeping down over a frozen photo while it is being read.
export function ScanShimmer() {
  const t = useSharedValue(0)
  const [height, setHeight] = useState(0)
  useEffect(() => { t.set(withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }), -1, false)) }, [t])
  const band = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(t.get(), [0, 1], [-160, height]) }] }))
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
    <Animated.View style={[motion.band, band]}>
      <LinearGradient colors={['#DCECBA00', '#DCECBA55', '#DCECBA00']} style={StyleSheet.absoluteFill} />
    </Animated.View>
  </View>
}

const motion = StyleSheet.create({
  track: { height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.green },
  stamp: { position: 'absolute', top: 14, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 2, backgroundColor: colors.white },
  stampGood: { left: 14, borderColor: colors.green, transform: [{ rotate: '-8deg' }] },
  stampAgain: { right: 14, borderColor: colors.red, transform: [{ rotate: '8deg' }] },
  stampText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 8 },
  band: { position: 'absolute', left: 0, right: 0, height: 160 },
})

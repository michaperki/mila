import { type ComponentProps, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
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
// A study card that is swiped on to the next card, either way: it flies off the side it was
// swiped to. (Going back is the arrow's job; a swipe that sometimes went back felt random.)
// While dragging it tilts; crossing the line gives a tick. Short of it, the card slides back. `onDrag` says when a drag
// starts and ends: the card moves with the finger, so a press inside it would otherwise count
// the release as a tap.
// It stays mounted for the whole deck: only its content changes, and `card` (which card it
// holds) brings it back to the middle once the next one is in. The gesture is made once and
// reads the latest callbacks, so a re-render during a swipe never swaps it mid-flight, and a
// view with a gesture on it is never unmounted while it is animating. `onSwipe` returns false
// when there was nowhere to go, and the card slides back.
export function SwipeCard({ card, onSwipe, onDrag, children, style }: {
  card: string | number; onSwipe: () => boolean | void; onDrag?: (dragging: boolean) => void
  children: ReactNode; style?: StyleProp<ViewStyle>
}) {
  const x = useSharedValue(0)
  const past = useSharedValue(0)
  useEffect(() => { x.set(0); past.set(0) }, [card, x, past])
  const latest = useRef({ onSwipe, onDrag })
  useEffect(() => { latest.current = { onSwipe, onDrag } })
  // The gesture's callbacks read `latest` only when a swipe happens, never while rendering.
  /* eslint-disable react-hooks/refs */
  const pan = useMemo(() => {
    const swiped = () => { if (latest.current.onSwipe() === false) { x.set(settle(0)); past.set(0) } }
    const dragging = (on: boolean) => latest.current.onDrag?.(on)
    return Gesture.Pan().activeOffsetX([-14, 14]).failOffsetY([-16, 16])
      .onStart(() => { scheduleOnRN(dragging, true) })
      .onFinalize((_event, activated) => { if (activated) scheduleOnRN(dragging, false) })
      .onUpdate(event => {
        x.set(event.translationX)
        const side = event.translationX < -SWIPE ? -1 : event.translationX > SWIPE ? 1 : 0
        if (side !== past.get()) { past.set(side); if (side) scheduleOnRN(feel, 'tick') }
      })
      .onEnd(event => {
        const far = Math.abs(event.translationX) > SWIPE || Math.abs(event.velocityX) > 900
        if (!far) { x.set(settle(0)); past.set(0); return }
        x.set(withTiming(event.translationX > 0 ? 520 : -520, { duration: DURATION.quick, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }, done => {
          if (done) scheduleOnRN(swiped)
        }))
      })
  }, [x, past])
  /* eslint-enable react-hooks/refs */
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { rotate: `${x.get() / 28}deg` }] }))
  return <GestureDetector gesture={pan}><Animated.View style={[style, moving]}>{children}</Animated.View></GestureDetector>
}

// A card that turns over when tapped: it narrows to an edge, shows its other side and widens
// again, quickly. `flipped` is which side shows; a new card starts on the side it is given.
export function FlipCard({ flipped, onPress, front, back, style, accessibilityLabel }: {
  flipped: boolean; onPress: () => void; front: ReactNode; back: ReactNode; style?: StyleProp<ViewStyle>; accessibilityLabel?: string
}) {
  const [face, setFace] = useState(flipped)
  const width = useSharedValue(1)
  useEffect(() => {
    if (flipped === face) return
    width.set(withTiming(0, { duration: 90, easing: Easing.in(Easing.quad), reduceMotion: ReduceMotion.System }, () => {
      scheduleOnRN(setFace, flipped)
      width.set(settle(1, 110))
    }))
  }, [flipped, face, width])
  const turning = useAnimatedStyle(() => ({ transform: [{ scaleX: width.get() }] }))
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint="Turns the card over" onPress={onPress}>
    <Animated.View style={[style, turning]}>{face ? back : front}</Animated.View>
  </Pressable>
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
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 8 },
  band: { position: 'absolute', left: 0, right: 0, height: 160 },
})

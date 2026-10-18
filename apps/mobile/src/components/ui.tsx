import { type ComponentProps, type ReactNode, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { feel } from '../lib/feedback'
import { DURATION, settle } from '../lib/motion'
import { router } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
export const colors = { paper: '#F6F5F1', ink: '#172B29', muted: '#65736E', green: '#145C4B', lime: '#DCECBA', line: '#DBE2DA', white: '#FFFFFF', red: '#A52D35' }
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper }, content: { padding: 22, gap: 20, paddingBottom: 36 },
  title: { fontSize: 32, lineHeight: 39, fontWeight: '700', color: colors.ink },
  heading: { fontSize: 21, fontWeight: '600', color: colors.ink },
  copy: { fontSize: 16, lineHeight: 25, color: colors.muted },
  eyebrow: { color: colors.green, fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  card: { padding: 20, gap: 14, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, fontSize: 17, color: colors.ink, backgroundColor: colors.white },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink, marginBottom: 7 },
  hebrew: { fontSize: 25, lineHeight: 39, textAlign: 'right', writingDirection: 'rtl', color: colors.ink },
})
// A screen. `onRefresh` adds pull to refresh, and its spinner shows only for a pull the learner
// made: never for the refresh a screen does by itself on each visit, which is silent. (On iOS a
// refresh control set spinning from code adds a second spinner above the screen's own and can
// leave the page pushed down.)
export function Page({ children, onRefresh }: { children: ReactNode; onRefresh?: () => Promise<unknown> }) {
  const [pulling, setPulling] = useState(false)
  const pull = () => { setPulling(true); void onRefresh?.().catch(() => {}).finally(() => setPulling(false)) }
  return <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
    refreshControl={onRefresh ? <RefreshControl refreshing={pulling} tintColor={colors.green} onRefresh={pull} /> : undefined}>{children}</ScrollView>
}
// The one loading state, for a screen that has nothing yet to show. Once something is shown,
// refreshing it keeps it in place instead.
export function Loading() {
  return <View accessibilityLabel="Loading" style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={colors.green} /></View>
}
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)
// A Pressable that presses down a little under the finger and comes back up, with a light tap
// (`moment`, or none). Every button in the app is one of these.
export function Pressy({ moment = 'press', onPressIn, onPressOut, style, depth = 0.97, ...props }: Omit<ComponentProps<typeof Pressable>, 'style'> & { moment?: 'press' | 'tick' | 'select' | 'shutter' | null; style?: StyleProp<ViewStyle>; depth?: number }) {
  const scale = useSharedValue(1)
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }))
  return <AnimatedPressable {...props}
    onPressIn={(event: GestureResponderEvent) => { scale.set(settle(depth, DURATION.press)); if (moment) feel(moment); onPressIn?.(event) }}
    onPressOut={(event: GestureResponderEvent) => { scale.set(settle(1, DURATION.press)); onPressOut?.(event) }}
    style={[style, pressed]} />
}
// `detail` is an optional second line under the title (e.g. "3 days" on a grading button).
export function Button({ title, detail, onPress, disabled, secondary, busy, style, moment }: { title: string; detail?: string; onPress: () => void; disabled?: boolean; secondary?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>; moment?: 'press' | 'tick' | 'select' | null }) {
  return <Pressy accessibilityRole="button" accessibilityLabel={detail ? `${title}, ${detail}` : undefined} accessibilityState={{ disabled: !!disabled || !!busy }} onPress={onPress} disabled={disabled || busy} moment={moment}
    style={[{ minHeight: 50, paddingHorizontal: 20, paddingVertical: detail ? 8 : 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: secondary ? colors.lime : colors.green, opacity: disabled || busy ? 0.5 : 1 }, style]}>
    {busy ? <ActivityIndicator color={secondary ? colors.green : colors.white} /> : <>
      <Text style={{ fontSize: 16, fontWeight: '600', color: secondary ? colors.green : colors.white }}>{title}</Text>
      {!!detail && <Text style={{ fontSize: 12, color: secondary ? colors.green : colors.white, opacity: 0.8 }}>{detail}</Text>}
    </>}
  </Pressy>
}
export function ErrorNotice({ message }: { message?: string | null }) {
  return message ? <Text accessibilityRole="alert" style={{ padding: 14, borderRadius: 12, backgroundColor: '#FBE7E6', color: colors.red, lineHeight: 23 }}>{message}</Text> : null
}
export function AccountGate() {
  return <View style={styles.card}><Text style={styles.heading}>Your Hebrew, everywhere</Text><Text style={styles.copy}>Sign in to use camera translation and access your saved passages and vocabulary.</Text><Button title="Sign in" onPress={() => router.push('/login')} /><Button secondary title="Create account" onPress={() => router.push('/signup')} /></View>
}
// Small toolbar toggle, e.g. "Vowels" / "English" in the reader.
export function Pill({ label, icon, leading, active, onPress, accessibilityLabel }: { label?: string; icon?: React.ComponentProps<typeof Ionicons>['name']; leading?: ReactNode; active?: boolean; onPress: () => void; accessibilityLabel?: string }) {
  return <Pressy moment="tick" depth={0.94} accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ selected: !!active }} onPress={onPress} hitSlop={6}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: active ? colors.green : colors.line, backgroundColor: active ? colors.lime : colors.white }}>
    {leading}{icon && <Ionicons name={icon} size={16} color={colors.green} />}{label && <Text style={{ fontSize: 14, fontWeight: '600', color: colors.green }}>{label}</Text>}
  </Pressy>
}
// Quiet, low-emphasis action (e.g. Sign out).
export function TextButton({ title, onPress, color = colors.muted }: { title: string; onPress: () => void; color?: string }) {
  return <Pressy moment={null} depth={0.95} accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ alignSelf: 'center', padding: 10 }}><Text style={{ fontSize: 15, fontWeight: '600', color }}>{title}</Text></Pressy>
}

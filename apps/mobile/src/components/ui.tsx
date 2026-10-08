import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle, type RefreshControlProps } from 'react-native'
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
export function Page({ children, refreshControl }: { children: ReactNode; refreshControl?: React.ReactElement<RefreshControlProps> }) {
  return <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>{children}</ScrollView>
}
export function Button({ title, onPress, disabled, secondary, busy, style }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; busy?: boolean; style?: StyleProp<ViewStyle> }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled || !!busy }} onPress={onPress} disabled={disabled || busy}
    style={({ pressed }) => [{ minHeight: 50, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: secondary ? colors.lime : colors.green, opacity: disabled || busy ? 0.5 : pressed ? 0.75 : 1 }, style]}>
    {busy ? <ActivityIndicator color={secondary ? colors.green : colors.white} /> : <Text style={{ fontSize: 16, fontWeight: '600', color: secondary ? colors.green : colors.white }}>{title}</Text>}
  </Pressable>
}
export function ErrorNotice({ message }: { message?: string | null }) {
  return message ? <Text accessibilityRole="alert" style={{ padding: 14, borderRadius: 12, backgroundColor: '#FBE7E6', color: colors.red, lineHeight: 23 }}>{message}</Text> : null
}
export function AccountGate() {
  return <View style={styles.card}><Text style={styles.heading}>Your Hebrew, everywhere</Text><Text style={styles.copy}>Sign in to use camera translation and access your saved passages and vocabulary.</Text><Button title="Sign in" onPress={() => router.push('/login')} /><Button secondary title="Create account" onPress={() => router.push('/signup')} /></View>
}
// Small toolbar toggle, e.g. "Vowels" / "English" in the reader.
export function Pill({ label, icon, active, onPress, accessibilityLabel }: { label?: string; icon?: React.ComponentProps<typeof Ionicons>['name']; active?: boolean; onPress: () => void; accessibilityLabel?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ selected: !!active }} onPress={onPress} hitSlop={6}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: active ? colors.green : colors.line, backgroundColor: active ? colors.lime : colors.white, opacity: pressed ? 0.7 : 1 })}>
    {icon && <Ionicons name={icon} size={16} color={colors.green} />}{label && <Text style={{ fontSize: 14, fontWeight: '600', color: colors.green }}>{label}</Text>}
  </Pressable>
}
// Quiet, low-emphasis action (e.g. Sign out).
export function TextButton({ title, onPress, color = colors.muted }: { title: string; onPress: () => void; color?: string }) {
  return <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={({ pressed }) => ({ alignSelf: 'center', padding: 10, opacity: pressed ? 0.6 : 1 })}><Text style={{ fontSize: 15, fontWeight: '600', color }}>{title}</Text></Pressable>
}

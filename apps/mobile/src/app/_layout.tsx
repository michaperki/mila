import { useEffect } from 'react'
import type { ErrorBoundaryProps } from 'expo-router'
import { router, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { startFeedback } from '../lib/feedback'
import { startSpeech } from '../lib/speech'
import { SessionProvider, useSession } from '../state/session'
import { Button, colors, styles } from '../components/ui'
import { identify, reportCrash, startCrashReporting, wrapRoot } from '../lib/crashes'

startCrashReporting()
function Navigator() {
  const { ready, session } = useSession()
  useEffect(() => identify(session?.user.id ?? null), [session?.user.id])
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.paper }}><ActivityIndicator color={colors.green} /></View>
  return <><StatusBar style="dark" /><Stack screenOptions={{ headerTintColor: colors.ink, headerStyle: { backgroundColor: colors.paper }, headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal', contentStyle: { backgroundColor: colors.paper }, orientation: 'portrait_up' }}>
    {/* Home is the tree with Read and Study; everything else opens from it. */}
    <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
    <Stack.Screen name="library" options={{ title: 'Library' }} />
    <Stack.Screen name="vocabulary" options={{ title: 'Your words' }} />
    <Stack.Screen name="account" options={{ title: 'Account' }} />
    <Stack.Screen name="login" options={{ title: 'Sign in' }} />
    <Stack.Screen name="signup" options={{ title: 'Create account' }} />
    <Stack.Screen name="camera" options={{ title: 'Read a page' }} />
    {/* The reader also turns sideways, for a book held in landscape or longer lines; every other
        screen stays upright. (app.json allows landscape for the app as a whole.) */}
    <Stack.Screen name="reader" options={{ title: 'Read & learn', orientation: 'default' }} />
    <Stack.Screen name="compose" options={{ title: 'Read Hebrew text' }} />
    <Stack.Screen name="practice" options={{ title: 'Practice' }} />
    <Stack.Screen name="word" options={{ title: 'Word' }} />
    <Stack.Screen name="table" options={{ title: 'All forms' }} />
    <Stack.Screen name="root" options={{ title: 'Root' }} />
  </Stack></>
}
// A screen that throws while drawing shows this instead of closing the app, and the error is
// reported. Try again draws the screen again; Home leaves it.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => reportCrash(error), [error])
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.paper }}>
    <Text style={styles.heading}>Something went wrong on this screen.</Text>
    <Text style={styles.copy}>It has been reported. You can try again, or go back Home; your words and passages are safe.</Text>
    <Button title="Try again" onPress={() => { void retry() }} />
    <Button secondary title="Home" onPress={() => { router.replace('/') }} />
  </View>
}
function RootLayout() {
  useEffect(() => { void startFeedback(); void startSpeech() }, [])
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><SessionProvider><Navigator /></SessionProvider></SafeAreaProvider></GestureHandlerRootView>
}
export default wrapRoot(RootLayout)

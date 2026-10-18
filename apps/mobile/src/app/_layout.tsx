import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { startFeedback } from '../lib/feedback'
import { startSpeech } from '../lib/speech'
import { SessionProvider, useSession } from '../state/session'
import { colors } from '../components/ui'
function Navigator() {
  const { ready } = useSession()
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.paper }}><ActivityIndicator color={colors.green} /></View>
  return <><StatusBar style="dark" /><Stack screenOptions={{ headerTintColor: colors.ink, headerStyle: { backgroundColor: colors.paper }, headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal', contentStyle: { backgroundColor: colors.paper } }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="login" options={{ title: 'Sign in' }} />
    <Stack.Screen name="signup" options={{ title: 'Create account' }} />
    <Stack.Screen name="camera" options={{ title: 'Read a page' }} />
    <Stack.Screen name="reader" options={{ title: 'Read & learn' }} />
    <Stack.Screen name="compose" options={{ title: 'Read Hebrew text' }} />
    <Stack.Screen name="practice" options={{ title: 'Practice' }} />
    <Stack.Screen name="word" options={{ title: 'Word' }} />
    <Stack.Screen name="table" options={{ title: 'All forms' }} />
    <Stack.Screen name="root" options={{ title: 'Root' }} />
  </Stack></>
}
export default function RootLayout() {
  useEffect(() => { void startFeedback(); void startSpeech() }, [])
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><SessionProvider><Navigator /></SessionProvider></SafeAreaProvider></GestureHandlerRootView>
}

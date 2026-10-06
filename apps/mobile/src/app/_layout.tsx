import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SessionProvider, useSession } from '../state/session'
import { colors } from '../components/ui'
function Navigator() {
  const { ready } = useSession()
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.paper }}><ActivityIndicator color={colors.green} /></View>
  return <><StatusBar style="dark" /><Stack screenOptions={{ headerTintColor: colors.ink, headerStyle: { backgroundColor: colors.paper }, headerShadowVisible: false, contentStyle: { backgroundColor: colors.paper } }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="login" options={{ title: 'Sign in' }} />
    <Stack.Screen name="signup" options={{ title: 'Create account' }} />
    <Stack.Screen name="reader" options={{ title: 'Read & learn' }} />
    <Stack.Screen name="compose" options={{ title: 'Read Hebrew text' }} />
  </Stack></>
}
export default function RootLayout() { return <SafeAreaProvider><SessionProvider><Navigator /></SessionProvider></SafeAreaProvider> }

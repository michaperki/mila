import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native'
import { Redirect, router } from 'expo-router'
import { Button, ErrorNotice, Page, styles } from './ui'
import { useSession } from '../state/session'
import { Bonsai } from '../bonsai/Bonsai'
export default function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const { session, authenticate } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (session) return <Redirect href="/" />
  const submit = async () => {
    if (busy) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email address.'); return }
    if (!password || (mode === 'signup' && password.length < 4)) { setError(mode === 'signup' ? 'Use at least 4 characters for your password.' : 'Enter your password.'); return }
    setBusy(true); setError(null)
    try { await authenticate(mode, email, password); router.replace('/') } catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}><Page>
    {/* The sapling every learner starts with; it grows as they read and study. */}
    <Bonsai growth={8} overgrowth={0} vitality={92} interactive={false} haptics={false} style={{ height: 210, marginHorizontal: -22, marginTop: -22 }} />
    <Text style={styles.eyebrow}>HEBREW, IN YOUR EVERYDAY</Text>
    <Text style={styles.title}>{mode === 'signup' ? 'Make it yours.' : 'Welcome back.'}</Text>
    <Text style={styles.copy}>Your Mila account keeps every passage and word together, safe if you change phones.</Text>
    <View><Text style={styles.label}>Email</Text><TextInput accessibilityLabel="Email" style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" /></View>
    <View><Text style={styles.label}>Password</Text><TextInput accessibilityLabel="Password" style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} textContentType={mode === 'signup' ? 'newPassword' : 'password'} returnKeyType="go" onSubmitEditing={() => void submit()} /></View>
    <ErrorNotice message={error} /><Button title={mode === 'signup' ? 'Create account' : 'Sign in'} busy={busy} onPress={() => void submit()} />
    <Button secondary title={mode === 'signup' ? 'Already a member? Sign in' : 'New to Mila? Create account'} onPress={() => router.replace(mode === 'signup' ? '/login' : '/signup')} />
  </Page></KeyboardAvoidingView>
}

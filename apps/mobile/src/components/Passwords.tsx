import { useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { Button, ErrorNotice, styles } from './ui'
import { request } from '../lib/api'
import type { Session } from '../lib/types'

// Account → Password: a new one, given the current one (also how a temporary one is replaced).
export function ChangePassword({ session }: { session: Session }) {
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const submit = async () => {
    if (busy) return
    if (newPassword.length < 8) { setError('Use at least 8 characters for your new password.'); return }
    setBusy(true); setError(null); setDone(false)
    try { await request('auth', { token: session.token, body: { mode: 'change', password, newPassword } }); setPassword(''); setNewPassword(''); setDone(true) }
    catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }
  return <View style={styles.card}>
    <Text style={styles.heading}>Password</Text>
    <View><Text style={styles.label}>Current password</Text><TextInput accessibilityLabel="Current password" style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" /></View>
    <View><Text style={styles.label}>New password</Text><TextInput accessibilityLabel="New password" style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" onSubmitEditing={() => void submit()} /></View>
    <ErrorNotice message={error} />
    {done && <Text style={styles.copy}>Your password was changed.</Text>}
    <Button secondary title="Change password" busy={busy} disabled={!password || !newPassword} onPress={() => void submit()} />
  </View>
}

// Account → Reset a password, for the developers only: a temporary password for a tester who
// forgot theirs, to send them; they change it under Password.
export function ResetPassword({ session }: { session: Session }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const submit = async () => {
    if (busy || !email.trim()) return
    setBusy(true); setError(null); setResult(null)
    try {
      const { password } = await request<{ password: string }>('auth', { token: session.token, body: { mode: 'reset', email } })
      setResult(`Temporary password for ${email.trim().toLowerCase()}: ${password}`)
    } catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }
  return <View style={styles.card}>
    <Text style={styles.heading}>Reset a tester&apos;s password</Text>
    <Text style={[styles.copy, { fontSize: 13 }]}>Only you see this, as a developer. Send them the temporary password; they can change it under Password.</Text>
    <TextInput accessibilityLabel="Tester's email" style={styles.input} value={email} onChangeText={setEmail} placeholder="Their email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
    <ErrorNotice message={error} />
    {!!result && <Text selectable style={styles.copy}>{result}</Text>}
    <Button secondary title="Make a temporary password" busy={busy} disabled={!email.trim()} onPress={() => void submit()} />
  </View>
}

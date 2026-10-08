import { useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Button, colors, ErrorNotice, Pill, styles } from './ui'
import { request } from '../lib/api'
import { appInfo } from '../lib/app-info'
import { useSession } from '../state/session'

// "Report" for testing in the field: a note plus a snapshot of what the app saw,
// captured at the moment the button was tapped. Read them with `npm run feedback` in apps/web.
export function FeedbackButton({ screen, context, variant = 'pill' }: { screen: string; context: () => unknown; variant?: 'pill' | 'overlay' }) {
  const { session } = useSession()
  const [snapshot, setSnapshot] = useState<unknown>(undefined)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const start = () => {
    if (!session) { router.push('/login'); return }
    setSnapshot(context()); setNote(''); setError(null); setSent(false); setOpen(true)
  }
  const send = async () => {
    if (!session || !note.trim() || busy) return
    setBusy(true); setError(null)
    try { await request('feedback', { token: session.token, body: { note, screen, context: snapshot, app: appInfo() } }); setSent(true); setTimeout(() => setOpen(false), 900) }
    catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }
  return <>
    {variant === 'pill' ? <Pill icon="flag-outline" label="Report" onPress={start} accessibilityLabel="Report a problem" />
      : <Pressable accessibilityRole="button" accessibilityLabel="Report a problem" onPress={start} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="flag-outline" size={19} color={colors.white} /></Pressable>}
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' }}>
        <View style={{ backgroundColor: colors.paper, padding: 20, paddingBottom: 36, gap: 12, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}>
          <Text style={styles.heading}>What went wrong?</Text>
          <Text style={[styles.copy, { fontSize: 14 }]}>Your note is saved with the text Mila read and its translation on this screen. Photos are not included.</Text>
          <TextInput accessibilityLabel="Feedback note" autoFocus multiline maxLength={4000} value={note} onChangeText={setNote} placeholder="e.g. the price column turned into words" style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]} />
          <ErrorNotice message={error} />
          <Button title={sent ? 'Saved ✓' : 'Send report'} disabled={!note.trim() || sent} busy={busy} onPress={() => void send()} />
          <Button secondary title="Cancel" onPress={() => setOpen(false)} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>
}

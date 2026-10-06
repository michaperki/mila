import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Text, TextInput } from 'react-native'
import { router } from 'expo-router'
import { Button, ErrorNotice, Page, styles } from '../components/ui'
import { translate } from '../lib/recognition'
import { useSession } from '../state/session'
export default function Compose() {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { setRecognition } = useSession()
  const read = async () => {
    if (busy || !text.trim()) return
    setBusy(true); setError(null)
    try { const translation = await translate(text.trim()); setRecognition({ text: text.trim(), translation, capturedAt: Date.now() }); router.replace('/reader') }
    catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}><Page>
    <Text style={styles.title}>Start with a passage.</Text><Text style={styles.copy}>Paste or type Hebrew to translate it, explore words, and save it for later.</Text>
    <TextInput accessibilityLabel="Hebrew text" multiline maxLength={5000} style={[styles.input, styles.hebrew, { minHeight: 220, textAlignVertical: 'top' }]} value={text} onChangeText={setText} placeholder="הדביקו כאן טקסט בעברית" />
    <ErrorNotice message={error} /><Button title="Translate & read" disabled={!text.trim()} busy={busy} onPress={() => void read()} />
  </Page></KeyboardAvoidingView>
}

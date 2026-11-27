import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Text, TextInput } from 'react-native'
import { router } from '../lib/nav'
import { Button, ErrorNotice, Page, styles } from '../components/ui'
import { readText } from '../lib/recognition'
import { useSession } from '../state/session'
import { outcome, useOffer, useVisit } from '../lib/usage'
export default function Compose() {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { session, setRecognition } = useSession()
  const read = async () => {
    if (busy || !text.trim()) return
    setBusy(true); setError(null)
    try { setRecognition(await readText(text, { trimPageFurniture: false, token: session?.token })); outcome('compose', 'opened reader'); router.replace('/reader') }
    catch (failure) { outcome('compose', 'read failed'); setError((failure as Error).message) } finally { setBusy(false) }
  }
  // Usage (lib/usage.ts): Translate & read counts as offered once there is text to read.
  const visit = useVisit()
  const composePick = useOffer('compose', visit, ['type or paste', !!text.trim() && 'translate & read'])
  const typed = (next: string) => { if (!text && next) composePick('type or paste', { value: next.length > 1 ? 'paste' : 'type' }); setText(next) }
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}><Page>
    <Text style={styles.title}>Start with a passage.</Text><Text style={styles.copy}>Paste or type Hebrew to translate it, explore words, and save it for later.</Text>
    <TextInput accessibilityLabel="Hebrew text" multiline maxLength={5000} style={[styles.input, styles.hebrew, { minHeight: 220, textAlignVertical: 'top' }]} value={text} onChangeText={typed} placeholder="הדביקו כאן טקסט בעברית" />
    <ErrorNotice message={error} /><Button title="Translate & read" disabled={!text.trim()} busy={busy} onPress={() => { composePick('translate & read'); void read() }} />
  </Page></KeyboardAvoidingView>
}

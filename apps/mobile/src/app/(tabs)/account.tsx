import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { Alert, Linking, Switch, Text, View } from 'react-native'
import { AccountGate, Button, colors, ErrorNotice, Page, styles, TextButton } from '../../components/ui'
import { request } from '../../lib/api'
import { applyLatestUpdate, describeVersion } from '../../lib/app-info'
import { useSession } from '../../state/session'
import { useVowels } from '../../state/vowels'
// Account → AI usage: the `ai-usage` function's summary of this month's paid calls.
type Usage = { since: string; cost: number; requests: number; features: { feature: string; requests: number; cost: number }[] }
const FEATURES: Record<string, string> = { page: 'Page reads', word: 'Word explanations', ocr: 'Text recognition', translate: 'Translation' }
const dollars = (value: number) => (value > 0 && value < 0.01 ? '< $0.01' : `$${value.toFixed(2)}`)

export default function Account() {
  const { session, signOut, error: restoreError } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const checkForUpdate = async () => {
    setChecking(true); setUpdateStatus(null)
    try { if (!(await applyLatestUpdate())) setUpdateStatus('You have the latest version.') }
    catch { setUpdateStatus('Could not check for updates. Try again with a connection.') } finally { setChecking(false) }
  }
  const [showVowels, setShowVowels] = useVowels()
  const [usage, setUsage] = useState<Usage | null>(null)
  useFocusEffect(useCallback(() => {
    if (!session) return
    const controller = new AbortController()
    void request<Usage>('ai-usage', { token: session.token, signal: controller.signal }).then(setUsage, () => {})
    return () => controller.abort()
  }, [session]))
  const [vocabStatus, setVocabStatus] = useState<string | null>(null)
  const clearVocabulary = () => Alert.alert('Delete all saved words?', 'Every saved word and its practice history will be removed. This can\'t be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete all', style: 'destructive', onPress: () => {
      setVocabStatus(null)
      void request<{ deleted?: number }>('vocab?all=1', { token: session!.token, method: 'DELETE' })
        .then(data => setVocabStatus(`Deleted ${data.deleted ?? 0} ${data.deleted === 1 ? 'word' : 'words'}.`), (failure: Error) => setError(failure.message))
    } },
  ])
  return <Page>
    <ErrorNotice message={error || restoreError} />
    {session ? <View style={styles.card}><Text style={styles.heading}>{session.user.email}</Text><Text style={styles.copy}>{session.user.tier === 'premium' ? 'Premium' : 'Free'} account · shared with Mila on the web</Text></View> : <AccountGate />}
    <View style={styles.card}>
      <Text style={styles.heading}>Camera privacy</Text>
      <Text style={styles.copy}>Images are sent to Google for text recognition and are not stored by Mila.</Text>
      {privacyOpen ? <>
        <Text style={styles.copy}>Only passages you choose to save are added to your library.</Text>
        <Text style={styles.copy}>Live preview is off until you turn it on in the camera. It samples a few images instead of every video frame, needs internet, and pauses after a short session.</Text>
        <TextButton title="Show less" onPress={() => setPrivacyOpen(false)} />
      </> : <TextButton title="Learn more" onPress={() => setPrivacyOpen(true)} />}
    </View>
    <View style={styles.card}>
      <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap', gap: 12 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.heading}>Vowel marks (niqqud)</Text>
          <Text style={styles.copy}>In the reader, word explanations, flashcards and your word list.</Text>
        </View>
        <Switch value={showVowels} onValueChange={setShowVowels} trackColor={{ true: colors.green }} accessibilityLabel="Vowel marks" />
      </View>
    </View>
    <Button secondary title="Open Mila on the web" onPress={() => { void Linking.openURL('https://mila-hebrew.netlify.app/') }} />
    <View style={styles.card}>
      <Text style={styles.heading}>App version</Text>
      <Text style={styles.copy}>{describeVersion()}</Text>
      {!!updateStatus && <Text style={styles.copy}>{updateStatus}</Text>}
      <Button secondary title="Check for updates" busy={checking} onPress={() => void checkForUpdate()} />
    </View>
    {session && !!usage && <View style={styles.card}>
      <Text style={styles.heading}>AI usage this month</Text>
      <Text style={{ fontSize: 30, fontWeight: '700', color: colors.ink }}>{dollars(usage.cost)}</Text>
      {usage.features.map(row => <View key={row.feature} style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
        <Text style={styles.copy}>{FEATURES[row.feature] || row.feature} · {row.requests}</Text>
        <Text style={[styles.copy, { color: colors.ink }]}>{dollars(row.cost)}</Text>
      </View>)}
      <Text style={[styles.copy, { fontSize: 13 }]}>Estimated at list prices, before free tiers.</Text>
    </View>}
    {session && <View style={styles.card}>
      <Text style={styles.heading}>Saved words</Text>
      {!!vocabStatus && <Text style={styles.copy}>{vocabStatus}</Text>}
      <TextButton title="Delete all saved words" color={colors.red} onPress={clearVocabulary} />
    </View>}
    {session && <TextButton title="Sign out" onPress={() => { void signOut().catch(e => setError(e.message)) }} />}
  </Page>
}

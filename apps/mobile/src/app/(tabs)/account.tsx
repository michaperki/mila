import { useState } from 'react'
import { Alert, Linking, Text, View } from 'react-native'
import { AccountGate, Button, colors, ErrorNotice, Page, styles, TextButton } from '../../components/ui'
import { request } from '../../lib/api'
import { applyLatestUpdate, describeVersion } from '../../lib/app-info'
import { useSession } from '../../state/session'
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
    <Button secondary title="Open Mila on the web" onPress={() => { void Linking.openURL('https://mila-hebrew.netlify.app/') }} />
    <View style={styles.card}>
      <Text style={styles.heading}>App version</Text>
      <Text style={styles.copy}>{describeVersion()}</Text>
      {!!updateStatus && <Text style={styles.copy}>{updateStatus}</Text>}
      <Button secondary title="Check for updates" busy={checking} onPress={() => void checkForUpdate()} />
    </View>
    {session && <View style={styles.card}>
      <Text style={styles.heading}>Saved words</Text>
      {!!vocabStatus && <Text style={styles.copy}>{vocabStatus}</Text>}
      <TextButton title="Delete all saved words" color={colors.red} onPress={clearVocabulary} />
    </View>}
    {session && <TextButton title="Sign out" onPress={() => { void signOut().catch(e => setError(e.message)) }} />}
  </Page>
}

import { useState } from 'react'
import { Linking, Text, View } from 'react-native'
import { AccountGate, Button, ErrorNotice, Page, styles, TextButton } from '../../components/ui'
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
    {session && <TextButton title="Sign out" onPress={() => { void signOut().catch(e => setError(e.message)) }} />}
  </Page>
}

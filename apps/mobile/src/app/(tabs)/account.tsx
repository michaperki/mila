import { useState } from 'react'
import { Linking, Text, View } from 'react-native'
import { AccountGate, Button, ErrorNotice, Page, styles } from '../../components/ui'
import { useSession } from '../../state/session'
export default function Account() {
  const { session, signOut, error: restoreError } = useSession()
  const [error, setError] = useState<string | null>(null)
  return <Page><Text style={styles.eyebrow}>YOUR MILA</Text><Text style={styles.title}>A little Hebrew, every day.</Text>
    <ErrorNotice message={error || restoreError} />
    {session ? <View style={styles.card}><Text style={styles.heading}>{session.user.email}</Text><Text style={styles.copy}>{session.user.tier === 'premium' ? 'Premium' : 'Free'} account · shared with Mila on the web</Text><Button secondary title="Sign out" onPress={() => { void signOut().catch(e => setError(e.message)) }} /></View> : <AccountGate />}
    <View style={styles.card}><Text style={styles.heading}>Camera privacy</Text><Text style={styles.copy}>When you translate a photo or start Live preview, selected images are sent to Google through Mila for text recognition. Images are not stored by Mila’s server. Only passages you choose to save are added to your library.</Text><Text style={styles.copy}>Live preview is experimental. It samples images rather than translating every video frame, needs internet, and stops automatically after a short session.</Text></View>
    <Button secondary title="Open Mila on the web" onPress={() => { void Linking.openURL('https://mila-hebrew.netlify.app/') }} />
  </Page>
}

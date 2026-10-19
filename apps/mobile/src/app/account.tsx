import { useCallback, useState } from 'react'
import { router, useFocusEffect } from 'expo-router'
import { Alert, Switch, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { AccountGate, Button, colors, ErrorNotice, Page, Pressy, styles, TextButton } from '../components/ui'
import { request } from '../lib/api'
import { applyLatestUpdate, describeVersion } from '../lib/app-info'
import { useSession } from '../state/session'
import { clearVocab } from '../state/vocab'
import { useVowels } from '../state/vowels'
import { feedbackSettings, setFeedback } from '../lib/feedback'
import { setVoice, speak, useSpeech, VOICES, type Voice } from '../lib/speech'
import { ListenButton } from '../components/Listen'
import { getPref, setPref } from '../lib/prefs'
import { lastTree, plantedOn, type Tree } from '../lib/tree'
// Account → AI spend, for the developers only (ADMIN_EMAILS on the server; everyone else gets a
// 403 and sees nothing): this month's paid calls across all learners, by feature and by learner,
// and how many answers came from the cache instead (free).
type Usage = { since: string; cost: number; requests: number; features: { feature: string; requests: number; cacheHits?: number; cost: number }[]; users: { email: string; requests: number; cost: number }[] }
const FEATURES: Record<string, string> = { page: 'Page reads', word: 'Word explanations', glosses: 'Sentence meanings', forms: 'Practice cards', table: 'Tables of forms', root: 'Root families', ocr: 'Text recognition', translate: 'Translation', speech: 'Listening' }
// Played when a voice is picked, so the choice is heard straight away.
const SAMPLE = 'מָחָר יֵשׁ לִי מִבְחָן בְּחֶשְׁבּוֹן.'
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
  const [feelings, setFeelings] = useState(feedbackSettings)
  const toggle = (name: 'sounds' | 'haptics', value: boolean) => { setFeedback(name, value); setFeelings(feedbackSettings()) }
  const { voice } = useSpeech()
  const chooseVoice = (id: Voice) => { setVoice(id); void speak(SAMPLE, session?.token, `sample-${id}`) }
  const [usage, setUsage] = useState<Usage | null>(null)
  const [tree, setTree] = useState<Tree | null>(null)
  const [sway, setSway] = useState(true)
  useFocusEffect(useCallback(() => {
    void lastTree(session).then(setTree)
    void getPref('treeMotion').then(setSway)
  }, [session]))
  const chooseSway = (value: boolean) => { setSway(value); setPref('treeMotion', value) }
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
        .then(data => { clearVocab(session!); setVocabStatus(`Deleted ${data.deleted ?? 0} ${data.deleted === 1 ? 'word' : 'words'}.`) }, (failure: Error) => setError(failure.message))
    } },
  ])
  const [deleting, setDeleting] = useState(false)
  // Everything kept for the account goes (the `account` function); then this phone signs out.
  const deleteAccount = () => Alert.alert('Delete your account?', 'Your account, saved words, passages, practice history and tree are deleted for good. This can\'t be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete account', style: 'destructive', onPress: () => {
      setDeleting(true); setError(null)
      void request('account', { token: session!.token, method: 'DELETE' })
        .then(async () => { clearVocab(session!); await signOut(); router.replace('/'); Alert.alert('Your account was deleted.') }, (failure: Error) => setError(failure.message))
        .finally(() => setDeleting(false))
    } },
  ])
  return <Page>
    <ErrorNotice message={error || restoreError} />
    {session ? <View style={styles.card}><Text style={styles.heading}>{session.user.email}</Text><Text style={styles.copy}>{session.user.tier === 'premium' ? 'Premium' : 'Free'} account</Text></View> : <AccountGate />}
    <View style={styles.card}>
      <SwitchRow title="Tree in the wind" detail={`${tree && plantedOn(tree) ? `${plantedOn(tree)}. ` : ''}Your tree sways gently on Home. It stays still when Reduce Motion is on.`} value={sway} onChange={chooseSway} />
    </View>
    <View style={styles.card}>
      <Text style={styles.heading}>Camera privacy</Text>
      <Text style={styles.copy}>{'Photos are sent to Google to find the text and, when you read a page, to Anthropic\'s Claude to correct and translate it. Mila doesn\'t keep your photos.'}</Text>
      {privacyOpen ? <>
        <Text style={styles.copy}>Only passages you choose to save are added to your library.</Text>
        <Text style={styles.copy}>{'Words and sentences you look up are sent to Anthropic\'s Claude to explain them, and text you listen to is sent to ElevenLabs or Google to be read aloud.'}</Text>
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
    <View style={styles.card}>
      <Text style={styles.heading}>Voice</Text>
      <Text style={styles.copy}>Reads Hebrew aloud in the reader, practice and word pages.{session ? '' : ' Sign in to use these voices; until then your phone\'s own voice reads.'}</Text>
      {VOICES.map(option => <Pressy key={option.id} moment="select" accessibilityRole="radio" accessibilityState={{ checked: voice === option.id }} accessibilityLabel={`${option.name}, ${option.detail}`} onPress={() => chooseVoice(option.id)}
        style={[styles.row, { flexWrap: 'nowrap', gap: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: voice === option.id ? colors.green : colors.line, backgroundColor: voice === option.id ? colors.lime : colors.white }]}>
        <Ionicons name={voice === option.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.green} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.heading, { fontSize: 16 }]}>{option.name}</Text>
          <Text style={[styles.copy, { fontSize: 13 }]}>{option.detail}</Text>
        </View>
      </Pressy>)}
      <View style={[styles.row, { gap: 8, flexWrap: 'nowrap' }]}>
        <ListenButton text={SAMPLE} accessibilityLabel="Hear the selected voice" />
        <Text style={[styles.copy, { flex: 1, fontSize: 13 }]}>Tap the speed to switch between normal, half and quarter speed. It applies everywhere.</Text>
      </View>
    </View>
    <View style={styles.card}>
      <SwitchRow title="Sounds" detail="Short sounds in practice and when you save a word. They follow the silent switch." value={feelings.sounds} onChange={value => toggle('sounds', value)} />
      <SwitchRow title="Haptics" detail="Taps you feel when you press, select and answer." value={feelings.haptics} onChange={value => toggle('haptics', value)} />
    </View>
    <View style={styles.card}>
      <Text style={styles.heading}>App version</Text>
      <Text style={styles.copy}>{describeVersion()}</Text>
      {!!updateStatus && <Text style={styles.copy}>{updateStatus}</Text>}
      <Button secondary title="Check for updates" busy={checking} onPress={() => void checkForUpdate()} />
    </View>
    {session && !!usage && <View style={styles.card}>
      <Text style={styles.heading}>AI spend this month · everyone</Text>
      <Text style={[styles.copy, { fontSize: 13 }]}>Only you see this, as a developer.</Text>
      <Text style={{ fontSize: 30, fontWeight: '700', color: colors.ink }}>{dollars(usage.cost)}</Text>
      {usage.features.map(row => <View key={row.feature} style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
        <Text style={styles.copy}>{FEATURES[row.feature] || row.feature} · {row.requests}{row.cacheHits ? ` · ${row.cacheHits} cached` : ''}</Text>
        <Text style={[styles.copy, { color: colors.ink }]}>{dollars(row.cost)}</Text>
      </View>)}
      {usage.users.map(row => <View key={row.email} style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
        <Text style={[styles.copy, { flex: 1 }]} numberOfLines={1}>{row.email} · {row.requests}</Text>
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
    {session && <TextButton title={deleting ? 'Deleting account…' : 'Delete account'} color={colors.red} onPress={() => { if (!deleting) deleteAccount() }} />}
  </Page>
}

function SwitchRow({ title, detail, value, onChange }: { title: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap', gap: 12 }]}>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.copy}>{detail}</Text>
    </View>
    <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.green }} accessibilityLabel={title} />
  </View>
}

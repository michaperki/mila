import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { stop as stopSpeaking } from '../lib/speech'
import { ListenButton } from '../components/Listen'
import Animated from 'react-native-reanimated'
import { REFLOW } from '../lib/motion'
import { colors, ErrorNotice, Loading, Page, styles, TextButton } from '../components/ui'
import { feel } from '../lib/feedback'
import { EncounterView } from '../components/Encounter'
import { request } from '../lib/api'
import { isolateHebrew } from '../lib/bidi'
import { textFromDocument } from '../lib/documents'
import { formsIn, isKnownWord, isSolid, kindLabel, missingStages, slotLabel, stagesOf, stageState, type StageState, statusOf } from '../lib/forms'
import { stripNiqqud } from '../lib/ocr-cleanup'
import type { FormCard, TextDoc } from '../lib/types'
import { withVowels } from '../lib/vowels'
import { ensureForms } from '../lib/word-forms'
import { encountersOf } from '../lib/words'
import { useSession } from '../state/session'
import { cachedVocab, dropEntry, putEntry, useVocab } from '../state/vocab'
import { useVowels } from '../state/vowels'

// Saved word ids hold a percent-encoded lemma (native-%D7%9C…), and the router decodes the
// query string, so the id arrives as native-ל…. Compare them decoded.
const decoded = (value: string) => { try { return decodeURIComponent(value) } catch { return value } }
const sameId = (a: string, b: string) => a === b || decoded(a) === decoded(b)

const STATE: Record<StageState, string> = { known: 'Known', done: 'Learned', learning: 'Learning', locked: 'Locked' }

// One saved word: what it means and what kind of word it is, its stages (meanings first, then
// its forms) with how each is going, and where it was met. "I know this word" takes it out of
// studying; "Know these" marks one stage known so the next opens. Nothing is quizzed here.
export default function Word() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session, setRecognition } = useSession()
  const [showVowels] = useVowels()
  const v = (text: string) => withVowels(text, showVowels)
  // The word from the saved words already loaded, so it shows at once; the visit refreshes them.
  const { entries, loaded, error: loadError } = useVocab(session)
  const entry = entries.find(item => sameId(item.id, id)) ?? null
  const [error, setError] = useState<string | null>(null)
  // Stage sections opened or closed by hand; otherwise a stage being learned is open, the rest closed.
  const [folded, setFolded] = useState<Record<string, boolean>>({})

  // Writes cards for open stages that have none, then shows them: when the word opens, when a
  // stage is marked known, and again on "Prepare these forms" after a failure. `tried` is the
  // word and stages last attempted, so a failure isn't retried on every refresh.
  const [tried, setTried] = useState<string | null>(null)
  const attempt = entry ? `${entry.id}:${missingStages(entry).join()}` : ''
  const preparing = !!entry && missingStages(entry).length > 0 && tried !== attempt
  useEffect(() => {
    if (!session || !entry || !preparing) return
    void ensureForms(entry, session.token)
      .then(ready => { const latest = cachedVocab(session)?.find(item => item.id === ready.id); if (latest) putEntry(session, { ...latest, forms: ready.forms }) })
      .finally(() => setTried(attempt))
    // Runs for each new attempt, not on every refresh of the word.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, attempt, preparing])
  useFocusEffect(useCallback(() => () => stopSpeaking(), []))

  if (!session) return <Page><Text style={styles.copy}>Sign in to see your saved words.</Text></Page>
  if (!entry) return <Page>{loaded ? <ErrorNotice message={loadError || error || 'This word is no longer saved.'} /> : <Loading />}</Page>

  const setKnown = (known: string[]) => {
    putEntry(session, { ...entry, known })
    void request('vocab', { token: session.token, method: 'PATCH', body: { id: entry.id, known } })
      .catch((failure: Error) => { setError(failure.message); putEntry(session, entry) })
  }
  const openPassage = async (textId: string) => {
    try {
      const data = await request<{ texts?: TextDoc[] }>('texts', { token: session.token })
      const doc = data.texts?.find(item => item.id === textId)
      if (!doc) { setError('That passage is no longer in your library.'); return }
      setRecognition(textFromDocument(doc)); router.push('/reader')
    } catch (failure) { setError((failure as Error).message) }
  }
  const remove = () => Alert.alert('Delete this word?', `${v(entry.lemma)} and its practice history will be removed.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => {
      void request(`vocab?id=${encodeURIComponent(entry.id)}`, { token: session.token, method: 'DELETE' })
        .then(() => { router.back(); dropEntry(session, entry.id) }, (failure: Error) => setError(failure.message))
    } },
  ])
  const grammar = [kindLabel(entry), entry.binyan, entry.root && `root ${entry.root}`].filter(Boolean).join(' · ')
  const known = entry.known || []
  const stages = stagesOf(entry)
  const open = stages.filter(stage => stageState(entry, stage.key) !== 'locked')
  const locked = stages.filter(stage => stageState(entry, stage.key) === 'locked')
  const inPlay = open.flatMap(stage => (known.includes(stage.key) ? [] : formsIn(entry, stage.key)))
  const wordKnown = isKnownWord(entry)
  // "I know this word" marks every stage known (it leaves studying); "Know these" marks one stage.
  const knowWord = () => { feel('unlock'); setKnown(stages.map(stage => stage.key)) }

  return <Page>
    {/* The word itself is the screen's title. */}
    <Stack.Screen options={{ title: v(entry.lemma) }} />
    <ErrorNotice message={error} />
    <View style={{ gap: 2 }}>
      <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
        <ListenButton text={entry.lemma} accessibilityLabel="Hear this word" size={24} />
        <Text style={word.lemma}>{v(entry.lemma)}</Text>
      </View>
      <Text style={word.gloss}>{isolateHebrew(v(entry.gloss))}</Text>
      {!!grammar && <Text style={word.meta}>{isolateHebrew(grammar)}</Text>}
    </View>
    <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
      <Text style={[word.pill, wordKnown && word.pillDone]}>
        {wordKnown ? 'Known' : statusOf(entry) === 'mastered' ? 'Learned' : inPlay.length ? `${inPlay.filter(isSolid).length} of ${inPlay.length} solid` : 'New'}
      </Text>
      {wordKnown
        ? <TextButton title="Undo" onPress={() => { feel('tick'); setKnown([]) }} />
        : <TextButton title="I know this word" color={colors.green} onPress={knowWord} />}
    </View>

    {open.map(stage => {
      const state = stageState(entry, stage.key)
      const forms = formsIn(entry, stage.key)
      const shown = folded[stage.key] ?? (state === 'learning')
      const meanings = stage.key === 'meanings'
      return <Animated.View key={stage.key} layout={REFLOW} style={[styles.card, word.section]}>
        <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: shown }} onPress={() => setFolded(current => ({ ...current, [stage.key]: !shown }))}
            hitSlop={8} style={[styles.row, { gap: 6, flexShrink: 1 }]}>
            <Ionicons name={shown ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.muted} />
            <Text style={word.stage}>{stage.label}</Text>
            <Text style={[word.state, (state === 'known' || state === 'done') && { color: colors.green }]}>
              {state === 'learning' ? (forms.length ? `${forms.filter(isSolid).length}/${forms.length}` : '') : STATE[state]}
            </Text>
          </Pressable>
          {state === 'learning' && !wordKnown && <TextButton title="Know these" color={colors.green} onPress={() => { feel('unlock'); setKnown([...known, stage.key]) }} />}
          {state === 'known' && !wordKnown && <TextButton title="Undo" onPress={() => { feel('tick'); setKnown(known.filter(key => key !== stage.key)) }} />}
        </View>
        {shown && forms.map(form => (meanings
          ? <MeaningRow key={form.key} form={form} lemma={entry.lemma} v={v} />
          : <FormRow key={form.key} label={slotLabel(entry, form)} form={form} v={v} />))}
        {shown && !forms.length && (preparing ? <ActivityIndicator color={colors.green} style={{ alignSelf: 'flex-start' }} />
          : <TextButton title="Prepare these" color={colors.green} onPress={() => setTried(null)} />)}
      </Animated.View>
    })}
    {locked.length > 0 && <Text style={word.meta}>Next: {locked.map(stage => stage.label).join(', ')}. They open as the forms above become solid, or as you mark them known.</Text>}

    {encountersOf(entry).length > 0 && <View style={[styles.card, { gap: 4 }]}>
      <Text style={word.stage}>Where you met it</Text>
      {encountersOf(entry).map(encounter => <EncounterView key={`${encounter.context}-${encounter.at}`} encounter={encounter} showVowels={showVowels}
        footer={encounter.sourceRef ? <TextButton title="Open passage" color={colors.green} onPress={() => void openPassage(encounter.sourceRef!.textId)} /> : undefined} />)}
    </View>}
    <TextButton title="Delete word" color={colors.red} onPress={remove} />
  </Page>
}

const Dot = ({ form }: { form: FormCard }) => <View style={[word.dot, form.review && { backgroundColor: colors.lime, borderColor: colors.green }, isSolid(form) && { backgroundColor: colors.green, borderColor: colors.green }]} />

// One meaning: what it means, and the sentence it is practised in. The Hebrew is the word at the
// top, so it is only shown when this meaning uses another form of it.
function MeaningRow({ form, lemma, v }: { form: FormCard; lemma: string; v: (text: string) => string }) {
  const other = stripNiqqud(form.he) !== stripNiqqud(lemma)
  return <View style={word.formRow}>
    <Dot form={form} />
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={word.meaning}>{form.en}{other ? <Text style={word.formInline}>{`  ${isolateHebrew(v(form.he))}`}</Text> : null}</Text>
      {!!form.sentence && <Text style={word.example} numberOfLines={2}>{v(form.sentence)}</Text>}
    </View>
  </View>
}

// One form: who or what it is for, its English, and the Hebrew, which can be heard. The dot says
// how it's going (hollow: not practised yet, lime: learning, green: solid).
function FormRow({ label, form, v }: { label: string; form: FormCard; v: (text: string) => string }) {
  return <View style={word.formRow}>
    <Dot form={form} />
    <View style={{ flex: 1 }}>
      <Text style={word.formLabel}>{label}</Text>
      <Text style={word.meta} numberOfLines={1}>{form.en}</Text>
    </View>
    <Text style={word.form}>{v(form.he)}</Text>
    <ListenButton text={form.he} accessibilityLabel={`Hear ${form.he}`} size={18} speed={false} />
  </View>
}

const word = StyleSheet.create({
  lemma: { fontSize: 34, lineHeight: 48, fontWeight: '600', color: colors.ink, writingDirection: 'rtl', flexShrink: 1 },
  gloss: { fontSize: 18, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 13, lineHeight: 19, color: colors.muted },
  pill: { fontSize: 12, fontWeight: '700', color: colors.muted, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  pillDone: { color: colors.green, borderColor: colors.green },
  section: { gap: 6, paddingVertical: 12, paddingHorizontal: 14 },
  stage: { fontSize: 16, fontWeight: '600', color: colors.ink },
  state: { fontSize: 13, fontWeight: '600', color: colors.muted },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  formLabel: { fontSize: 14, color: colors.ink },
  // Every Hebrew form on the page in one style.
  form: { fontSize: 21, color: colors.ink, writingDirection: 'rtl' },
  formInline: { fontSize: 17, fontWeight: '400', color: colors.ink },
  meaning: { fontSize: 15, fontWeight: '600', color: colors.ink },
  example: { fontSize: 16, lineHeight: 24, color: colors.muted, writingDirection: 'rtl', textAlign: 'right' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.muted },
})

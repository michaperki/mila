import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import * as Speech from 'expo-speech'
import Animated from 'react-native-reanimated'
import { REFLOW } from '../lib/motion'
import { colors, ErrorNotice, Page, styles, TextButton } from '../components/ui'
import { feel } from '../lib/feedback'
import { EncounterView } from '../components/Encounter'
import { request } from '../lib/api'
import { isolateHebrew } from '../lib/bidi'
import { textFromDocument } from '../lib/documents'
import { formsIn, isSolid, missingStages, slotLabel, stagesOf, stageState, type StageState } from '../lib/forms'
import type { FormCard, TextDoc, VocabEntry } from '../lib/types'
import { withVowels } from '../lib/vowels'
import { ensureForms } from '../lib/word-forms'
import { encountersOf } from '../lib/words'
import { useSession } from '../state/session'
import { useVowels } from '../state/vowels'

// Saved word ids hold a percent-encoded lemma (native-%D7%9C…), and the router decodes the
// query string, so the id arrives as native-ל…. Compare them decoded.
const decoded = (value: string) => { try { return decodeURIComponent(value) } catch { return value } }
const sameId = (a: string, b: string) => a === b || decoded(a) === decoded(b)

const STATE: Record<StageState, string> = { known: 'Known', done: 'Learned', learning: 'Learning', locked: 'Locked' }

// One saved word: its meanings, its stages with every form and how each is going, and where it
// was met. "I know this" marks a stage as known so the next one opens; nothing is quizzed here.
export default function Word() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session, setRecognition } = useSession()
  const [showVowels] = useVowels()
  const v = (text: string) => withVowels(text, showVowels)
  const [entry, setEntry] = useState<VocabEntry | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Writes cards for open stages that have none, then shows them.
  const prepare = useCallback((word: VocabEntry, signal?: AbortSignal) => {
    if (!session || !missingStages(word).length) return
    setPreparing(true)
    void ensureForms(word, session.token)
      .then(ready => { if (!signal?.aborted) setEntry(current => (current ? { ...current, forms: ready.forms } : ready)) })
      .finally(() => { if (!signal?.aborted) setPreparing(false) })
  }, [session])

  useFocusEffect(useCallback(() => {
    if (!session) return
    const controller = new AbortController()
    void request<{ vocab?: VocabEntry[] }>('vocab', { token: session.token, signal: controller.signal })
      .then(data => {
        const word = data.vocab?.find(item => sameId(item.id, id))
        if (controller.signal.aborted) return
        if (!word) { setError('This word is no longer saved.'); return }
        setEntry(word); prepare(word, controller.signal)
      }, (failure: Error) => { if (!controller.signal.aborted) setError(failure.message) })
    return () => { controller.abort(); void Speech.stop() }
  }, [session, id, prepare]))

  if (!session) return <Page><Text style={styles.copy}>Sign in to see your saved words.</Text></Page>
  if (!entry) return <Page>{error ? <ErrorNotice message={error} /> : <ActivityIndicator color={colors.green} />}</Page>

  const setKnown = (known: string[]) => {
    const updated = { ...entry, known }
    setEntry(updated)
    void request('vocab', { token: session.token, method: 'PATCH', body: { id: entry.id, known } })
      .then(() => prepare(updated), (failure: Error) => { setError(failure.message); setEntry(entry) })
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
        .then(() => router.back(), (failure: Error) => setError(failure.message))
    } },
  ])
  const grammar = [entry.partOfSpeech, entry.binyan, entry.root && `root ${entry.root}`].filter(Boolean).join(' · ')
  const known = entry.known || []

  return <Page>
    <ErrorNotice message={error} />
    <View style={{ gap: 4 }}>
      <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Hear this word" hitSlop={10}
          onPress={() => { void Speech.stop(); Speech.speak(entry.lemma, { language: 'he-IL', rate: 0.8 }) }}>
          <Ionicons name="volume-medium-outline" size={26} color={colors.green} />
        </Pressable>
        <Text style={word.lemma}>{v(entry.lemma)}</Text>
      </View>
      <Text style={word.gloss}>{isolateHebrew(v(entry.gloss))}</Text>
      {!!grammar && <Text style={word.meta}>{isolateHebrew(grammar)}</Text>}
    </View>

    {stagesOf(entry).map(stage => {
      const state = stageState(entry, stage.key)
      const forms = formsIn(entry, stage.key)
      // Opening a stage ("I know this already") moves the cards below it; they glide rather than jump.
      return <Animated.View key={stage.key} layout={REFLOW}
        style={[styles.card, { gap: 8 }, state === 'locked' && { opacity: 0.6 }]}>
        <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
          <Text style={styles.heading}>{stage.label}</Text>
          <Text style={[word.state, (state === 'known' || state === 'done') && { color: colors.green }]}>
            {STATE[state]}{state === 'learning' && forms.length ? ` · ${forms.filter(isSolid).length} of ${forms.length}` : ''}
          </Text>
        </View>
        {state !== 'locked' && forms.map(form => <FormRow key={form.key} label={slotLabel(entry, form)} form={form} v={v} />)}
        {state !== 'locked' && !forms.length && (preparing ? <ActivityIndicator color={colors.green} style={{ alignSelf: 'flex-start' }} />
          : <TextButton title="Prepare these forms" color={colors.green} onPress={() => prepare(entry)} />)}
        {state === 'learning' && <TextButton title="I know this already" color={colors.green} onPress={() => { feel('unlock'); setKnown([...known, stage.key]) }} />}
        {state === 'known' && <TextButton title="Undo" onPress={() => { feel('tick'); setKnown(known.filter(key => key !== stage.key)) }} />}
      </Animated.View>
    })}

    {encountersOf(entry).length > 0 && <View style={[styles.card, { gap: 4 }]}>
      <Text style={styles.heading}>Where you met it</Text>
      {encountersOf(entry).map(encounter => <EncounterView key={`${encounter.context}-${encounter.at}`} encounter={encounter} showVowels={showVowels}
        footer={encounter.sourceRef ? <TextButton title="Open passage" color={colors.green} onPress={() => void openPassage(encounter.sourceRef!.textId)} /> : undefined} />)}
    </View>}
    <TextButton title="Delete word" color={colors.red} onPress={remove} />
  </Page>
}

// One form: what it is, the Hebrew, and a dot for how it's going (hollow: not practiced yet,
// lime: learning, green: solid).
function FormRow({ label, form, v }: { label: string; form: FormCard; v: (text: string) => string }) {
  const solid = isSolid(form)
  return <View style={word.formRow}>
    <View style={[word.dot, form.review && { backgroundColor: colors.lime, borderColor: colors.green }, solid && { backgroundColor: colors.green, borderColor: colors.green }]} />
    <View style={{ flex: 1 }}>
      <Text style={word.formLabel}>{label}</Text>
      <Text style={word.meta} numberOfLines={1}>{form.en}</Text>
    </View>
    <Text style={word.form}>{v(form.he)}</Text>
  </View>
}

const word = StyleSheet.create({
  lemma: { fontSize: 36, lineHeight: 52, fontWeight: '600', color: colors.ink, writingDirection: 'rtl', flexShrink: 1 },
  gloss: { fontSize: 18, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 13, lineHeight: 19, color: colors.muted },
  state: { fontSize: 13, fontWeight: '600', color: colors.muted },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  formLabel: { fontSize: 14, color: colors.ink },
  form: { fontSize: 21, color: colors.ink, writingDirection: 'rtl' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.muted },
})

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { stop as stopSpeaking } from '../lib/speech'
import { ListenButton } from '../components/Listen'
import Animated from 'react-native-reanimated'
import { REFLOW } from '../lib/motion'
import { colors, ErrorNotice, Loading, Page, Pill, styles, TextButton } from '../components/ui'
import { feel } from '../lib/feedback'
import { EncounterView } from '../components/Encounter'
import { request } from '../lib/api'
import { isolateHebrew } from '../lib/bidi'
import { textFromDocument } from '../lib/documents'
import { hasRoot, hasTable, rootOf } from '../lib/explore'
import { formsIn, isFamiliar, isKnownWord, kindLabel, missingStages, slotLabel, stagesOf, stageState, type StageState, statusOf } from '../lib/forms'
import { stripNiqqud } from '../lib/ocr-cleanup'
import type { FormCard, TextDoc } from '../lib/types'
import { withVowels } from '../lib/vowels'
import { ensureForms } from '../lib/word-forms'
import { encountersOf, expressionsWith, headOf, partsOf, sameId } from '../lib/words'
import { useSession } from '../state/session'
import { cachedVocab, dropEntry, putEntry, useVocab } from '../state/vocab'
import { useVowels } from '../state/vowels'

const STATE: Record<StageState, string> = { known: 'Known', ready: 'Ready', familiar: 'Familiar', learning: 'Learning', new: 'New', later: 'Later' }

// One saved word: what it means and what kind of word it is, its stages (meanings first, then
// its forms) with how each is going, expressions built on it, and where it was met. Mila brings
// in later stages as the earlier ones become familiar; "Study now" opens one before that.
// "I know this word" takes it out of studying; "Know these" marks one stage known. Nothing is
// quizzed here.
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

  // Stages marked known, or opened to study before Mila brings them in.
  const setStages = (field: 'known' | 'opened', stages: string[]) => {
    putEntry(session, { ...entry, [field]: stages })
    void request('vocab', { token: session.token, method: 'PATCH', body: { id: entry.id, [field]: stages } })
      .catch((failure: Error) => { setError(failure.message); putEntry(session, entry) })
  }
  const setKnown = (known: string[]) => setStages('known', known)
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
  const open = stages.filter(stage => stageState(entry, stage.key) !== 'later')
  const later = stages.filter(stage => stageState(entry, stage.key) === 'later')
  const expressions = expressionsWith(entries, entry)
  const head = headOf(entries, entry)
  const parts = partsOf(entries, entry)
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
      {/* Learned as a pattern: how the word is used (נָטוּל + [שֵׁם עֶצֶם]), its meaning below. */}
      {!!entry.pattern && <Text style={word.pattern}>{v(entry.pattern)}</Text>}
      <Text style={word.gloss}>{isolateHebrew(v(entry.gloss))}</Text>
      {!!grammar && <Text style={word.meta}>{isolateHebrew(grammar)}</Text>}
    </View>
    <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
      <Text style={[word.pill, wordKnown && word.pillDone]}>
        {wordKnown ? 'Known' : statusOf(entry) === 'mastered' ? 'Learned' : inPlay.length ? `${inPlay.filter(isFamiliar).length} of ${inPlay.length} familiar` : 'New'}
      </Text>
      {wordKnown
        ? <TextButton title="Undo" onPress={() => { feel('tick'); setKnown([]) }} />
        : <TextButton title="I know this word" color={colors.green} onPress={knowWord} />}
    </View>
    {/* Looking around the word: all its forms at once, and the other words of its root. */}
    {(hasTable(entry) || hasRoot(entry)) && <View style={[styles.row, { gap: 8, marginTop: -8 }]}>
      {hasTable(entry) && <Pill icon="grid-outline" label="All forms" onPress={() => router.push({ pathname: '/table', params: { id: entry.id } })} />}
      {hasRoot(entry) && <Pill icon="git-branch-outline" label={`Root ${rootOf(entry.root!)}`} accessibilityLabel={`Explore the root ${rootOf(entry.root!)}`}
        onPress={() => router.push({ pathname: '/root', params: { root: entry.root!, word: entry.lemma } })} />}
    </View>}

    {/* The prepositions it takes, learned with it: what it means with each. */}
    {!!entry.governs?.length && <View style={[styles.card, word.section]}>
      <Text style={word.stage}>Used with</Text>
      {entry.governs.map(item => <View key={item.preposition} style={word.formRow}>
        <Text style={[word.meaning, { flex: 1 }]}>{isolateHebrew(item.meaning)}</Text>
        <Text style={word.form}>{v(item.preposition)}</Text>
      </View>)}
    </View>}
    {/* An expression whose words don't plainly add up to its meaning: what it says word for word,
        and its words, each leading to the saved word it is. */}
    {!!entry.literal && <View style={[styles.card, word.section]}>
      <Text style={word.stage}>How it’s built</Text>
      {parts.map(({ part, saved }) => {
        const row = <>
          <Text style={[word.meaning, { flex: 1 }]}>{isolateHebrew(part.meaning)}</Text>
          <Text style={word.form}>{v(part.lemma)}</Text>
          {saved && <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
        </>
        return saved
          ? <Pressable key={part.lemma} accessibilityRole="button" accessibilityHint="Opens this saved word" onPress={() => router.push({ pathname: '/word', params: { id: saved.id } })} style={word.formRow}>{row}</Pressable>
          : <View key={part.lemma} style={word.formRow}>{row}</View>
      })}
      <Text style={word.literal}>Literally “{entry.literal}”</Text>
      {!!entry.literalNote && <Text style={word.meta}>{isolateHebrew(entry.literalNote)}</Text>}
    </View>}

    {open.map(stage => {
      const state = stageState(entry, stage.key)
      const forms = formsIn(entry, stage.key)
      const shown = folded[stage.key] ?? (state === 'learning' || state === 'new' || state === 'familiar')
      const meanings = stage.key === 'meanings'
      return <Animated.View key={stage.key} layout={REFLOW} style={[styles.card, word.section]}>
        <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: shown }} onPress={() => setFolded(current => ({ ...current, [stage.key]: !shown }))}
            hitSlop={8} style={[styles.row, { gap: 6, flexShrink: 1 }]}>
            <Ionicons name={shown ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.muted} />
            <Text style={word.stage}>{stage.label}</Text>
            <Text style={[word.state, (state === 'known' || state === 'ready') && { color: colors.green }]}>
              {(state === 'learning' || state === 'familiar') && forms.length ? `${STATE[state]} · ${forms.filter(isFamiliar).length}/${forms.length}` : STATE[state]}
            </Text>
          </Pressable>
          {state !== 'known' && state !== 'ready' && !wordKnown && <TextButton title="Know these" color={colors.green} onPress={() => { feel('unlock'); setKnown([...known, stage.key]) }} />}
          {state === 'known' && !wordKnown && <TextButton title="Undo" onPress={() => { feel('tick'); setKnown(known.filter(key => key !== stage.key)) }} />}
        </View>
        {shown && forms.map(form => (meanings
          ? <MeaningRow key={form.key} form={form} lemma={entry.lemma} v={v} />
          : <FormRow key={form.key} label={slotLabel(entry, form)} form={form} v={v} />))}
        {shown && !forms.length && (preparing ? <ActivityIndicator color={colors.green} style={{ alignSelf: 'flex-start' }} />
          : <TextButton title="Prepare these" color={colors.green} onPress={() => setTried(null)} />)}
      </Animated.View>
    })}
    {/* Stages Mila hasn't brought in yet: suggested later, never locked. */}
    {later.length > 0 && !wordKnown && <View style={[styles.card, word.section]}>
      {later.map(stage => <View key={stage.key} style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
        <Text style={word.stage}>{stage.label}</Text>
        <TextButton title="Study now" color={colors.green} onPress={() => { feel('unlock'); setStages('opened', [...(entry.opened || []), stage.key]) }} />
      </View>)}
      <Text style={word.meta}>Mila brings these in as the forms above become familiar. You can study any of them now.</Text>
    </View>}

    {/* An expression and the word it is built on lead to each other. */}
    {head && !parts.some(item => item.saved?.id === head.id) && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/word', params: { id: head.id } })} style={[styles.card, word.section]}>
      <Text style={word.meta}>Built on</Text>
      <Text style={word.meaning}>{isolateHebrew(v(head.lemma))} · {isolateHebrew(head.gloss)}</Text>
    </Pressable>}
    {expressions.length > 0 && <View style={[styles.card, word.section]}>
      <Text style={word.stage}>Expressions with this word</Text>
      {expressions.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/word', params: { id: item.id } })} style={word.formRow}>
        <Text style={[word.meaning, { flex: 1 }]}>{isolateHebrew(item.gloss)}</Text>
        <Text style={word.form}>{v(item.lemma)}</Text>
      </Pressable>)}
    </View>}

    {encountersOf(entry).length > 0 && <View style={[styles.card, { gap: 4 }]}>
      <Text style={word.stage}>{entry.pattern ? 'Examples you met' : 'Where you met it'}</Text>
      {encountersOf(entry).map(encounter => <EncounterView key={`${encounter.context}-${encounter.at}`} encounter={encounter} showVowels={showVowels}
        footer={encounter.sourceRef ? <TextButton title="Open passage" color={colors.green} onPress={() => void openPassage(encounter.sourceRef!.textId)} /> : undefined} />)}
    </View>}
    <TextButton title="Delete word" color={colors.red} onPress={remove} />
  </Page>
}

const Dot = ({ form }: { form: FormCard }) => <View style={[word.dot, !!form.results?.length && { backgroundColor: colors.lime, borderColor: colors.green }, isFamiliar(form) && { backgroundColor: colors.green, borderColor: colors.green }]} />

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
// how it's going (hollow: not practised yet, lime: learning, green: familiar).
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
  pattern: { fontSize: 22, color: colors.ink, writingDirection: 'rtl', textAlign: 'right' },
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
  literal: { fontSize: 15, fontStyle: 'italic', color: colors.ink },
  example: { fontSize: 16, lineHeight: 24, color: colors.muted, writingDirection: 'rtl', textAlign: 'right' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.muted },
})

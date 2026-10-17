import { useEffect, useState } from 'react'
import Animated from 'react-native-reanimated'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { stop as stopSpeaking } from '../lib/speech'
import { ListenButton } from '../components/Listen'
import { Button, colors, ErrorNotice, Page, Pressy, styles } from '../components/ui'
import { ProgressBar, Shake, SwipeCard } from '../components/Motion'
import { APPEAR, CARD_IN, CARD_OUT } from '../lib/motion'
import { feel } from '../lib/feedback'
import { request } from '../lib/api'
import { answer, type Card, choicesFor, drillOf, extraQueue, missingStages, practiceQueue, stagesOf, unlockedStages } from '../lib/forms'
import { bareWord, stripNiqqud } from '../lib/ocr-cleanup'
import { waitOf, type Rating } from '../lib/review'
import type { FormCard, Session, VocabEntry } from '../lib/types'
import { withVowels } from '../lib/vowels'
import { ensureForms } from '../lib/word-forms'
import { useSession } from '../state/session'
import { cachedVocab, putEntry, vocabFor } from '../state/vocab'
import { useVowels } from '../state/vowels'

const RATINGS: { rating: Rating; label: string }[] = [{ rating: 'again', label: 'Again' }, { rating: 'hard', label: 'Hard' }, { rating: 'good', label: 'Got it' }]
const bare = (text: string) => stripNiqqud(bareWord(text))

// The one place to study. Each card is one form of a saved word (to open, I opened, they will
// open …) in its own sentence. A new form is read first: what does the marked word mean? Once
// it has been answered right, the blank is filled by choosing among the word's own forms.
// Stages unlock as forms become solid (lib/forms.ts); their cards are written in the background.
export default function Practice() {
  const { session } = useSession()
  // ?extra=1: practice beyond what's due (Vocabulary → Practice anyway).
  const { extra } = useLocalSearchParams<{ extra?: string }>()
  const insets = useSafeAreaInsets()
  const [showVowels] = useVowels()
  const v = (text: string) => withVowels(text, showVowels)
  const [queue, setQueue] = useState<Card[] | null>(null)
  const [position, setPosition] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [tally, setTally] = useState<Record<Rating, number>>({ again: 0, hard: 0, good: 0 })
  const [unlocked, setUnlocked] = useState<string[]>([])
  const [practiced, setPracticed] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  // The latest copy of each word, so results and unlocks build on each other within a session.
  // Changes also go to the shared saved words, so other screens show them without reloading.
  const [words, setWords] = useState<Record<string, VocabEntry>>({})
  const keep = (ready: VocabEntry) => setWords(current => ({ ...current, [ready.id]: withNewForms(current[ready.id], ready) }))

  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    void (async () => {
      try {
        // The saved words already loaded if there are any, so practice opens at once.
        const entries = await vocabFor(session)
        if (controller.signal.aborted) return
        setWords(Object.fromEntries(entries.map(entry => [entry.id, entry])))
        // Words whose open stage has no cards yet get them written now. Practice starts with
        // what is ready; only if nothing is does it wait for them.
        const preparing = Promise.all(entries.map(entry => (missingStages(entry).length ? ensureForms(entry, session.token) : entry)))
        void preparing.then(ready => {
          ready.forEach(item => share(session, item))
          if (!controller.signal.aborted) ready.forEach(keep)
        })
        const build = extra ? extraQueue : practiceQueue
        let cards = build(entries)
        if (!cards.length) cards = build(await preparing)
        if (!controller.signal.aborted) setQueue(cards)
      } catch (failure) { if (!controller.signal.aborted) setError((failure as Error).message) }
    })()
    return () => { controller.abort(); stopSpeaking() }
  }, [session, extra])

  if (!session) return <Page><Text style={styles.copy}>Sign in to practice your saved words.</Text></Page>
  if (!queue) return <Page>{error ? <ErrorNotice message={error} /> : <ActivityIndicator color={colors.green} />}</Page>
  const card = queue[position]
  // More cards on request: the next batch of extra practice from the latest copy of each word.
  const more = extraQueue(Object.values(words))
  const keepGoing = () => { setQueue(more); setPosition(0) }
  if (!card) return <Summary tally={tally} words={new Set(practiced).size} unlocked={unlocked} error={error} onMore={more.length ? keepGoing : undefined} />

  const entry = words[card.entry.id] || card.entry
  const form = entry.forms?.find(item => item.key === card.form.key) || card.form
  const stage = stagesOf(entry).find(item => item.key === form.stage)
  const drill = drillOf(form)
  // English → Hebrew: the English sentence with the meaning marked; the Hebrew is the answer.
  const recall = drill === 'recall' && !!form.translation
  const choices = drill === 'choose' ? choicesFor(entry, form, `${form.key}-${form.review?.reps ?? 0}`) : null
  const answered = choices ? picked !== null : revealed
  const right = !!choices && picked !== null && bare(picked) === bare(form.he)

  // `felt`: the moment was already felt (a choice is felt when picked, not on Continue).
  const finish = (rating: Rating, felt = false) => {
    if (!felt) feel(rating === 'good' ? 'gotIt' : 'graded')
    const result = answer(form, rating)
    void request('vocab', { token: session.token, method: 'PATCH', body: { id: entry.id, form: { key: form.key, ...result } } })
      .catch((failure: Error) => setError(`A result wasn't saved. ${failure.message}`))
    const before = unlockedStages(entry).map(item => item.key)
    const updated = { ...entry, forms: (entry.forms || []).map(item => (item.key === form.key ? { ...item, ...result } : item)) }
    setWords(current => ({ ...current, [entry.id]: updated })); putEntry(session, updated)
    // A newly opened stage: note it for the summary and have its cards written for next time.
    const opened = unlockedStages(updated).filter(item => !before.includes(item.key))
    if (opened.length) {
      setUnlocked(current => [...current, ...opened.map(item => `${v(entry.lemma)}: ${item.label}`)])
      setTimeout(() => feel('unlock'), 250)
      void ensureForms(updated, session.token).then(ready => { share(session, ready); keep(ready) })
    }
    if (rating === 'again') setQueue(current => [...current!, { entry: updated, form: { ...form, ...result } }])
    setTally(current => ({ ...current, [rating]: current[rating] + 1 })); setPracticed(current => [...current, entry.id])
    setRevealed(false); setPicked(null); setPosition(value => value + 1)
  }

  // The sentence with the form marked, or blanked for a choice (an attached prefix such as ו or ש stays).
  const markBare = bare(form.mark)
  const formBare = bare(form.he)
  const sentence = v(form.sentence).split(/(\s+)/).map((token, i) => {
    if (bare(token) !== markBare) return <Text key={i}>{token}</Text>
    if (choices && !answered) {
      const prefix = markBare.endsWith(formBare) ? markBare.slice(0, markBare.length - formBare.length) : ''
      return <Text key={i}>{prefix}<Text style={practice.blank}>{' '.repeat(6)}</Text></Text>
    }
    return <Text key={i} style={practice.mark}>{token}</Text>
  })

  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <View style={practice.top}>
      <ProgressBar value={position / queue.length} />
      <Text style={practice.progress}>{position + 1} / {queue.length}</Text>
    </View>
    <ScrollView contentContainerStyle={[styles.content, { flexGrow: 1, gap: 16, justifyContent: answered ? 'flex-start' : 'center' }]}>
      <ErrorNotice message={error} />
      <Animated.View key={position} entering={position ? CARD_IN : undefined} exiting={CARD_OUT}>
      <SwipeCard enabled={revealed && !choices} onSwipe={rating => finish(rating)} style={[styles.card, practice.card]}>
        <View style={[styles.row, { justifyContent: 'space-between', alignSelf: 'stretch', flexWrap: 'nowrap' }]}>
          <Text style={practice.stage}>{stage?.label}{recall && !answered ? '' : <> · <Text style={practice.lemma}>{v(entry.lemma)}</Text></>}</Text>
          {(!recall || answered) && <View style={[styles.row, { gap: 8, flexWrap: 'nowrap' }]}><ListenButton text={form.sentence} accessibilityLabel="Hear the sentence" size={24} /></View>}
        </View>
        {recall && <Text style={practice.english}><Marked text={form.translation} mark={form.enMark} /></Text>}
        {(!recall || answered) && <Text style={practice.sentence}>{sentence}</Text>}
        {!answered && <Text style={practice.hint}>{choices ? `Fill in: ${form.en}` : recall ? 'How do you say the marked word in Hebrew?' : 'What does the marked word mean?'}</Text>}
        {choices && <View style={{ gap: 8, alignSelf: 'stretch' }}>
          {choices.map(option => {
            const isAnswer = bare(option) === formBare
            const chosen = picked !== null && bare(option) === bare(picked)
            return <Shake key={option} on={chosen && !isAnswer}>
              <Pressy moment={null} accessibilityRole="button" disabled={answered} onPress={() => { setPicked(option); feel(isAnswer ? 'right' : 'wrong') }}
                style={[practice.option, answered && isAnswer && practice.optionRight, answered && chosen && !isAnswer && practice.optionWrong]}>
                <Text style={practice.optionText}>{v(option)}</Text>
              </Pressy>
            </Shake>
          })}
        </View>}
        {answered && <Animated.View entering={APPEAR} style={{ gap: 6, alignSelf: 'stretch' }}>
          {choices && <Text style={[practice.verdict, { color: right ? colors.green : colors.red }]}>{right ? 'Right' : 'Not quite'}</Text>}
          <Text style={practice.meaning}>{form.en}</Text>
          <Text style={[practice.detail, { textAlign: 'center' }]}>{v(form.he)}</Text>
          {!!form.translation && !recall && <Text style={practice.detail}>{form.translation}</Text>}
        </Animated.View>}
      </SwipeCard>
      </Animated.View>
    </ScrollView>
    <View style={[practice.actions, { paddingBottom: 12 + insets.bottom }]}>
      {choices
        ? (answered ? <Button title="Continue" onPress={() => finish(right ? 'good' : 'again', true)} style={{ flex: 1 }} />
          : <Text style={[practice.hint, { flex: 1, textAlign: 'center', paddingVertical: 14 }]}>Choose the form</Text>)
        : !revealed ? <Button title="Show answer" moment={null} onPress={() => { feel('reveal'); setRevealed(true) }} style={{ flex: 1 }} />
          : RATINGS.map(({ rating, label }) => <Button key={rating} moment={null} secondary={rating !== 'good'} title={label} detail={waitOf(form.review, rating)}
            onPress={() => finish(rating)} style={{ flex: 1, paddingHorizontal: 8 }} />)}
    </View>
  </View>
}

// English text with one phrase marked (case-insensitive); unmarked if the phrase isn't found.
function Marked({ text, mark }: { text: string; mark?: string }) {
  const at = mark ? text.toLowerCase().indexOf(mark.toLowerCase()) : -1
  if (at < 0) return <>{text}</>
  return <>{text.slice(0, at)}<Text style={practice.mark}>{text.slice(at, at + mark!.length)}</Text>{text.slice(at + mark!.length)}</>
}

// Cards written in the background also join the shared saved words.
const share = (session: Session, ready: VocabEntry) => putEntry(session, withNewForms(cachedVocab(session)?.find(item => item.id === ready.id), ready))

// Cards written in the background join the latest copy of a word without undoing results
// recorded since the request started.
function withNewForms(current: VocabEntry | undefined, ready: VocabEntry): VocabEntry {
  if (!current) return ready
  const have = new Set((current.forms || []).map(form => form.key))
  const added: FormCard[] = (ready.forms || []).filter(form => !have.has(form.key))
  return added.length ? { ...current, forms: [...(current.forms || []), ...added] } : current
}

// End of a session: how it went, and which stages opened. Missed cards come back within the
// session, so cards can outnumber words.
function Summary({ tally, words, unlocked, error, onMore }: { tally: Record<Rating, number>; words: number; unlocked: string[]; error: string | null; onMore?: () => void }) {
  const attempts = tally.again + tally.hard + tally.good
  useEffect(() => { if (attempts) feel('complete') }, [attempts])
  if (!attempts) return <Page>
    <Text style={styles.title}>Nothing due.</Text>
    <Text style={styles.copy}>{onMore ? 'You can still practice ahead.' : 'Save words as you read and they will show up here.'}</Text>
    <ErrorNotice message={error} />
    {onMore && <Button title="Keep practicing" onPress={onMore} />}
    <Button title="Back to vocabulary" onPress={() => router.back()} />
  </Page>
  return <Page>
    <Text style={styles.title}>Practice complete</Text>
    <Text style={styles.copy}>{attempts} {attempts === 1 ? 'card' : 'cards'} from {words} {words === 1 ? 'word' : 'words'}</Text>
    <View style={practice.tally}>
      {RATINGS.slice().reverse().map(({ rating, label }) => <View key={rating} style={practice.count}>
        <Text style={practice.countValue}>{tally[rating]}</Text><Text style={practice.countLabel}>{label}</Text>
      </View>)}
    </View>
    {unlocked.map(line => <View key={line} style={practice.unlocked}>
      <Ionicons name="lock-open-outline" size={18} color={colors.green} /><Text style={[styles.copy, { color: colors.ink, flexShrink: 1 }]}>Unlocked {line}</Text>
    </View>)}
    <ErrorNotice message={error} />
    {onMore && <Button title="Keep practicing" onPress={onMore} />}
    <Button secondary={!!onMore} title="Back to vocabulary" onPress={() => router.back()} />
  </Page>
}

const practice = StyleSheet.create({
  top: { gap: 6, paddingHorizontal: 22, paddingTop: 12 },
  progress: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  unlocked: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.lime },
  card: { alignItems: 'center', gap: 14, paddingVertical: 18 },
  stage: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  lemma: { fontSize: 15, color: colors.ink },
  sentence: { fontSize: 22, lineHeight: 36, color: colors.ink, writingDirection: 'rtl', textAlign: 'center' },
  mark: { backgroundColor: colors.lime, fontWeight: '600' },
  english: { fontSize: 20, lineHeight: 30, color: colors.ink, textAlign: 'center' },
  blank: { textDecorationLine: 'underline', textDecorationColor: colors.green, color: colors.green },
  hint: { fontSize: 15, color: colors.muted },
  option: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  optionRight: { borderColor: colors.green, backgroundColor: colors.lime },
  optionWrong: { borderColor: colors.red, backgroundColor: '#FBE7E6' },
  optionText: { fontSize: 22, color: colors.ink, writingDirection: 'rtl' },
  verdict: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  meaning: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  detail: { fontSize: 15, lineHeight: 22, color: colors.muted, writingDirection: 'ltr', textAlign: 'left' },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 22, paddingTop: 12, backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.line },
  tally: { flexDirection: 'row', gap: 10 },
  countValue: { fontSize: 30, fontWeight: '700', color: colors.ink },
  count: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  countLabel: { fontSize: 13, color: colors.muted },
})

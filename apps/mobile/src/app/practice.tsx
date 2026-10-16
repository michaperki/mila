import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import * as Speech from 'expo-speech'
import { Button, colors, ErrorNotice, Page, styles } from '../components/ui'
import { request } from '../lib/api'
import { isolateHebrew } from '../lib/bidi'
import { encountersOf } from '../lib/words'
import { EncounterView } from '../components/Encounter'
import { grade, practiceQueue, waitOf, type Rating } from '../lib/review'
import type { VocabEntry } from '../lib/types'
import { withVowels } from '../lib/vowels'
import { useSession } from '../state/session'
import { useVowels } from '../state/vowels'

const RATINGS: { rating: Rating; label: string }[] = [{ rating: 'again', label: 'Again' }, { rating: 'hard', label: 'Hard' }, { rating: 'good', label: 'Got it' }]

// Flashcards over today's due words. The card tests the meaning the word had where it was
// met, then shows the form and a short excerpt of that sentence (the whole sentence on tap).
// Again puts the card back into this session.
export default function Practice() {
  const { session } = useSession()
  const insets = useSafeAreaInsets()
  const [showVowels] = useVowels()
  const [queue, setQueue] = useState<VocabEntry[] | null>(null)
  const [position, setPosition] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [tally, setTally] = useState<Record<Rating, number>>({ again: 0, hard: 0, good: 0 })
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    void request<{ vocab?: VocabEntry[] }>('vocab', { token: session.token, signal: controller.signal })
      .then(data => setQueue(practiceQueue(data.vocab || [])), (failure: Error) => { if (!controller.signal.aborted) setError(failure.message) })
    return () => { controller.abort(); void Speech.stop() }
  }, [session])

  if (!session) return <Page><Text style={styles.copy}>Sign in to practice your saved words.</Text></Page>
  if (!queue) return <Page>{error ? <ErrorNotice message={error} /> : <ActivityIndicator color={colors.green} />}</Page>
  const card = queue[position]
  if (!card) return <Summary tally={tally} words={new Set(queue.map(entry => entry.id)).size} error={error} />

  const v = (text: string) => withVowels(text, showVowels)
  // The card is the dictionary form; Listen uses its vowels even when they are hidden.
  const front = v(card.lemma)
  const speak = () => { void Speech.stop(); Speech.speak(card.lemma, { language: 'he-IL', rate: 0.8 }) }
  const answer = (rating: Rating) => {
    const review = grade(card.review, rating)
    // Saved in the background; a failure is shown but doesn't stop the session.
    void request('vocab', { token: session.token, method: 'PATCH', body: { id: card.id, review } })
      .catch((failure: Error) => setError(`A result wasn't saved. ${failure.message}`))
    if (rating === 'again') setQueue(current => [...current!, { ...card, review }])
    setTally(current => ({ ...current, [rating]: current[rating] + 1 }))
    setRevealed(false); setPosition(value => value + 1)
  }
  const grammar = [card.partOfSpeech, card.binyan, card.root && `root ${card.root}`].filter(Boolean).join(' · ')
  const encounters = encountersOf(card)

  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <Text style={practice.progress}>{position + 1} / {queue.length}</Text>
    <ScrollView contentContainerStyle={[styles.content, { flexGrow: 1, gap: 16, justifyContent: revealed ? 'flex-start' : 'center' }]}>
      <ErrorNotice message={error} />
      <View style={[styles.card, practice.card]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Hear this word" onPress={speak} hitSlop={10} style={{ alignSelf: 'flex-end' }}>
          <Ionicons name="volume-medium-outline" size={24} color={colors.green} />
        </Pressable>
        <Text style={practice.front}>{front}</Text>
        {!revealed ? <Text style={practice.hint}>What does it mean?</Text> : <View style={{ gap: 10, alignSelf: 'stretch' }}>
          <Text style={practice.meaning}>{v(card.gloss)}</Text>
          {!!grammar && <Text style={[practice.detail, { textAlign: 'center' }]}>{isolateHebrew(grammar)}</Text>}
          {!!encounters[0] && <EncounterView key={`${card.id}-${position}`} encounter={encounters[0]} showVowels={showVowels} />}
          {encounters.length > 1 && <Text style={[practice.detail, { textAlign: 'center' }]}>Met {encounters.length} times</Text>}
        </View>}
      </View>
    </ScrollView>
    <View style={[practice.actions, { paddingBottom: 12 + insets.bottom }]}>
      {!revealed ? <Button title="Show answer" onPress={() => setRevealed(true)} style={{ flex: 1 }} />
        : RATINGS.map(({ rating, label }) => <Button key={rating} secondary={rating !== 'good'} title={label} detail={waitOf(card.review, rating)}
          onPress={() => answer(rating)} style={{ flex: 1, paddingHorizontal: 8 }} />)}
    </View>
  </View>
}

// End of a session: how it went. Missed words come back within the session, so attempts
// can outnumber words.
function Summary({ tally, words, error }: { tally: Record<Rating, number>; words: number; error: string | null }) {
  const attempts = tally.again + tally.hard + tally.good
  if (!attempts) return <Page>
    <Text style={styles.title}>Nothing due.</Text>
    <Text style={styles.copy}>Save words as you read and they will show up here.</Text>
    <Button title="Back to vocabulary" onPress={() => router.back()} />
  </Page>
  return <Page>
    <Text style={styles.title}>Practice complete</Text>
    <Text style={styles.copy}>{words} {words === 1 ? 'word' : 'words'}{attempts > words ? `, ${attempts} cards` : ''}</Text>
    <View style={practice.tally}>
      {RATINGS.slice().reverse().map(({ rating, label }) => <View key={rating} style={practice.count}>
        <Text style={practice.countValue}>{tally[rating]}</Text><Text style={practice.countLabel}>{label}</Text>
      </View>)}
    </View>
    <ErrorNotice message={error} />
    <Button title="Back to vocabulary" onPress={() => router.back()} />
  </Page>
}

const practice = StyleSheet.create({
  progress: { fontSize: 13, color: colors.muted, textAlign: 'center', paddingTop: 12 },
  card: { alignItems: 'center', gap: 14, paddingVertical: 22 },
  front: { fontSize: 40, lineHeight: 58, fontWeight: '600', color: colors.ink, writingDirection: 'rtl', textAlign: 'center' },
  hint: { fontSize: 15, color: colors.muted },
  meaning: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  detail: { fontSize: 14, lineHeight: 21, color: colors.muted, writingDirection: 'ltr', textAlign: 'left' },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 22, paddingTop: 12, backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.line },
  tally: { flexDirection: 'row', gap: 10 },
  count: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  countValue: { fontSize: 30, fontWeight: '700', color: colors.ink },
  countLabel: { fontSize: 13, color: colors.muted },
})

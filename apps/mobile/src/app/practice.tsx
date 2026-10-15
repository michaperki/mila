import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import * as Speech from 'expo-speech'
import { Button, colors, ErrorNotice, Page, styles } from '../components/ui'
import { request } from '../lib/api'
import { bareWord, stripNiqqud } from '../lib/ocr-cleanup'
import { grade, practiceQueue, type Rating } from '../lib/review'
import type { VocabEntry } from '../lib/types'
import { useSession } from '../state/session'

// Flashcards over today's due words. The card tests the meaning the word had where it was
// met, then shows that sentence. Again puts the card back into this session.
export default function Practice() {
  const { session } = useSession()
  const insets = useSafeAreaInsets()
  const [queue, setQueue] = useState<VocabEntry[] | null>(null)
  const [position, setPosition] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [reviewed, setReviewed] = useState(0)
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
  if (!card) return <Page>
    <Text style={styles.title}>{reviewed ? 'Done for now.' : 'Nothing due.'}</Text>
    <Text style={styles.copy}>{reviewed ? `You practiced ${reviewed} ${reviewed === 1 ? 'card' : 'cards'}. Words you knew come back later; the ones you missed come back sooner.` : 'Save words as you read and they will show up here.'}</Text>
    <ErrorNotice message={error} />
    <Button title="Back to vocabulary" onPress={() => router.back()} />
  </Page>

  const front = card.vocalized || card.lemma
  const speak = () => { void Speech.stop(); Speech.speak(front, { language: 'he-IL', rate: 0.8 }) }
  const answer = (rating: Rating) => {
    const review = grade(card.review, rating)
    // Saved in the background; a failure is shown but doesn't stop the session.
    void request('vocab', { token: session.token, method: 'PATCH', body: { id: card.id, review } })
      .catch((failure: Error) => setError(`A result wasn't saved. ${failure.message}`))
    if (rating === 'again') setQueue(current => [...current!, { ...card, review }])
    setReviewed(count => count + 1); setRevealed(false); setPosition(value => value + 1)
  }
  const target = new Set((card.surface || card.lemma).split(/\s+/).map(token => stripNiqqud(bareWord(token))))

  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <ScrollView contentContainerStyle={[styles.content, { gap: 16 }]}>
      <Text style={practice.progress}>{position + 1} / {queue.length}</Text>
      <ErrorNotice message={error} />
      <View style={[styles.card, practice.card]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Hear this word" onPress={speak} hitSlop={10} style={{ alignSelf: 'flex-end' }}>
          <Ionicons name="volume-medium-outline" size={24} color={colors.green} />
        </Pressable>
        <Text style={practice.front}>{front}</Text>
        {!revealed ? <Text style={practice.hint}>What does it mean here?</Text> : <View style={{ gap: 10, alignSelf: 'stretch' }}>
          <Text style={practice.meaning}>{card.gloss}</Text>
          {(card.lemma !== front || !!card.senses) && <Text style={practice.detail}>
            {card.lemma !== front ? <>Dictionary form <Text style={practice.inline}>{card.lemma}</Text>{card.senses ? ' · ' : ''}</> : null}{card.senses || ''}
          </Text>}
          {!!card.context && <View style={practice.context}>
            <Text style={practice.sentence}>{card.context.split(/(\s+)/).map((token, i) =>
              <Text key={i} style={target.has(stripNiqqud(bareWord(token))) ? practice.mark : undefined}>{token}</Text>)}</Text>
            {!!card.contextTranslation && <Text style={practice.detail}>{card.contextTranslation}</Text>}
          </View>}
        </View>}
      </View>
    </ScrollView>
    <View style={[practice.actions, { paddingBottom: 12 + insets.bottom }]}>
      {!revealed ? <Button title="Show answer" onPress={() => setRevealed(true)} style={{ flex: 1 }} /> : <>
        <Button secondary title="Again" onPress={() => answer('again')} style={{ flex: 1 }} />
        <Button secondary title="Hard" onPress={() => answer('hard')} style={{ flex: 1 }} />
        <Button title="Got it" onPress={() => answer('good')} style={{ flex: 1 }} />
      </>}
    </View>
  </View>
}

const practice = StyleSheet.create({
  progress: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  card: { alignItems: 'center', gap: 14, paddingVertical: 22 },
  front: { fontSize: 40, lineHeight: 58, fontWeight: '600', color: colors.ink, writingDirection: 'rtl', textAlign: 'center' },
  hint: { fontSize: 15, color: colors.muted },
  meaning: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  detail: { fontSize: 14, lineHeight: 21, color: colors.muted, writingDirection: 'ltr', textAlign: 'left' },
  inline: { fontSize: 16, color: colors.ink },
  context: { gap: 4, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  sentence: { fontSize: 19, lineHeight: 30, color: colors.ink, writingDirection: 'rtl', textAlign: 'right' },
  mark: { backgroundColor: colors.lime, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 22, paddingTop: 12, backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.line },
})

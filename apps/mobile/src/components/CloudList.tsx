import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { AccountGate, colors, ErrorNotice, Page, styles } from './ui'
import { request } from '../lib/api'
import { useSession } from '../state/session'
import type { TextDoc, VocabEntry } from '../lib/types'
import { textFromDocument } from '../lib/documents'
import { titleFrom } from '../lib/ocr-cleanup'
export default function CloudList({ kind }: { kind: 'texts' | 'vocab' }) {
  const { session, setRecognition } = useSession()
  const [items, setItems] = useState<(TextDoc | VocabEntry)[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useFocusEffect(useCallback(() => {
    const controller = new AbortController()
    setItems([]); setError(null); setLoaded(false)
    if (!session) return
    setLoading(true)
    void request<{ texts?: TextDoc[]; vocab?: VocabEntry[] }>(kind, { token: session.token, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setItems(kind === 'texts' ? data.texts || [] : data.vocab || []) })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message) })
      .finally(() => { if (!controller.signal.aborted) { setLoading(false); setLoaded(true) } })
    return () => controller.abort()
    // revision only forces a refetch on pull-to-refresh; it is not read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, kind, revision]))
  // The big introduction only shows while there is nothing else to look at.
  const empty = !session || (loaded && !error && items.length === 0)
  return <Page refreshControl={<RefreshControl refreshing={loading} tintColor={colors.green} onRefresh={() => setRevision(value => value + 1)} />}>
    {empty && <><Text style={styles.eyebrow}>{kind === 'texts' ? 'KEEP THE CONTEXT' : 'MAKE WORDS YOUR OWN'}</Text><Text style={styles.title}>{kind === 'texts' ? 'Your reading shelf.' : 'Words worth keeping.'}</Text></>}
    {!session ? <AccountGate /> : <><ErrorNotice message={error} />{loading && items.length === 0 && <ActivityIndicator color={colors.green} />}
      {empty && <View style={styles.card}><Text style={styles.heading}>A fresh start.</Text><Text style={styles.copy}>{kind === 'texts' ? 'Save a passage from the reader and it will appear here, on this phone and on the web.' : 'Tap a word in the reader, then save it to build your vocabulary.'}</Text></View>}
      {items.map(item => 'chunks' in item ? <PassageCard key={item.id} doc={item} onOpen={() => { setRecognition(textFromDocument(item)); router.push('/reader') }} /> : <WordCard key={item.id} item={item} />)}
    </>}
  </Page>
}

function PassageCard({ doc, onOpen }: { doc: TextDoc; onOpen: () => void }) {
  const english = doc.chunks.find(chunk => chunk.translation?.trim())?.translation
  const details = [new Date(doc.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), doc.chunks.length > 1 ? `${doc.chunks.length} lines` : null].filter(Boolean).join(' · ')
  return <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.card, { gap: 6, padding: 16, opacity: pressed ? 0.75 : 1 }]}>
    <Text style={[styles.hebrew, { fontSize: 21, lineHeight: 31 }]} numberOfLines={1}>{titleFrom(doc.title || doc.chunks[0]?.text || '')}</Text>
    {!!english && <Text style={[styles.copy, { color: colors.ink }]} numberOfLines={1}>{english}</Text>}
    <Text style={[styles.copy, { fontSize: 13 }]}>{details}</Text>
  </Pressable>
}

function WordCard({ item }: { item: VocabEntry }) {
  return <View style={[styles.card, { gap: 6, padding: 16 }]}>
    <Text style={[styles.hebrew, { fontSize: 23 }]}>{item.lemma}</Text>
    <Text style={[styles.copy, { color: colors.ink }]}>{item.gloss}</Text>
    {(!!item.root || !!item.partOfSpeech) && <Text style={[styles.copy, { fontSize: 13 }]}>{[item.partOfSpeech, item.root && `root ${item.root}`].filter(Boolean).join(' · ')}</Text>}
    {!!item.context && <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, gap: 2 }}>
      <Text style={[styles.hebrew, { fontSize: 17, lineHeight: 26 }]}>{item.context}</Text>
      {!!item.contextTranslation && <Text style={[styles.copy, { fontSize: 14, lineHeight: 20 }]}>{item.contextTranslation}</Text>}
    </View>}
  </View>
}

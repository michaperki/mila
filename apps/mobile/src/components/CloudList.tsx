import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { AccountGate, colors, ErrorNotice, Page, styles } from './ui'
import { request } from '../lib/api'
import { useSession } from '../state/session'
import type { StarredItem, TextDoc } from '../lib/types'
import { textFromDocument } from '../lib/documents'
export default function CloudList({ kind }: { kind: 'texts' | 'vocab' }) {
  const { session, setRecognition } = useSession()
  const [items, setItems] = useState<(TextDoc | StarredItem)[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useFocusEffect(useCallback(() => {
    const controller = new AbortController()
    setItems([]); setError(null)
    if (!session) return
    setLoading(true)
    void request<{ texts?: TextDoc[]; vocab?: StarredItem[] }>(kind, { token: session.token, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setItems(kind === 'texts' ? data.texts || [] : data.vocab || []) })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
    // revision only forces a refetch on pull-to-refresh; it is not read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, kind, revision]))
  return <Page refreshControl={<RefreshControl refreshing={loading} tintColor={colors.green} onRefresh={() => setRevision(value => value + 1)} />}>
    <Text style={styles.eyebrow}>{kind === 'texts' ? 'KEEP THE CONTEXT' : 'MAKE WORDS YOUR OWN'}</Text><Text style={styles.title}>{kind === 'texts' ? 'Your reading shelf.' : 'Words worth keeping.'}</Text>
    <Text style={styles.copy}>Saved on Mila, available here and on the web. Pull down to refresh.</Text>
    {!session ? <AccountGate /> : <><ErrorNotice message={error} />{loading && items.length === 0 && <ActivityIndicator color={colors.green} />}
      {!loading && !error && items.length === 0 && <View style={styles.card}><Text style={styles.heading}>A fresh start.</Text><Text style={styles.copy}>{kind === 'texts' ? 'Save a passage from the reader and it will appear here.' : 'Tap a word in the reader, then save it to build your vocabulary.'}</Text></View>}
      {items.map(item => 'chunks' in item ? <Pressable key={item.id} accessibilityRole="button" onPress={() => { setRecognition(textFromDocument(item)); router.push('/reader') }} style={styles.card}><Text style={styles.hebrew} numberOfLines={2}>{item.title || item.chunks[0]?.text}</Text><Text style={styles.copy}>{new Date(item.createdAt).toLocaleDateString()}</Text></Pressable> : <View key={item.id} style={styles.card}><Text style={styles.hebrew}>{item.lemma}</Text><Text style={[styles.copy, { color: colors.ink }]}>{item.gloss}</Text>{item.root && <Text style={styles.copy}>Root: {item.root}</Text>}</View>)}
    </>}
  </Page>
}

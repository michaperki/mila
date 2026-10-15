import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { AccountGate, colors, ErrorNotice, Page, styles } from './ui'
import { request } from '../lib/api'
import { useSession } from '../state/session'
import type { TextDoc } from '../lib/types'
import { textFromDocument } from '../lib/documents'
import { titleFrom } from '../lib/ocr-cleanup'
// The Library tab: saved passages, newest first. (Vocabulary has its own screen.)
export default function CloudList({ kind }: { kind: 'texts' }) {
  const { session, setRecognition } = useSession()
  const [items, setItems] = useState<TextDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useFocusEffect(useCallback(() => {
    const controller = new AbortController()
    setItems([]); setError(null); setLoaded(false)
    if (!session) return
    setLoading(true)
    void request<{ texts?: TextDoc[] }>(kind, { token: session.token, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setItems(data.texts || []) })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message) })
      .finally(() => { if (!controller.signal.aborted) { setLoading(false); setLoaded(true) } })
    return () => controller.abort()
    // revision only forces a refetch on pull-to-refresh; it is not read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, kind, revision]))
  // The big introduction only shows while there is nothing else to look at.
  const empty = !session || (loaded && !error && items.length === 0)
  return <Page refreshControl={<RefreshControl refreshing={loading} tintColor={colors.green} onRefresh={() => setRevision(value => value + 1)} />}>
    {empty && <><Text style={styles.eyebrow}>KEEP THE CONTEXT</Text><Text style={styles.title}>Your reading shelf.</Text></>}
    {!session ? <AccountGate /> : <><ErrorNotice message={error} />{loading && items.length === 0 && <ActivityIndicator color={colors.green} />}
      {empty && <View style={styles.card}><Text style={styles.heading}>A fresh start.</Text><Text style={styles.copy}>Save a passage from the reader and it will appear here, on this phone and on the web.</Text></View>}
      {items.map(item => <PassageCard key={item.id} doc={item} onOpen={() => { setRecognition(textFromDocument(item)); router.push('/reader') }} />)}
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

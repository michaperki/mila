import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { AccountGate, colors, ErrorNotice, Loading, Page, styles } from './ui'
import { request } from '../lib/api'
import { useSession } from '../state/session'
import type { TextDoc } from '../lib/types'
import { textFromDocument } from '../lib/documents'
import { titleFrom } from '../lib/ocr-cleanup'
// The Library tab: saved passages, newest first. (Vocabulary has its own screen.)
export default function CloudList({ kind }: { kind: 'texts' }) {
  const { session, setRecognition } = useSession()
  // The passages last loaded and whose they are: a visit shows them at once and refreshes them
  // quietly; another account starts empty.
  const [list, setList] = useState<{ owner: string; items: TextDoc[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const owner = session?.user.id
  const items = list && list.owner === owner ? list.items : []
  const loaded = !!list && list.owner === owner
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!session) return
    try {
      const data = await request<{ texts?: TextDoc[] }>(kind, { token: session.token, signal })
      if (!signal?.aborted) { setList({ owner: session.user.id, items: data.texts || [] }); setError(null) }
    } catch (failure) { if (!signal?.aborted) setError((failure as Error).message) }
  }, [session, kind])
  useFocusEffect(useCallback(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load]))
  // The big introduction only shows while there is nothing else to look at.
  const empty = !session || (loaded && !error && items.length === 0)
  return <Page onRefresh={() => load()}>
    {empty && <><Text style={styles.eyebrow}>KEEP THE CONTEXT</Text><Text style={styles.title}>Your reading shelf.</Text></>}
    {!session ? <AccountGate /> : <><ErrorNotice message={error} />{!loaded && !error && <Loading />}
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

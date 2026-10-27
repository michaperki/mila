import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Alert, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { AccountGate, colors, ErrorNotice, Loading, Page, Pill, styles } from './ui'
import { request } from '../lib/api'
import { feel } from '../lib/feedback'
import { useSession } from '../state/session'
import type { TextDoc } from '../lib/types'
import { textFromDocument } from '../lib/documents'
import { isHebrew, type LibrarySort, matchesDoc, previewOf, progressOf, sortDocs, titleOf } from '../lib/library'
import { getPref, setPref } from '../lib/prefs'
import { parseLastRead } from '../lib/today'
import { dropScan, imageOf, isReading, readScan, type Scan, useScans } from '../lib/scans'

// The Library (opened from Home, under Read): saved passages as compact rows (title, a line of preview, when, how long and
// how far read), searchable and sorted by recently read or date added. "…" or a long press on a
// row renames or deletes it. (Vocabulary has its own screen.)
export default function CloudList({ kind }: { kind: 'texts' }) {
  const { session, setRecognition } = useSession()
  // The passages last loaded and whose they are: a visit shows them at once and refreshes them
  // quietly; another account starts empty.
  const [list, setList] = useState<{ owner: string; items: TextDoc[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<LibrarySort>('recent')
  const owner = session?.user.id
  const items = useMemo(() => (list && list.owner === owner ? list.items : []), [list, owner])
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
  // Photos still being read (lib/scans.ts); as each is done it is one of the passages, so the
  // list is loaded again.
  const scans = useScans(owner)
  const waiting = useRef(scans.length)
  useEffect(() => {
    if (scans.length < waiting.current) void load()
    waiting.current = scans.length
  }, [scans.length, load])
  const visible = useMemo(() => sortDocs(items.filter(doc => matchesDoc(doc, query)), sort), [items, query, sort])

  // Changes are shown at once and sent; a failure puts the list back as the server has it.
  const change = (id: string, update: (doc: TextDoc) => TextDoc | null) => setList(current => current && ({
    ...current, items: current.items.flatMap(doc => (doc.id === id ? [update(doc)].filter((item): item is TextDoc => !!item) : [doc])),
  }))
  const rename = (doc: TextDoc, name: string) => {
    if (!session) return
    change(doc.id, item => ({ ...item, name: name.trim() || undefined }))
    void request(kind, { token: session.token, method: 'PATCH', body: { textId: doc.id, name } })
      .catch((failure: Error) => { setError(`It wasn't renamed. ${failure.message}`); void load() })
  }
  const remove = (doc: TextDoc) => {
    if (!session) return
    change(doc.id, () => null); feel('press')
    // Today's Continue reading shouldn't offer a passage that is gone.
    void getPref('lastRead').then(value => { if (parseLastRead(value)?.id === doc.id) setPref('lastRead', '') })
    void request(`${kind}?textId=${encodeURIComponent(doc.id)}`, { token: session.token, method: 'DELETE' })
      .catch((failure: Error) => { setError(`It wasn't deleted. ${failure.message}`); void load() })
  }
  const askName = (doc: TextDoc) => Alert.prompt('Rename', 'Leave it empty to use its own title again.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Save', onPress: (name?: string) => rename(doc, name ?? '') },
  ], 'plain-text', doc.name || titleOf(doc))
  const askDelete = (doc: TextDoc) => Alert.alert('Delete this passage?', 'Words saved from it stay in your vocabulary.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => remove(doc) },
  ])
  // Renaming uses the system prompt, which only iOS has; elsewhere the menu offers Delete.
  const menu = (doc: TextDoc) => {
    feel('select')
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ title: titleOf(doc), options: ['Rename', 'Delete', 'Cancel'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
      index => { if (index === 0) askName(doc); else if (index === 1) askDelete(doc) })
    else askDelete(doc)
  }

  // The big introduction only shows while there is nothing else to look at.
  const empty = !session || (loaded && !error && items.length === 0 && !scans.length)
  return <Page onRefresh={() => load()}>
    {empty && <><Text style={styles.eyebrow}>KEEP THE CONTEXT</Text><Text style={styles.title}>Your reading shelf.</Text></>}
    {!session ? <AccountGate /> : <><ErrorNotice message={error} />{!loaded && !error && <Loading />}
      {empty && <View style={styles.card}><Text style={styles.heading}>A fresh start.</Text><Text style={styles.copy}>Save a passage from the reader and it will appear here.</Text></View>}
      {!!scans.length && <View style={library.list}>
        {scans.map((scan, i) => <ScanRow key={scan.id} scan={scan} first={i === 0}
          onRetry={() => { if (session) void readScan(scan.id, session).catch(() => {}) }}
          onDelete={() => Alert.alert('Delete this photo?', 'It hasn\'t been read yet, so nothing from it is in your library.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => dropScan(scan.id) },
          ])} />)}
      </View>}
      {items.length > 0 && <View style={{ gap: 10 }}>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search titles and text" placeholderTextColor={colors.muted} style={[styles.input, { minHeight: 44, paddingVertical: 10 }]}
          autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing" returnKeyType="search" />
        <View style={[styles.row, { gap: 8 }]}>
          <Text style={library.count}>{items.length} {items.length === 1 ? 'passage' : 'passages'}</Text>
          <View style={{ flex: 1 }} />
          <Pill label="Recently read" active={sort === 'recent'} onPress={() => setSort('recent')} />
          <Pill label="Date added" active={sort === 'added'} onPress={() => setSort('added')} />
        </View>
      </View>}
      {items.length > 0 && !visible.length && <Text style={styles.copy}>Nothing matches “{query}”.</Text>}
      {visible.length > 0 && <View style={library.list}>
        {visible.map((item, i) => <PassageRow key={item.id} doc={item} first={i === 0} onMenu={() => menu(item)}
          onOpen={() => { setRecognition(textFromDocument(item)); router.push('/reader') }} />)}
      </View>}
    </>}
  </Page>
}

// A photo kept on the phone until its page is read: being read, or why it isn't yet.
function ScanRow({ scan, first, onRetry, onDelete }: { scan: Scan; first: boolean; onRetry: () => void; onDelete: () => void }) {
  const reading = isReading(scan.id)
  const taken = new Date(scan.takenAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return <View style={[library.row, !first && library.divider]}>
    <Image source={{ uri: imageOf(scan).uri }} style={library.thumb} accessibilityIgnoresInvertColors />
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={library.title} numberOfLines={1}>Photo · {taken}</Text>
      <Text style={library.details} numberOfLines={2}>{reading ? 'Reading the page…' : `Not read yet. ${scan.failed ?? ''}`.trim()}</Text>
    </View>
    {reading ? <ActivityIndicator color={colors.green} />
      : <Pressable accessibilityRole="button" accessibilityLabel="Read it again" onPress={onRetry} hitSlop={10} style={library.more}>
        <Ionicons name="refresh" size={20} color={colors.green} />
      </Pressable>}
    <Pressable accessibilityRole="button" accessibilityLabel="Delete this photo" onPress={onDelete} hitSlop={10} style={library.more}>
      <Ionicons name="trash-outline" size={20} color={colors.muted} />
    </Pressable>
  </View>
}

function PassageRow({ doc, first, onOpen, onMenu }: { doc: TextDoc; first: boolean; onOpen: () => void; onMenu: () => void }) {
  const title = titleOf(doc)
  const preview = previewOf(doc)
  const progress = progressOf(doc)
  const sentences = doc.chunks.length
  const details = [
    `${doc.openedAt ? 'Read' : 'Added'} ${new Date(doc.openedAt ?? doc.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
    `${sentences} ${sentences === 1 ? 'sentence' : 'sentences'}`,
    progress === null ? 'not started' : progress >= 1 ? 'read' : `${Math.round(progress * 100)}% read`,
  ].join(' · ')
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${details}`} accessibilityHint="Opens it in the reader; long press for more"
    onPress={onOpen} onLongPress={onMenu} style={({ pressed }) => [library.row, !first && library.divider, pressed && { backgroundColor: colors.paper }]}>
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={[library.title, isHebrew(title) && library.hebrew]} numberOfLines={1}>{title}</Text>
      {!!preview && <Text style={[library.preview, isHebrew(preview) && library.hebrew]} numberOfLines={1}>{preview}</Text>}
      <Text style={library.details}>{details}</Text>
      {progress !== null && progress < 1 && <View style={library.track}><View style={[library.fill, { width: `${progress * 100}%` }]} /></View>}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`More for ${title}`} onPress={onMenu} hitSlop={10} style={library.more}>
      <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
    </Pressable>
  </Pressable>
}

const library = StyleSheet.create({
  count: { fontSize: 13, color: colors.muted },
  list: { borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  title: { fontSize: 17, fontWeight: '600', color: colors.ink },
  preview: { fontSize: 14, color: colors.muted },
  hebrew: { writingDirection: 'rtl', textAlign: 'right' },
  details: { fontSize: 12, color: colors.muted },
  track: { height: 3, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden', marginTop: 4 },
  fill: { height: 3, borderRadius: 2, backgroundColor: colors.green },
  more: { padding: 6 },
  thumb: { width: 40, height: 52, borderRadius: 6, backgroundColor: colors.line },
})

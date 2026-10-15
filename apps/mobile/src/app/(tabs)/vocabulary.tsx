import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { AccountGate, Button, colors, ErrorNotice, Page, Pill, styles, TextButton } from '../../components/ui'
import { request } from '../../lib/api'
import { textFromDocument } from '../../lib/documents'
import { countsOf, isDue, matches, statusOf, type Status } from '../../lib/review'
import type { TextDoc, VocabEntry } from '../../lib/types'
import { useSession } from '../../state/session'

type Filter = 'all' | 'due' | Status
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'due', label: 'Due' }, { key: 'new', label: 'New' },
  { key: 'learning', label: 'Learning' }, { key: 'mastered', label: 'Mastered' },
]
const DAY = 24 * 60 * 60 * 1000

// Vocabulary home: what's due, a way to practice it, and a compact, searchable list of
// saved words. A row expands to show where the word was met.
export default function Vocabulary() {
  const { session, setRecognition } = useSession()
  const [entries, setEntries] = useState<VocabEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  // Due dates are judged against when the list was loaded (refreshed on every visit).
  const [now, setNow] = useState(() => Date.now())
  useFocusEffect(useCallback(() => {
    const controller = new AbortController()
    setError(null)
    if (!session) { setEntries([]); return }
    setLoading(true)
    void request<{ vocab?: VocabEntry[] }>('vocab', { token: session.token, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setEntries(data.vocab || []); setNow(Date.now()) } })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message) })
      .finally(() => { if (!controller.signal.aborted) { setLoading(false); setLoaded(true) } })
    return () => controller.abort()
    // revision only forces a refetch on pull-to-refresh; it is not read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, revision]))

  const counts = useMemo(() => countsOf(entries, now), [entries, now])
  const visible = useMemo(() => entries.filter(entry => matches(entry, query)
    && (filter === 'all' || (filter === 'due' ? isDue(entry, now) : statusOf(entry) === filter))), [entries, query, filter, now])

  const remove = (entry: VocabEntry) => Alert.alert('Delete this word?', `${entry.lemma} and its practice history will be removed.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => {
      void request(`vocab?id=${encodeURIComponent(entry.id)}`, { token: session!.token, method: 'DELETE' })
        .then(() => setEntries(current => current.filter(item => item.id !== entry.id)), (failure: Error) => setError(failure.message))
    } },
  ])
  const openPassage = async (textId: string) => {
    try {
      const data = await request<{ texts?: TextDoc[] }>('texts', { token: session!.token })
      const doc = data.texts?.find(item => item.id === textId)
      if (!doc) { setError('That passage is no longer in your library.'); return }
      setRecognition(textFromDocument(doc)); router.push('/reader')
    } catch (failure) { setError((failure as Error).message) }
  }

  const empty = !session || (loaded && !error && entries.length === 0)
  return <Page refreshControl={<RefreshControl refreshing={loading} tintColor={colors.green} onRefresh={() => setRevision(value => value + 1)} />}>
    {empty && <><Text style={styles.eyebrow}>MAKE WORDS YOUR OWN</Text><Text style={styles.title}>Words worth keeping.</Text></>}
    {!session ? <AccountGate /> : <>
      <ErrorNotice message={error} />
      {loading && !loaded && <ActivityIndicator color={colors.green} />}
      {empty && <View style={styles.card}><Text style={styles.heading}>A fresh start.</Text><Text style={styles.copy}>Tap a word in the reader, then save it. Saved words come back here for practice.</Text></View>}
      {!empty && loaded && <>
        <View style={vocab.stats}>
          {([['Saved', counts.saved], ['Due today', counts.due], ['Learning', counts.learning], ['Mastered', counts.mastered]] as const).map(([label, value]) =>
            <View key={label} style={vocab.stat}><Text style={vocab.statValue}>{value}</Text><Text style={vocab.statLabel}>{label}</Text></View>)}
        </View>
        {counts.due > 0
          ? <Button title={`Practice ${Math.min(counts.due, 20)} ${counts.due === 1 ? 'word' : 'words'}`} onPress={() => router.push('/practice')} />
          : <Text style={[styles.copy, { textAlign: 'center' }]}>Nothing due. Come back tomorrow, or save new words as you read.</Text>}
        <TextInput value={query} onChangeText={setQuery} placeholder="Search Hebrew or English" placeholderTextColor={colors.muted} style={[styles.input, { minHeight: 44, paddingVertical: 10 }]}
          autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing" returnKeyType="search" />
        <View style={[styles.row, { gap: 8 }]}>
          {FILTERS.map(item => <Pill key={item.key} label={item.label} active={filter === item.key} onPress={() => setFilter(item.key)} />)}
        </View>
        <View style={[styles.card, { padding: 0, gap: 0, overflow: 'hidden' }]}>
          {visible.length === 0 && <Text style={[styles.copy, { padding: 16 }]}>No words match.</Text>}
          {visible.map((entry, i) => <WordRow key={entry.id} entry={entry} now={now} first={i === 0} open={expanded === entry.id}
            onToggle={() => setExpanded(current => (current === entry.id ? null : entry.id))}
            onDelete={() => remove(entry)} onOpenPassage={entry.sourceRef ? () => void openPassage(entry.sourceRef!.textId) : undefined} />)}
        </View>
      </>}
    </>}
  </Page>
}

function WordRow({ entry, now, first, open, onToggle, onDelete, onOpenPassage }: { entry: VocabEntry; now: number; first: boolean; open: boolean; onToggle: () => void; onDelete: () => void; onOpenPassage?: () => void }) {
  const status = statusOf(entry)
  const meta = [entry.partOfSpeech, entry.root && `root ${entry.root}`].filter(Boolean).join(' · ')
  const days = entry.review ? Math.round((entry.review.due - now) / DAY) : null
  const next = days === null ? 'Not practiced yet' : days <= 0 ? 'Due today' : days === 1 ? 'Next practice tomorrow' : `Next practice in ${days} days`
  return <View style={[vocab.row, !first && vocab.divider]}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${entry.lemma}, ${entry.gloss}`} onPress={onToggle} style={vocab.rowMain}>
      <View style={[vocab.dot, status === 'learning' && { backgroundColor: colors.lime, borderColor: colors.green }, status === 'mastered' && { backgroundColor: colors.green, borderColor: colors.green }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={vocab.meaning} numberOfLines={open ? undefined : 1}>{entry.gloss}</Text>
        {!!meta && <Text style={vocab.meta} numberOfLines={1}>{meta}</Text>}
      </View>
      <Text style={vocab.hebrew} numberOfLines={1}>{entry.lemma}</Text>
    </Pressable>
    {open && <View style={vocab.details}>
      {!!entry.surface && !!entry.vocalized && entry.surface !== entry.lemma && <Text style={vocab.meta}>Met as <Text style={vocab.inlineHebrew}>{entry.vocalized}</Text></Text>}
      {!!entry.senses && <Text style={vocab.meta}>Dictionary: {entry.senses}</Text>}
      {!!entry.context && <View style={vocab.context}>
        <Text style={[styles.hebrew, { fontSize: 17, lineHeight: 27 }]}>{entry.context}</Text>
        {!!entry.contextTranslation && <Text style={[styles.copy, { fontSize: 14, lineHeight: 20 }]}>{entry.contextTranslation}</Text>}
      </View>}
      <Text style={vocab.meta}>{next}</Text>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        {onOpenPassage ? <TextButton title="Open passage" color={colors.green} onPress={onOpenPassage} /> : <View />}
        <TextButton title="Delete" color={colors.red} onPress={onDelete} />
      </View>
    </View>}
  </View>
}

const vocab = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.ink },
  statLabel: { fontSize: 11, color: colors.muted },
  row: { paddingHorizontal: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.muted },
  meaning: { fontSize: 15, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 12, lineHeight: 18, color: colors.muted },
  hebrew: { fontSize: 21, lineHeight: 30, color: colors.ink, writingDirection: 'rtl', maxWidth: '50%' },
  inlineHebrew: { fontSize: 15, color: colors.ink },
  details: { gap: 6, paddingBottom: 8, paddingLeft: 20 },
  context: { gap: 2, paddingTop: 4 },
})

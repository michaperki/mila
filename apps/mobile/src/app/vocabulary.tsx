import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { AccountGate, Button, colors, ErrorNotice, Loading, Page, Pill, Pressy, styles } from '../components/ui'
import { countsOf, formsIn, isFamiliar, openStages, statusOf, type Status } from '../lib/forms'
import type { VocabEntry } from '../lib/types'
import { withVowels } from '../lib/vowels'
import { matches } from '../lib/words'
import { useSession } from '../state/session'
import { useVocab } from '../state/vocab'
import { useVowels } from '../state/vowels'

type Filter = 'all' | Status
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'new', label: 'New' },
  { key: 'learning', label: 'Learning' }, { key: 'mastered', label: 'Mastered' },
]

// Your words (opened from Home, under Study): a way into studying, and a compact, searchable list of
// saved words. A row opens the word's own screen (its forms, progress and where it was met).
export default function Vocabulary() {
  const { session } = useSession()
  // What is already loaded shows at once; every visit refreshes it in the background.
  const { entries, loaded, error, reload } = useVocab(session)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [showVowels] = useVowels()
  const counts = useMemo(() => countsOf(entries), [entries])
  const visible = useMemo(() => entries.filter(entry => matches(entry, query) && (filter === 'all' || statusOf(entry) === filter)), [entries, query, filter])

  const empty = !session || (loaded && !error && entries.length === 0)
  return <Page onRefresh={reload}>
    {empty && <><Text style={styles.eyebrow}>MAKE WORDS YOUR OWN</Text><Text style={styles.title}>Words worth keeping.</Text></>}
    {!session ? <AccountGate /> : <>
      <ErrorNotice message={error} />
      {!loaded && <Loading />}
      {empty && <View style={styles.card}><Text style={styles.heading}>A fresh start.</Text><Text style={styles.copy}>Tap a word in the reader, then save it. Saved words come back here to study.</Text></View>}
      {!empty && loaded && <>
        <Text style={vocab.summary}>{counts.saved} {counts.saved === 1 ? 'word' : 'words'} · {counts.learning} learning · {counts.mastered} mastered</Text>
        {/* One way in: study whenever and as much as you like. */}
        <Button title="Study" onPress={() => router.push('/practice')} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search Hebrew or English" placeholderTextColor={colors.muted} style={[styles.input, { minHeight: 44, paddingVertical: 10 }]}
          autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing" returnKeyType="search" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -22, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 22 }}>
          {FILTERS.map(item => <Pill key={item.key} label={item.label} active={filter === item.key} onPress={() => setFilter(item.key)}
            leading={item.key !== 'all' ? <StatusDot status={item.key} /> : undefined} />)}
        </ScrollView>
        <View style={[styles.card, { padding: 0, gap: 0, overflow: 'hidden' }]}>
          {visible.length === 0 && <Text style={[styles.copy, { padding: 16 }]}>No words match.</Text>}
          {visible.map((entry, i) => <WordRow key={entry.id} entry={entry} showVowels={showVowels} first={i === 0}
            onOpen={() => router.push({ pathname: '/word', params: { id: entry.id } })} />)}
        </View>
      </>}
    </>}
  </Page>
}

function WordRow({ entry, showVowels, first, onOpen }: { entry: VocabEntry; showVowels: boolean; first: boolean; onOpen: () => void }) {
  const v = (text: string) => withVowels(text, showVowels)
  // Where the word is: the newest open stage and how many of its forms are familiar.
  const stage = openStages(entry).at(-1)!
  const forms = formsIn(entry, stage.key)
  const progress = forms.length ? `${stage.label} · ${forms.filter(isFamiliar).length} of ${forms.length}` : stage.label
  return <Pressy moment={null} depth={0.985} accessibilityRole="button" accessibilityLabel={`${entry.lemma}, ${entry.gloss}`} onPress={onOpen} style={[vocab.row, vocab.rowMain, !first && vocab.divider]}>
    <StatusDot status={statusOf(entry)} />
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={vocab.meaning} numberOfLines={1}>{v(entry.gloss)}</Text>
      <Text style={vocab.meta} numberOfLines={1}>{[entry.partOfSpeech, progress].filter(Boolean).join(' · ')}</Text>
    </View>
    <Text style={vocab.hebrew} numberOfLines={1}>{v(entry.lemma)}</Text>
  </Pressy>
}

// Hollow: new. Lime: learning. Green: mastered. The filter pills carry the same dots as a key.
function StatusDot({ status }: { status: Status }) {
  return <View style={[vocab.dot, status === 'learning' && { backgroundColor: colors.lime, borderColor: colors.green }, status === 'mastered' && { backgroundColor: colors.green, borderColor: colors.green }]} />
}

const vocab = StyleSheet.create({
  summary: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  row: { paddingHorizontal: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.muted },
  meaning: { fontSize: 15, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 12, lineHeight: 18, color: colors.muted },
  hebrew: { fontSize: 21, lineHeight: 30, color: colors.ink, writingDirection: 'rtl', maxWidth: '50%' },
})

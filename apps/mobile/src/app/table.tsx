import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { ListenButton } from '../components/Listen'
import { Button, colors, ErrorNotice, Loading, Page, Pill, styles } from '../components/ui'
import { feel } from '../lib/feedback'
import { type Table, tableMeaning } from '../lib/explore'
import { tableFor } from '../lib/explore-requests'
import { isSolid } from '../lib/forms'
import { stripNiqqud } from '../lib/ocr-cleanup'
import { getPref, setPref } from '../lib/prefs'
import { stop as stopSpeaking } from '../lib/speech'
import type { FormCard } from '../lib/types'
import { withVowels } from '../lib/vowels'
import { sameId } from '../lib/words'
import { useSession } from '../state/session'
import { useVocab } from '../state/vocab'
import { useVowels } from '../state/vowels'

// A saved word's whole table of forms, to look at rather than study: every person and tense of a
// verb, an adjective's four forms, a noun's plural and construct forms. English can be hidden to
// test yourself; a row then shows its English when tapped. A form the learner practises has its
// dot (lime: learning, green: solid), as on the word page.
export default function TableScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useSession()
  const [showVowels] = useVowels()
  const v = (text: string) => withVowels(text, showVowels)
  const { entries, loaded } = useVocab(session)
  const entry = entries.find(item => sameId(item.id, id)) ?? null
  const [table, setTable] = useState<Table | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [english, setEnglish] = useState(true)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [attempt, setAttempt] = useState(0)
  useEffect(() => { void getPref('tableEnglish').then(setEnglish) }, [])
  useFocusEffect(useCallback(() => () => stopSpeaking(), []))

  const token = session?.token
  const meaning = entry ? tableMeaning(entry) : ''
  useEffect(() => {
    if (!entry || !token) return
    let live = true
    tableFor(entry, token).then(value => { if (live) setTable(value) }, (failure: Error) => { if (live) setError(failure.message) })
    return () => { live = false }
    // Asked again only for another word or meaning, or on Try again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.lemma, entry?.partOfSpeech, entry?.binyan, meaning, token, attempt])

  if (!session) return <Page><Text style={styles.copy}>Sign in to see your saved words.</Text></Page>
  if (!entry) return <Page>{loaded ? <ErrorNotice message="This word is no longer saved." /> : <Loading />}</Page>

  const toggleEnglish = () => { const next = !english; setEnglish(next); setPref('tableEnglish', next); setRevealed(new Set()) }
  const reveal = (key: string) => { feel('tick'); setRevealed(current => new Set(current).add(key)) }
  // The learner's practice card for a form, matched by its letters.
  const cardOf = (he: string): FormCard | undefined => (entry.forms || []).find(form => form.stage !== 'meanings' && stripNiqqud(form.he) === stripNiqqud(he))

  return <Page>
    <Stack.Screen options={{ title: v(entry.lemma) }} />
    <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
      <Text style={[styles.copy, { flexShrink: 1 }]}>All forms{meaning ? `, in the sense “${meaning}”` : ''}</Text>
      <Pill icon={english ? 'eye-outline' : 'eye-off-outline'} label="English" active={english} onPress={toggleEnglish} accessibilityLabel={english ? 'Hide English' : 'Show English'} />
    </View>
    {!english && <Text style={[styles.copy, { fontSize: 13, lineHeight: 18, marginTop: -10 }]}>Say each one to yourself, then tap it to check.</Text>}
    {error ? <><ErrorNotice message={error} /><Button secondary title="Try again" onPress={() => { setError(null); setAttempt(value => value + 1) }} /></>
      : !table ? <Loading />
        : table.groups.map(group => <View key={group.key} style={[styles.card, table_.group]}>
          <Text style={table_.heading}>{group.label}</Text>
          {group.rows.map((row, i) => {
            const key = `${group.key}:${row.slot}`
            const shown = english || revealed.has(key)
            const card = cardOf(row.he)
            return <Pressable key={key} accessibilityRole={shown ? undefined : 'button'} accessibilityLabel={`${row.label}: ${row.he}${shown ? `, ${row.en}` : ''}`}
              accessibilityHint={shown ? undefined : 'Shows the English'} disabled={shown} onPress={() => reveal(key)} style={[table_.row, i > 0 && table_.divider]}>
              <View style={[table_.dot, card?.review && { backgroundColor: colors.lime, borderColor: colors.green }, card && isSolid(card) && { backgroundColor: colors.green, borderColor: colors.green }, !card && { borderColor: 'transparent' }]} />
              <View style={{ flex: 1 }}>
                <Text style={table_.label}>{row.label}</Text>
                <Text style={[table_.english, !shown && table_.hidden]} numberOfLines={2}>{shown ? row.en : 'Tap to show'}</Text>
              </View>
              <Text style={table_.form}>{v(row.he)}</Text>
              <ListenButton text={row.he} accessibilityLabel={`Hear ${row.he}`} size={18} speed={false} />
            </Pressable>
          })}
        </View>)}
  </Page>
}

const table_ = StyleSheet.create({
  group: { gap: 0, paddingVertical: 10, paddingHorizontal: 14 },
  heading: { fontSize: 16, fontWeight: '600', color: colors.ink, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: colors.muted },
  label: { fontSize: 14, color: colors.ink },
  english: { fontSize: 13, lineHeight: 18, color: colors.muted },
  hidden: { color: colors.green, fontStyle: 'italic' },
  // Every Hebrew form in one style, as on the word page.
  form: { fontSize: 21, color: colors.ink, writingDirection: 'rtl' },
})

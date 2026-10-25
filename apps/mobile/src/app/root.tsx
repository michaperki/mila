import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Button, colors, ErrorNotice, Loading, Page, styles } from '../components/ui'
import { request } from '../lib/api'
import { isolateHebrew } from '../lib/bidi'
import { entryFrom, type Family, familyGroups, type FamilyWord, rootOf, savedAs } from '../lib/explore'
import { familyFor } from '../lib/explore-requests'
import { feel } from '../lib/feedback'
import type { VocabEntry } from '../lib/types'
import { withVowels } from '../lib/vowels'
import { ensureForms } from '../lib/word-forms'
import { noteActivity } from '../lib/tree'
import { vocabId } from '../lib/words'
import { useSession } from '../state/session'
import { cachedVocab, putEntry, useVocab } from '../state/vocab'
import { useVowels } from '../state/vowels'
import { useHebrew } from '../state/script'

// A root's family: the idea its letters carry and the everyday words built on it, verbs first.
// A word already saved opens its page; any other can be saved from here to study like any word.
// `word` is the saved word the family was opened from, which picks the family when a root has
// several unrelated ones.
export default function RootScreen() {
  const he = useHebrew()
  const { root: param, word: from } = useLocalSearchParams<{ root: string; word?: string }>()
  const root = rootOf(param || '')
  const { session } = useSession()
  const [showVowels] = useVowels()
  const v = (text: string) => withVowels(text, showVowels)
  const { entries } = useVocab(session)
  const [family, setFamily] = useState<Family | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState<Set<string>>(new Set())

  const token = session?.token
  useEffect(() => {
    if (!token || !root) return
    let live = true
    familyFor(root, from || '', token).then(value => { if (live) setFamily(value) }, (failure: Error) => { if (live) setError(failure.message) })
    return () => { live = false }
  }, [root, from, token, attempt])

  if (!session) return <Page><Text style={styles.copy}>Sign in to explore roots.</Text></Page>

  const save = async (word: FamilyWord) => {
    if (saving.has(word.lemma)) return
    feel('saved'); setSaving(current => new Set(current).add(word.lemma)); setError(null)
    try {
      const entry = entryFrom(word, root, vocabId(word.lemmaPlain || word.lemma))
      // The server may add it to an entry the word is already saved under, and says which.
      const { item } = await request<{ item?: VocabEntry }>('vocab', { token: session.token, body: entry })
      const stored = { ...entry, ...item, id: item?.id ?? entry.id }
      putEntry(session, cachedVocab(session)?.find(existing => existing.id === stored.id) ?? stored)
      noteActivity('saved')
      // Its first practice cards, ready by the next practice.
      void ensureForms(stored, session.token).then(ready => {
        const latest = cachedVocab(session)?.find(existing => existing.id === stored.id)
        if (latest && ready.forms?.length) putEntry(session, { ...latest, forms: ready.forms })
      }).catch(() => {})
    } catch (failure) { setError(`${isolateHebrew(word.lemma)} wasn't saved. ${(failure as Error).message}`) }
    finally { setSaving(current => { const next = new Set(current); next.delete(word.lemma); return next }) }
  }

  return <Page>
    <Stack.Screen options={{ title: `Root ${root}` }} />
    <View style={{ gap: 4 }}>
      <Text style={root_.root}>{root}</Text>
      {!!family?.idea && <Text style={root_.idea}>{family.idea}</Text>}
      <Text style={styles.copy}>Words built on these letters.</Text>
    </View>
    <ErrorNotice message={error} />
    {!family ? (error ? <Button secondary title="Try again" onPress={() => { setError(null); setAttempt(value => value + 1) }} /> : <Loading />)
      : familyGroups(family.words).map(group => <View key={group.label} style={[styles.card, root_.group]}>
        <Text style={root_.heading}>{group.label}</Text>
        {group.words.map((word, i) => {
          const saved = savedAs(entries, word)
          const detail = word.binyan || word.gender
          return <Pressable key={word.lemma} accessibilityRole="button" disabled={!saved}
            accessibilityLabel={`${word.lemma}, ${word.meaning}${saved ? ', saved. Opens it' : ''}`}
            onPress={() => saved && router.push({ pathname: '/word', params: { id: saved.id } })}
            style={({ pressed }) => [root_.row, i > 0 && root_.divider, pressed && { opacity: 0.6 }]}>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={root_.meaning}>{word.meaning}</Text>
              {!!detail && <Text style={root_.detail}>{detail}</Text>}
            </View>
            <Text style={[root_.word, he]}>{v(word.lemma)}</Text>
            {saved ? <Ionicons name="chevron-forward" size={18} color={colors.muted} accessibilityLabel="Saved" />
              : saving.has(word.lemma) ? <ActivityIndicator color={colors.green} style={root_.add} />
                : <Pressable accessibilityRole="button" accessibilityLabel={`Save ${word.lemma}`} onPress={() => void save(word)} hitSlop={8} style={root_.add}>
                  <Ionicons name="add-circle-outline" size={24} color={colors.green} />
                </Pressable>}
          </Pressable>
        })}
      </View>)}
    {!!family && <Text style={[styles.copy, { fontSize: 13, lineHeight: 18 }]}>Tap + to save a word and study it like the words you met reading. Saved words open their page.</Text>}
  </Page>
}

const root_ = StyleSheet.create({
  root: { fontSize: 34, lineHeight: 46, fontWeight: '600', color: colors.ink, writingDirection: 'rtl', textAlign: 'left' },
  idea: { fontSize: 18, fontWeight: '600', color: colors.ink },
  group: { gap: 0, paddingVertical: 10, paddingHorizontal: 14 },
  heading: { fontSize: 16, fontWeight: '600', color: colors.ink, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  meaning: { fontSize: 14, color: colors.ink },
  detail: { fontSize: 12, color: colors.muted },
  word: { fontSize: 21, color: colors.ink, writingDirection: 'rtl' },
  add: { width: 28, alignItems: 'center' },
})

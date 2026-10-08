import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import * as Crypto from 'expo-crypto'
import * as Speech from 'expo-speech'
import { Button, colors, ErrorNotice, Page, Pill, styles } from '../components/ui'
import { FeedbackButton } from '../components/Feedback'
import { request } from '../lib/api'
import { documentFromRecognition, segmentsOf } from '../lib/documents'
import { bareWord, stripNiqqud } from '../lib/ocr-cleanup'
import { getPref, setPref } from '../lib/prefs'
import { explainWord } from '../lib/recognition'
import type { StarredItem, VocabEntry, WordAnalysis } from '../lib/types'
import { useSession } from '../state/session'

const vocabId = (lemma: string) => `native-${encodeURIComponent(stripNiqqud(lemma))}`

export default function Reader() {
  const { recognition, session } = useSession()
  const insets = useSafeAreaInsets()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [analysis, setAnalysis] = useState<WordAnalysis | undefined>()
  const [gloss, setGloss] = useState('')
  const [wordBusy, setWordBusy] = useState(false)
  const [wordError, setWordError] = useState<string | null>(null)
  const [savingWord, setSavingWord] = useState(false)
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set())
  const [showEnglish, setShowEnglish] = useState(true)
  const [showNiqqud, setShowNiqqud] = useState(true)
  const selection = useRef(0)
  const docId = useRef(Crypto.randomUUID())
  useFocusEffect(useCallback(() => () => { selection.current++; void Speech.stop() }, []))
  useEffect(() => { void getPref('showEnglish').then(setShowEnglish); void getPref('showNiqqud').then(setShowNiqqud) }, [])
  // Know which words are already saved so the card can say so instead of offering a duplicate.
  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    void request<{ vocab?: StarredItem[] }>('vocab', { token: session.token, signal: controller.signal })
      .then(data => setSavedWords(new Set((data.vocab || []).map(item => item.id)))).catch(() => {})
    return () => controller.abort()
  }, [session])

  const segments = useMemo(() => (recognition ? segmentsOf(recognition) : []), [recognition])
  const words = useMemo(() => segments.flatMap((segment, index) => segment.he.split(/\s+/).filter(Boolean)
    .map(surface => ({ surface, bare: bareWord(surface), segment: index }))).filter(word => word.bare), [segments])
  const indexOfFirstWord = useMemo(() => {
    const starts: number[] = []
    words.forEach((word, i) => { if (starts[word.segment] === undefined) starts[word.segment] = i })
    return starts
  }, [words])

  if (!recognition) return <Page><Text style={styles.title}>Find something to read.</Text><Button title="Open camera" onPress={() => router.replace('/')} /></Page>

  const save = async () => {
    if (!session) { router.push('/login'); return }
    if (busy) return
    setBusy(true); setError(null)
    try { const doc = documentFromRecognition(recognition, docId.current); await request('texts', { token: session.token, body: { ...doc, textId: doc.id } }); setSaved(true) }
    catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }
  const select = async (index: number) => {
    const word = words[index]
    if (!word) return
    const version = ++selection.current
    setSelected(index); setAnalysis(undefined); setGloss(''); setWordError(null); setWordBusy(true)
    try {
      const result = await explainWord(word.bare, segments[word.segment].he, session?.token)
      if (selection.current !== version) return
      setAnalysis(result.analysis); setGloss(result.gloss)
    } catch (failure) { if (selection.current === version) setWordError((failure as Error).message) }
    finally { if (selection.current === version) setWordBusy(false) }
  }
  const close = () => { selection.current++; setSelected(null); void Speech.stop() }
  const word = selected === null ? null : words[selected]
  const lemma = analysis?.lemma || word?.bare || ''
  const wordSaved = !!word && savedWords.has(vocabId(lemma))
  const saveWord = async () => {
    if (!session) { router.push('/login'); return }
    if (!word || !gloss || savingWord || wordSaved) return
    const segment = segments[word.segment]
    const id = vocabId(lemma)
    const entry: VocabEntry = {
      id, lemma, gloss: analysis?.lemmaMeaning || gloss, createdAt: Date.now(), frequency: 1,
      ...(analysis?.root ? { root: analysis.root } : {}),
      surface: word.bare, vocalized: analysis?.vocalized, partOfSpeech: analysis?.partOfSpeech,
      context: segment.he, contextTranslation: segment.en,
      ...(saved ? { sourceRef: { textId: docId.current, chunkId: `${docId.current}-${word.segment}` } } : {}),
    }
    setSavingWord(true); setWordError(null)
    try { await request('vocab', { token: session.token, body: entry }); setSavedWords(current => new Set(current).add(id)) }
    catch (failure) { setWordError((failure as Error).message) } finally { setSavingWord(false) }
  }
  const toggleEnglish = () => setShowEnglish(value => { setPref('showEnglish', !value); return !value })
  const toggleNiqqud = () => setShowNiqqud(value => { setPref('showNiqqud', !value); return !value })
  const speak = (text: string) => { void Speech.stop(); Speech.speak(text, { language: 'he-IL', rate: 0.8 }) }

  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <ScrollView contentContainerStyle={[styles.content, { gap: 14, paddingBottom: word ? 360 : 36 }]}>
      <View style={[styles.row, { gap: 8 }]}>
        <Pill icon={showEnglish ? 'eye-outline' : 'eye-off-outline'} label="English" active={showEnglish} onPress={toggleEnglish} accessibilityLabel={showEnglish ? 'Hide English' : 'Show English'} />
        <Pill label="Vowels" active={showNiqqud} onPress={toggleNiqqud} accessibilityLabel={showNiqqud ? 'Hide vowels' : 'Show vowels'} />
        <Pill icon="volume-medium-outline" label="Listen" onPress={() => speak(recognition.text)} accessibilityLabel="Listen in Hebrew" />
        <FeedbackButton screen="reader" context={() => ({ raw: recognition.raw, segments, word: word?.bare, sentence: word ? segments[word.segment].he : undefined, gloss, analysis })} />
      </View>
      <Text style={[styles.copy, { fontSize: 14 }]}>Tap any word to see what it means here.</Text>
      <View style={[styles.card, { gap: 0, paddingVertical: 8 }]}>
        {segments.map((segment, s) => <View key={s} style={[reader.segment, s > 0 && reader.divider]}>
          <View style={reader.line}>
            {segment.marker && <Text style={[reader.word, reader.marker]}>{segment.marker}.</Text>}
            {words.map((item, i) => item.segment !== s ? null : <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Explain ${item.bare}`} onPress={() => void select(i)}
              style={[reader.wordBox, selected === i && { backgroundColor: colors.lime }]}>
              <Text style={[reader.word, segment.heading && reader.heading]}>{showNiqqud ? item.surface : stripNiqqud(item.surface)}</Text>
            </Pressable>)}
            {indexOfFirstWord[s] === undefined && <Text style={reader.word}>{segment.he}</Text>}
          </View>
          {showEnglish && !!segment.en && <Text selectable style={[reader.english, segment.heading && { fontWeight: '600' }]}>{segment.marker ? `${segment.marker}. ` : ''}{segment.en}</Text>}
        </View>)}
      </View>
      <ErrorNotice message={error} />
      <Button title={saved ? 'Saved to library ✓' : 'Save passage'} disabled={saved} busy={busy} onPress={() => void save()} />
    </ScrollView>

    {word && <View style={[reader.sheet, { paddingBottom: 16 + insets.bottom }]} accessibilityViewIsModal>
      <View style={reader.sheetHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={10}><Ionicons name="close" size={24} color={colors.muted} /></Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Hear this word" onPress={() => speak(analysis?.vocalized || word.bare)} hitSlop={10}><Ionicons name="volume-medium-outline" size={24} color={colors.green} /></Pressable>
          <Text style={reader.sheetWord}>{analysis?.vocalized || word.bare}</Text>
        </View>
      </View>
      <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ gap: 8 }}>
        {wordBusy ? <View style={[styles.row, { gap: 8 }]}><ActivityIndicator color={colors.green} /><Text style={styles.copy}>Reading it in context…</Text></View> : <>
          {!!gloss && <Text style={reader.meaning}>{gloss}</Text>}
          {analysis && analysis.parts.length > 1 && <View style={reader.parts}>
            {analysis.parts.map((part, i) => <View key={i} style={reader.part}><Text style={reader.partHebrew}>{part.text}</Text><Text style={reader.partMeaning}>{part.meaning}</Text></View>)}
          </View>}
          {analysis && <WordFacts analysis={analysis} />}
          {!analysis && !!gloss && <Text style={[styles.copy, { fontSize: 13 }]}>Detailed explanation unavailable, so this is a direct translation of the word.</Text>}
        </>}
        <ErrorNotice message={wordError} />
      </ScrollView>
      <View style={[styles.row, { flexWrap: 'nowrap' }]}>
        {/* Hebrew reads right-to-left: the next word is to the left. */}
        <Pressable accessibilityRole="button" accessibilityLabel="Next word" disabled={selected! >= words.length - 1} onPress={() => void select(selected! + 1)} style={[reader.nav, selected! >= words.length - 1 && { opacity: 0.3 }]}><Ionicons name="chevron-back" size={22} color={colors.green} /></Pressable>
        <Button secondary={wordSaved} title={wordSaved ? 'Saved ✓' : 'Save word'} disabled={wordBusy || !gloss || wordSaved} busy={savingWord} onPress={() => void saveWord()} style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Previous word" disabled={selected! <= 0} onPress={() => void select(selected! - 1)} style={[reader.nav, selected! <= 0 && { opacity: 0.3 }]}><Ionicons name="chevron-forward" size={22} color={colors.green} /></Pressable>
      </View>
    </View>}
  </View>
}

function WordFacts({ analysis }: { analysis: WordAnalysis }) {
  const grammar = [analysis.partOfSpeech, analysis.binyan, analysis.form].filter(Boolean).join(' · ')
  const showLemma = analysis.lemma && stripNiqqud(analysis.lemma) !== stripNiqqud(analysis.vocalized || analysis.word)
  return <View style={{ gap: 4 }}>
    {showLemma && <Text style={reader.fact}>Dictionary form: <Text style={reader.factHebrew}>{analysis.lemma}</Text>{analysis.lemmaMeaning ? ` · ${analysis.lemmaMeaning}` : ''}</Text>}
    {!showLemma && !!analysis.lemmaMeaning && <Text style={reader.fact}>Also: {analysis.lemmaMeaning}</Text>}
    {(!!analysis.root || !!grammar) && <Text style={reader.fact}>{analysis.root ? <>Root <Text style={reader.factHebrew}>{analysis.root}</Text>{grammar ? ' · ' : ''}</> : null}{grammar}</Text>}
    {!!analysis.note && <Text style={[reader.fact, { fontStyle: 'italic' }]}>{analysis.note}</Text>}
  </View>
}

const reader = StyleSheet.create({
  segment: { paddingVertical: 10, gap: 4 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  line: { flexDirection: 'row-reverse', flexWrap: 'wrap', columnGap: 2 },
  wordBox: { borderRadius: 6, paddingHorizontal: 3 },
  word: { fontSize: 21, lineHeight: 32, color: colors.ink, writingDirection: 'rtl' },
  heading: { fontWeight: '700' },
  marker: { color: colors.muted, paddingHorizontal: 3 },
  english: { fontSize: 15, lineHeight: 22, color: colors.muted },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, gap: 12, backgroundColor: colors.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 1, borderColor: colors.line, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetWord: { fontSize: 28, lineHeight: 38, fontWeight: '600', color: colors.ink, writingDirection: 'rtl' },
  meaning: { fontSize: 19, fontWeight: '600', color: colors.ink },
  parts: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  part: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.paper, alignItems: 'center' },
  partHebrew: { fontSize: 19, color: colors.ink },
  partMeaning: { fontSize: 12, color: colors.muted },
  fact: { fontSize: 14, lineHeight: 21, color: colors.muted },
  factHebrew: { color: colors.ink, fontSize: 16 },
  nav: { width: 46, height: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
})

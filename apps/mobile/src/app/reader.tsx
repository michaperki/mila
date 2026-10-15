import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, type GestureResponderEvent, type NativeScrollEvent, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import * as Crypto from 'expo-crypto'
import * as Speech from 'expo-speech'
import { Button, colors, ErrorNotice, Page, Pill, styles, TextButton } from '../components/ui'
import { FeedbackButton } from '../components/Feedback'
import { request } from '../lib/api'
import { isolateHebrew, otherSenses } from '../lib/bidi'
import { rangeOf, type Rect, wordAt } from '../lib/selection'
import { documentFromRecognition, segmentsOf } from '../lib/documents'
import { bareWord, stripNiqqud } from '../lib/ocr-cleanup'
import { paragraphsOf } from '../lib/page'
import { type EnglishMode, getPref, setPref } from '../lib/prefs'
import { explainWord } from '../lib/recognition'
import type { StarredItem, VocabEntry, WordAnalysis } from '../lib/types'
import { useSession } from '../state/session'

// Keyed by the vocalized lemma so homographs (סֵפֶר book / סַפָּר barber) don't collide.
const vocabId = (lemma: string) => `native-${encodeURIComponent(lemma.normalize('NFC'))}`

export default function Reader() {
  const { recognition, session } = useSession()
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  // The passage is padded by the sheet's real height so the tapped word isn't hidden under it.
  const [sheetHeight, setSheetHeight] = useState(360)
  const [moreBelow, setMoreBelow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(recognition?.library === 'saved')
  // Camera captures go straight into the library (the effect below); pasted text waits for "Save passage".
  const autosave = recognition?.library === 'auto' && !!session
  const [busy, setBusy] = useState(autosave)
  // The selection is one word or, after a drag, a run of words in one sentence.
  const [selected, setSelected] = useState<number | null>(null)
  const [selectedTo, setSelectedTo] = useState<number | null>(null)
  const [dragRange, setDragRange] = useState<{ from: number; to: number } | null>(null)
  const lines = useRef(new Map<number, View>())
  const wordBoxes = useRef(new Map<number, Map<number, Rect>>())
  const drag = useRef<{ line: number; x0: number; y0: number; origin?: { x: number; y: number }; start?: number; range?: { from: number; to: number } } | null>(null)
  const [analysis, setAnalysis] = useState<WordAnalysis | undefined>()
  const [gloss, setGloss] = useState('')
  const [wordBusy, setWordBusy] = useState(false)
  const [wordError, setWordError] = useState<string | null>(null)
  const [savingWord, setSavingWord] = useState(false)
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set())
  const [english, setEnglish] = useState<EnglishMode>('tap')
  // The sentence whose English is shown in 'tap' mode; it stays after the word sheet closes.
  const [revealed, setRevealed] = useState<number | null>(null)
  const [showNiqqud, setShowNiqqud] = useState(true)
  const selection = useRef(0)
  const docId = useRef(recognition?.id ?? Crypto.randomUUID())
  useFocusEffect(useCallback(() => () => { selection.current++; void Speech.stop() }, []))
  useEffect(() => { void getPref('english').then(setEnglish); void getPref('showNiqqud').then(setShowNiqqud) }, [])
  // Know which words are already saved so the card can say so instead of offering a duplicate.
  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    void request<{ vocab?: StarredItem[] }>('vocab', { token: session.token, signal: controller.signal })
      .then(data => setSavedWords(new Set((data.vocab || []).map(item => item.id)))).catch(() => {})
    return () => controller.abort()
  }, [session])

  const segments = useMemo(() => (recognition ? segmentsOf(recognition) : []), [recognition])
  // A page read keeps the page's paragraphs: dividers go between paragraphs, not sentences.
  const paged = recognition?.source === 'page'
  const words = useMemo(() => segments.flatMap((segment, index) => segment.he.split(/\s+/).filter(Boolean)
    .map(surface => ({ surface, bare: bareWord(surface), segment: index }))).filter(word => word.bare), [segments])
  const indexOfFirstWord = useMemo(() => {
    const starts: number[] = []
    words.forEach((word, i) => { if (starts[word.segment] === undefined) starts[word.segment] = i })
    return starts
  }, [words])
  const indexOfLastWord = useMemo(() => {
    const ends: number[] = []
    words.forEach((word, i) => { ends[word.segment] = i })
    return ends
  }, [words])
  // Sentences flow together within a paragraph, like a page in a book.
  const paragraphs = useMemo(() => paragraphsOf(segments, paged), [segments, paged])

  // Upserts by id, so re-opening the same capture can't create a duplicate.
  const persist = () => {
    const doc = documentFromRecognition(recognition!, docId.current)
    return request('texts', { token: session!.token, body: { ...doc, textId: doc.id } })
      .then(() => setSaved(true), (failure: Error) => setError(`This passage wasn't saved. ${failure.message}`))
      .finally(() => setBusy(false))
  }
  const save = () => {
    if (!recognition) return
    if (!session) { router.push('/login'); return }
    if (busy) return
    setBusy(true); setError(null)
    void persist()
  }
  const remove = async () => {
    if (!session || busy) return
    setBusy(true); setError(null)
    try { await request(`texts?textId=${encodeURIComponent(docId.current)}`, { token: session.token, method: 'DELETE' }); setSaved(false) }
    catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }
  useEffect(() => {
    if (autosave) void persist()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!recognition) return <Page><Text style={styles.title}>Find something to read.</Text><Button title="Open camera" onPress={() => router.replace('/')} /></Page>

  const select = async (index: number, to = index) => {
    const first = words[index]
    if (!first) return
    const text = words.slice(index, to + 1).map(item => item.bare).join(' ')
    const version = ++selection.current
    setSelected(index); setSelectedTo(to); setRevealed(first.segment); setAnalysis(undefined); setGloss(''); setWordError(null); setWordBusy(true)
    try {
      const result = await explainWord(text, segments[first.segment].he, session?.token)
      if (selection.current !== version) return
      setAnalysis(result.analysis); setGloss(result.gloss)
    } catch (failure) { if (selection.current === version) setWordError((failure as Error).message) }
    finally { if (selection.current === version) setWordBusy(false) }
  }
  const close = () => { selection.current++; setSelected(null); void Speech.stop() }
  const last = selected === null ? null : (selectedTo ?? selected)
  const word = selected === null || last === null ? null
    : { bare: words.slice(selected, last + 1).map(item => item.bare).join(' '), segment: words[selected].segment }
  const isPhrase = selected !== null && last !== null && last > selected
  const highlighted = dragRange ?? (selected === null ? null : { from: selected, to: last! })
  // A selected phrase is saved as written; a single word by its dictionary form.
  const lemma = isPhrase ? word!.bare : analysis?.lemma || word?.bare || ''
  const wordSaved = !!word && savedWords.has(vocabId(lemma))
  const phrase = !isPhrase && analysis?.phrase?.text ? analysis.phrase : null
  const phraseSaved = !!phrase && savedWords.has(vocabId(phrase.text))
  // Saves the tapped word, or the multi-word phrase it belongs to, with its source sentence.
  const saveWord = async (asPhrase = false) => {
    if (!session) { router.push('/login'); return }
    if (!word || !gloss || savingWord || (asPhrase ? !phrase || phraseSaved : wordSaved)) return
    const segment = segments[word.segment]
    const id = vocabId(asPhrase ? phrase!.text : lemma)
    const entry: VocabEntry = {
      id, createdAt: Date.now(), frequency: 1, context: segment.he, contextTranslation: segment.en,
      ...(asPhrase ? { lemma: phrase!.text, gloss: phrase!.meaning, surface: phrase!.text, partOfSpeech: 'phrase' } : isPhrase ? {
        lemma, gloss, surface: word.bare, vocalized: analysis?.vocalized, partOfSpeech: 'phrase',
      } : {
        lemma, gloss: analysis?.lemmaMeaning || gloss, surface: word.bare, vocalized: analysis?.vocalized, partOfSpeech: analysis?.partOfSpeech,
        ...(analysis?.root ? { root: analysis.root } : {}),
      }),
      ...(saved ? { sourceRef: { textId: docId.current, chunkId: `${docId.current}-${word.segment}` } } : {}),
    }
    setSavingWord(true); setWordError(null)
    try { await request('vocab', { token: session.token, body: entry }); setSavedWords(current => new Set(current).add(id)) }
    catch (failure) { setWordError((failure as Error).message) } finally { setSavingWord(false) }
  }
  const nextEnglish: Record<EnglishMode, EnglishMode> = { tap: 'all', all: 'off', off: 'tap' }
  const englishLabel: Record<EnglishMode, string> = { tap: 'English: tapped', all: 'English: all', off: 'English: off' }
  const cycleEnglish = () => setEnglish(value => { setPref('english', nextEnglish[value]); return nextEnglish[value] })
  const toggleNiqqud = () => setShowNiqqud(value => { setPref('showNiqqud', !value); return !value })
  // Drag across words to explain them together. A mostly horizontal move takes over from
  // the word's tap; positions come from each word's box in its paragraph. The selection
  // stays inside the sentence the drag started in.
  const wordUnder = (line: number, event: GestureResponderEvent) => {
    const origin = drag.current?.origin
    const boxes = wordBoxes.current.get(line)
    return origin && boxes ? wordAt(boxes, event.nativeEvent.pageX - origin.x, event.nativeEvent.pageY - origin.y) : undefined
  }
  const dragHandlers = (line: number) => ({
    onStartShouldSetResponderCapture: (event: GestureResponderEvent) => {
      drag.current = { line, x0: event.nativeEvent.pageX, y0: event.nativeEvent.pageY }
      lines.current.get(line)?.measureInWindow((x, y) => { if (drag.current?.line === line) drag.current.origin = { x, y } })
      return false
    },
    onMoveShouldSetResponderCapture: (event: GestureResponderEvent) => {
      const current = drag.current
      if (!current || current.line !== line || !current.origin) return false
      const dx = Math.abs(event.nativeEvent.pageX - current.x0)
      const dy = Math.abs(event.nativeEvent.pageY - current.y0)
      if (dx < 10 || dx < dy * 1.5) return false
      const start = wordAt(wordBoxes.current.get(line) ?? new Map(), current.x0 - current.origin.x, current.y0 - current.origin.y)
      if (start === undefined) return false
      current.start = start
      return true
    },
    onResponderGrant: () => {
      const start = drag.current!.start!
      drag.current!.range = { from: start, to: start }
      setDragRange({ from: start, to: start })
      return true
    },
    onResponderMove: (event: GestureResponderEvent) => {
      const current = drag.current
      const under = wordUnder(line, event)
      if (!current || current.start === undefined || under === undefined) return
      const sentence = words[current.start].segment
      const clamped = Math.min(Math.max(under, indexOfFirstWord[sentence]), indexOfLastWord[sentence])
      current.range = rangeOf(current.start, clamped)
      setDragRange(current.range)
    },
    onResponderTerminationRequest: () => false,
    onResponderRelease: () => {
      const range = drag.current?.range
      drag.current = null; setDragRange(null)
      if (range) void select(range.from, range.to)
    },
    onResponderTerminate: () => { drag.current = null; setDragRange(null) },
  })
  // Shows a "More below" hint until the explanation is scrolled to its end.
  const measureMore = ({ layoutMeasurement, contentOffset, contentSize }: NativeScrollEvent) => setMoreBelow(contentOffset.y + layoutMeasurement.height < contentSize.height - 8)
  const speak = (text: string) => { void Speech.stop(); Speech.speak(text, { language: 'he-IL', rate: 0.8 }) }

  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <ScrollView scrollEnabled={!dragRange} contentContainerStyle={[styles.content, { gap: 14, paddingBottom: word ? sheetHeight + 24 : 36 }]}>
      <View style={[styles.row, { gap: 8 }]}>
        <Pill icon={english === 'off' ? 'eye-off-outline' : 'eye-outline'} label={englishLabel[english]} active={english !== 'off'} onPress={cycleEnglish} accessibilityLabel={`${englishLabel[english]}. Change`} />
        <Pill label="Vowels" active={showNiqqud} onPress={toggleNiqqud} accessibilityLabel={showNiqqud ? 'Hide vowels' : 'Show vowels'} />
        <Pill icon="volume-medium-outline" label="Listen" onPress={() => speak(recognition.text)} accessibilityLabel="Listen in Hebrew" />
        <FeedbackButton screen="reader" context={() => ({ raw: recognition.raw, source: recognition.source, omitted: recognition.omitted, readError: recognition.readError, segments, word: word?.bare, sentence: word ? segments[word.segment].he : undefined, gloss, analysis })} />
      </View>
      <Text style={[styles.copy, { fontSize: 14 }]}>Tap a word to see what it means here{english === 'tap' ? ' and its sentence in English' : ''}, or drag across words to explain a phrase.</Text>
      {!!recognition.readError && <Text style={reader.edge}>Read with basic text recognition, so some letters may be wrong.</Text>}
      <View style={[styles.card, { gap: 0, paddingVertical: 8 }]}>
        {paragraphs.map((members, p) => {
          const first = segments[members[0]]
          const last = segments[members[members.length - 1]]
          const shown = english === 'all' ? members : english === 'tap' && revealed !== null && members.includes(revealed) ? [revealed] : []
          const translation = shown.map(s => segments[s]).filter(segment => segment.en).map(segment => `${segment.marker ? `${segment.marker}. ` : ''}${segment.en}`).join(' ')
          return <View key={p} style={[reader.segment, p > 0 && !paged && reader.divider]}>
            {first.joined && <Text style={reader.edge}>Starts on the previous page</Text>}
            {first.cutStart && <Text style={reader.edge}>Continued from the previous page</Text>}
            <View style={reader.line} ref={view => { if (view) lines.current.set(p, view); else lines.current.delete(p) }} {...dragHandlers(p)}>
              {members.map(s => <Fragment key={s}>
                {segments[s].marker && <Text style={[reader.word, reader.marker]}>{segments[s].marker}.</Text>}
                {indexOfFirstWord[s] === undefined ? <Text style={reader.word}>{segments[s].he}</Text>
                  : words.slice(indexOfFirstWord[s], indexOfLastWord[s] + 1).map((item, offset) => {
                    const i = indexOfFirstWord[s] + offset
                    const inSelection = highlighted && i >= highlighted.from && i <= highlighted.to
                    return <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Explain ${item.bare}`} onPress={() => void select(i)}
                      onLayout={event => { const boxes = wordBoxes.current.get(p) ?? new Map<number, Rect>(); boxes.set(i, event.nativeEvent.layout); wordBoxes.current.set(p, boxes) }}
                      style={[reader.wordBox, inSelection ? { backgroundColor: colors.lime } : english === 'tap' && shown.includes(s) && members.length > 1 && reader.current]}>
                      <Text style={[reader.word, segments[s].heading && reader.heading]}>{showNiqqud ? item.surface : stripNiqqud(item.surface)}</Text>
                    </Pressable>
                  })}
              </Fragment>)}
            </View>
            {!!translation && <Text selectable style={[reader.english, first.heading && { fontWeight: '600' }]}>{translation}</Text>}
            {last.cutEnd && <Text style={reader.edge}>Continues on the next page</Text>}
          </View>
        })}
      </View>
      <ErrorNotice message={error} />
      <Button title={saved ? 'Saved to library ✓' : 'Save passage'} disabled={saved} busy={busy} onPress={save} />
      {saved && <TextButton title="Remove from library" onPress={() => void remove()} />}
    </ScrollView>

    {word && <View style={[reader.sheet, { paddingBottom: 16 + insets.bottom }]} accessibilityViewIsModal onLayout={event => setSheetHeight(event.nativeEvent.layout.height)}>
      <View style={reader.sheetHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={10}><Ionicons name="close" size={24} color={colors.muted} /></Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={isPhrase ? 'Hear this phrase' : 'Hear this word'} onPress={() => speak(analysis?.vocalized || word.bare)} hitSlop={10}><Ionicons name="volume-medium-outline" size={24} color={colors.green} /></Pressable>
          <Text style={reader.sheetWord}>{analysis?.vocalized || word.bare}</Text>
        </View>
      </View>
      <View>
        {/* Height follows the screen; long explanations scroll, with a hint that there is more. */}
        <ScrollView style={{ maxHeight: Math.max(200, screenHeight * 0.42) }} contentContainerStyle={{ gap: 14, paddingBottom: 4 }} scrollEventThrottle={64}
          onScroll={event => measureMore(event.nativeEvent)}
          onContentSizeChange={(_, contentHeight) => setMoreBelow(contentHeight > Math.max(200, screenHeight * 0.42) + 8)}>
          {wordBusy ? <View style={[styles.row, { gap: 8 }]}><ActivityIndicator color={colors.green} /><Text style={styles.copy}>Reading it in context…</Text></View> : <>
            {!isPhrase && !!analysis?.readAs && stripNiqqud(analysis.readAs) !== word.bare && <Text style={reader.fact}>The photo text reads <Text style={reader.factHebrew}>{isolateHebrew(word.bare)}</Text>; this is probably <Text style={reader.factHebrew}>{isolateHebrew(analysis.readAs)}</Text>.</Text>}
            {!!gloss && <Section label="In this sentence"><Text style={reader.meaning}>{isolateHebrew(gloss)}</Text></Section>}
            {analysis && analysis.parts.length > 1 && <Section label="Breakdown"><View style={reader.parts}>
              {analysis.parts.map((part, i) => <View key={i} style={reader.part}><Text style={reader.partHebrew}>{part.text}</Text><Text style={reader.partMeaning}>{isolateHebrew(part.meaning)}</Text></View>)}
            </View></Section>}
            {phrase && <Section label="Phrase"><View style={reader.phrase}>
              <Text style={[reader.fact, { flex: 1 }]}><Text style={reader.factHebrew}>{isolateHebrew(phrase.text)}</Text> · {isolateHebrew(phrase.meaning)}</Text>
              <TextButton title={phraseSaved ? 'Saved ✓' : 'Save phrase'} color={colors.green} onPress={() => void saveWord(true)} />
            </View></Section>}
            {analysis && <WordFacts analysis={analysis} gloss={gloss} />}
            {!analysis && !!gloss && <Text style={[styles.copy, { fontSize: 13 }]}>Detailed explanation unavailable, so this is a direct translation.</Text>}
          </>}
          <ErrorNotice message={wordError} />
        </ScrollView>
        {moreBelow && <Text style={reader.more} pointerEvents="none">More below ↓</Text>}
      </View>
      <View style={[styles.row, { flexWrap: 'nowrap' }]}>
        {/* Hebrew reads right-to-left: the next word is to the left. */}
        <Pressable accessibilityRole="button" accessibilityLabel="Next word" disabled={last! >= words.length - 1} onPress={() => void select(last! + 1)} style={[reader.nav, last! >= words.length - 1 && { opacity: 0.3 }]}><Ionicons name="chevron-back" size={22} color={colors.green} /></Pressable>
        <Button secondary={wordSaved} title={wordSaved ? 'Saved ✓' : isPhrase ? 'Save phrase' : 'Save word'} disabled={wordBusy || !gloss || wordSaved} busy={savingWord} onPress={() => void saveWord()} style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Previous word" disabled={selected! <= 0} onPress={() => void select(selected! - 1)} style={[reader.nav, selected! <= 0 && { opacity: 0.3 }]}><Ionicons name="chevron-forward" size={22} color={colors.green} /></Pressable>
      </View>
    </View>}
  </View>
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return <View style={{ gap: 4 }}><Text style={reader.label}>{label}</Text>{children}</View>
}

// Dictionary entry (form, other senses, root, grammar) and an optional note, always in this order.
function WordFacts({ analysis, gloss }: { analysis: WordAnalysis; gloss: string }) {
  const grammar = [analysis.partOfSpeech, analysis.binyan, analysis.form].filter(Boolean).join(' · ')
  const showLemma = !!analysis.lemma && stripNiqqud(analysis.lemma) !== stripNiqqud(analysis.vocalized || analysis.word)
  const senses = otherSenses(analysis.lemmaMeaning || '', gloss)
  const hasEntry = showLemma || !!senses || !!analysis.root || !!grammar
  return <>
    {hasEntry && <Section label="Dictionary">
      {showLemma && <Text style={reader.fact}><Text style={reader.factHebrew}>{isolateHebrew(analysis.lemma)}</Text>{senses ? ` · ${isolateHebrew(senses)}` : ''}</Text>}
      {!showLemma && !!senses && <Text style={reader.fact}>Other senses: {isolateHebrew(senses)}</Text>}
      {(!!analysis.root || !!grammar) && <Text style={reader.fact}>{analysis.root ? <>Root <Text style={reader.factHebrew}>{isolateHebrew(analysis.root)}</Text>{grammar ? ' · ' : ''}</> : null}{grammar}</Text>}
    </Section>}
    {!!analysis.note && <Section label="Note"><Text style={reader.fact}>{isolateHebrew(analysis.note)}</Text></Section>}
  </>
}

const reader = StyleSheet.create({
  segment: { paddingVertical: 10, gap: 4 },
  edge: { fontSize: 12, color: colors.muted, fontStyle: 'italic' },
  phrase: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.paper },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  line: { flexDirection: 'row-reverse', flexWrap: 'wrap', columnGap: 2 },
  wordBox: { borderRadius: 6, paddingHorizontal: 3 },
  // The sentence whose English is showing, when it shares a paragraph with others.
  current: { backgroundColor: '#EEF3E4' },
  word: { fontSize: 21, lineHeight: 32, color: colors.ink, writingDirection: 'rtl' },
  heading: { fontWeight: '700' },
  marker: { color: colors.muted, paddingHorizontal: 3 },
  english: { fontSize: 15, lineHeight: 22, color: colors.muted },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, gap: 12, backgroundColor: colors.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 1, borderColor: colors.line, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetWord: { fontSize: 28, lineHeight: 42, fontWeight: '600', color: colors.ink, writingDirection: 'rtl', flexShrink: 1 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
  more: { position: 'absolute', right: 0, bottom: 0, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden', fontSize: 12, fontWeight: '600', color: colors.green, backgroundColor: colors.white },
  meaning: { fontSize: 19, lineHeight: 26, fontWeight: '600', color: colors.ink, writingDirection: 'ltr', textAlign: 'left' },
  parts: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  part: { maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.paper, alignItems: 'center' },
  partHebrew: { fontSize: 19, lineHeight: 28, color: colors.ink, writingDirection: 'rtl' },
  partMeaning: { fontSize: 12, color: colors.muted, textAlign: 'center', writingDirection: 'ltr' },
  // English explanations are always left-to-right, whatever letter they start with.
  fact: { fontSize: 14, lineHeight: 24, color: colors.muted, writingDirection: 'ltr', textAlign: 'left' },
  factHebrew: { color: colors.ink, fontSize: 16 },
  nav: { width: 46, height: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
})

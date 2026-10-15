import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { paragraphsOf, runsOf } from '../lib/page'
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
  // Height of whatever sits over the bottom of the page (word drawer or sentence bar), so the
  // passage can be padded by it and the active sentence scrolled clear of it.
  const [overlayHeight, setOverlayHeight] = useState(0)
  const [details, setDetails] = useState(false)
  const scroller = useRef<ScrollView>(null)
  const frame = useRef<View>(null)
  const activeRun = useRef<View | null>(null)
  const scrollY = useRef(0)
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
  const lines = useRef(new Map<string, View>())
  // Each word's box within the line (run) it is drawn in.
  const wordBoxes = useRef(new Map<number, Rect>())
  const drag = useRef<{ line: string; words: number[]; x0: number; y0: number; origin?: { x: number; y: number }; start?: number; range?: { from: number; to: number } } | null>(null)
  const [analysis, setAnalysis] = useState<WordAnalysis | undefined>()
  const [gloss, setGloss] = useState('')
  const [wordBusy, setWordBusy] = useState(false)
  const [wordError, setWordError] = useState<string | null>(null)
  const [savingWord, setSavingWord] = useState(false)
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set())
  const [english, setEnglish] = useState<EnglishMode>('tap')
  // Three states: reading (nothing active), a sentence active (highlighted, English under it,
  // sentence bar), and a word or phrase selected in it (drawer). Closing the drawer goes back
  // to the sentence; closing the sentence bar goes back to reading.
  const [active, setActive] = useState<number | null>(null)
  const [showNiqqud, setShowNiqqud] = useState(true)
  const selection = useRef(0)
  const docId = useRef(recognition?.id ?? Crypto.randomUUID())
  useFocusEffect(useCallback(() => () => { selection.current++; void Speech.stop() }, []))
  useEffect(() => { void getPref('english').then(setEnglish); void getPref('showNiqqud').then(setShowNiqqud) }, [])
  // Keep the active sentence in view above whatever covers the bottom of the screen.
  useEffect(() => {
    if (active === null) return
    const id = requestAnimationFrame(() => {
      const run = activeRun.current
      if (!run || !frame.current) return
      frame.current.measureInWindow((_x, frameY, _w, frameHeight) => run.measureInWindow((_rx, runY, _rw, runHeight) => {
        const top = frameY + 8
        const bottom = frameY + frameHeight - overlayHeight - 12
        if (runY >= top && runY + runHeight <= bottom) return
        const delta = runY < top || runHeight > bottom - top ? runY - top : runY + runHeight - bottom
        scroller.current?.scrollTo({ y: Math.max(0, scrollY.current + delta), animated: true })
      }))
    })
    return () => cancelAnimationFrame(id)
  }, [active, overlayHeight, english])
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
    setSelected(index); setSelectedTo(to); setActive(first.segment); setDetails(false); setAnalysis(undefined); setGloss(''); setWordError(null); setWordBusy(true)
    try {
      const result = await explainWord(text, segments[first.segment].he, session?.token)
      if (selection.current !== version) return
      setAnalysis(result.analysis); setGloss(result.gloss)
    } catch (failure) { if (selection.current === version) setWordError((failure as Error).message) }
    finally { if (selection.current === version) setWordBusy(false) }
  }
  const close = () => { selection.current++; setSelected(null); void Speech.stop() }
  const sentences = segments.map((_, i) => i).filter(i => indexOfFirstWord[i] !== undefined)
  const activePosition = active === null ? -1 : sentences.indexOf(active)
  const goSentence = (step: number) => {
    const next = sentences[activePosition + step]
    if (next === undefined) return
    close(); setActive(next)
  }
  const leaveSentence = () => { close(); setActive(null) }
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
  const boxesOf = (indices: number[]) => new Map(indices.flatMap(i => { const box = wordBoxes.current.get(i); return box ? [[i, box] as const] : [] }))
  const wordUnder = (event: GestureResponderEvent) => {
    const current = drag.current
    return current?.origin ? wordAt(boxesOf(current.words), event.nativeEvent.pageX - current.origin.x, event.nativeEvent.pageY - current.origin.y) : undefined
  }
  const dragHandlers = (line: string, indices: number[]) => ({
    onStartShouldSetResponderCapture: (event: GestureResponderEvent) => {
      drag.current = { line, words: indices, x0: event.nativeEvent.pageX, y0: event.nativeEvent.pageY }
      lines.current.get(line)?.measureInWindow((x, y) => { if (drag.current?.line === line) drag.current.origin = { x, y } })
      return false
    },
    onMoveShouldSetResponderCapture: (event: GestureResponderEvent) => {
      const current = drag.current
      if (!current || current.line !== line || !current.origin) return false
      const dx = Math.abs(event.nativeEvent.pageX - current.x0)
      const dy = Math.abs(event.nativeEvent.pageY - current.y0)
      if (dx < 10 || dx < dy * 1.5) return false
      const start = wordAt(boxesOf(current.words), current.x0 - current.origin.x, current.y0 - current.origin.y)
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
      const under = wordUnder(event)
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

  const wordsOf = (segment: number) => indexOfFirstWord[segment] === undefined ? [] : words.slice(indexOfFirstWord[segment], indexOfLastWord[segment] + 1).map((item, offset) => ({ ...item, i: indexOfFirstWord[segment] + offset }))
  const englishOf = (segment: number) => { const { en, marker } = segments[segment]; return en ? `${marker ? `${marker}. ` : ''}${en}` : '' }
  const hasDetails = !!analysis && (analysis.parts.length > 1 || !!phrase || !!analysis.note || !!analysis.root || !!analysis.lemmaMeaning || !!analysis.partOfSpeech || (!!analysis.readAs && stripNiqqud(analysis.readAs) !== word?.bare))
  const detailsHeight = Math.max(180, screenHeight * 0.4)

  return <View ref={frame} style={{ flex: 1, backgroundColor: colors.paper }}>
    <ScrollView ref={scroller} scrollEnabled={!dragRange} scrollEventThrottle={32} onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y }}
      contentContainerStyle={[styles.content, { gap: 10, paddingTop: 14, paddingBottom: active !== null ? overlayHeight + 24 : 36 }]}>
      <View style={[styles.row, { gap: 8 }]}>
        <Pill icon={english === 'off' ? 'eye-off-outline' : 'eye-outline'} label={englishLabel[english]} active={english !== 'off'} onPress={cycleEnglish} accessibilityLabel={`${englishLabel[english]}. Change`} />
        <Pill label="Vowels" active={showNiqqud} onPress={toggleNiqqud} accessibilityLabel={showNiqqud ? 'Hide vowels' : 'Show vowels'} />
        <Pill icon="volume-medium-outline" label="Listen" onPress={() => speak(recognition.text)} accessibilityLabel="Listen in Hebrew" />
        <FeedbackButton screen="reader" context={() => ({ raw: recognition.raw, source: recognition.source, omitted: recognition.omitted, readError: recognition.readError, segments, active, word: word?.bare, sentence: word ? segments[word.segment].he : undefined, gloss, analysis })} />
      </View>
      {active === null && <Text style={[styles.copy, { fontSize: 13, lineHeight: 18 }]}>Tap a word for its meaning; drag across words for a phrase.</Text>}
      {!!recognition.readError && <Text style={reader.edge}>Read with basic text recognition, so some letters may be wrong.</Text>}
      <View style={[styles.card, { gap: 0, paddingVertical: 6, paddingHorizontal: 14 }]}>
        {paragraphs.map((members, p) => {
          const first = segments[members[0]]
          const last = segments[members[members.length - 1]]
          return <View key={p} style={[reader.paragraph, p > 0 && !paged && reader.divider]}>
            {first.joined && <Text style={reader.edge}>Starts on the previous page</Text>}
            {first.cutStart && <Text style={reader.edge}>Continued from the previous page</Text>}
            {runsOf(members, english === 'all', active).map(run => {
              const key = `${p}-${run.segments[0]}`
              const runWords = run.segments.flatMap(wordsOf)
              const translation = english === 'all' || (english === 'tap' && run.active) ? run.segments.map(englishOf).filter(Boolean).join(' ') : ''
              return <View key={key} ref={view => { if (run.active) activeRun.current = view }} style={[reader.run, run.active && reader.activeRun]}>
                <View style={reader.line} ref={view => { if (view) lines.current.set(key, view); else lines.current.delete(key) }} {...dragHandlers(key, runWords.map(item => item.i))}>
                  {run.segments.map(s => [
                    segments[s].marker ? <Text key={`m${s}`} style={[reader.word, reader.marker]}>{segments[s].marker}.</Text> : null,
                    indexOfFirstWord[s] === undefined ? <Text key={`t${s}`} style={reader.word}>{segments[s].he}</Text> : null,
                    ...wordsOf(s).map(item => {
                      const inSelection = highlighted && item.i >= highlighted.from && item.i <= highlighted.to
                      return <Pressable key={item.i} accessibilityRole="button" accessibilityLabel={`Explain ${item.bare}`} onPress={() => void select(item.i)}
                        onLayout={event => { wordBoxes.current.set(item.i, event.nativeEvent.layout) }}
                        style={[reader.wordBox, inSelection && reader.selectedWord]}>
                        <Text style={[reader.word, segments[s].heading && reader.heading]}>{showNiqqud ? item.surface : stripNiqqud(item.surface)}</Text>
                      </Pressable>
                    }),
                  ])}
                </View>
                {!!translation && <Text selectable style={[reader.english, first.heading && { fontWeight: '600' }]}>{translation}</Text>}
              </View>
            })}
            {last.cutEnd && <Text style={reader.edge}>Continues on the next page</Text>}
          </View>
        })}
      </View>
      <ErrorNotice message={error} />
      <Button title={saved ? 'Saved to library ✓' : 'Save passage'} disabled={saved} busy={busy} onPress={save} />
      {saved && <TextButton title="Remove from library" onPress={() => void remove()} />}
    </ScrollView>

    {/* Sentence bar: moving between sentences is separate from studying a word. */}
    {active !== null && !word && <View style={[reader.overlay, reader.bar, { paddingBottom: 10 + insets.bottom }]} onLayout={event => setOverlayHeight(event.nativeEvent.layout.height)}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous sentence" disabled={activePosition <= 0} onPress={() => goSentence(-1)} hitSlop={8} style={[reader.barButton, activePosition <= 0 && { opacity: 0.3 }]}>
        <Ionicons name="chevron-up" size={20} color={colors.green} /><Text style={reader.barLabel}>Previous</Text>
      </Pressable>
      <Text style={reader.barCount}>Sentence {activePosition + 1} of {sentences.length}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Next sentence" disabled={activePosition >= sentences.length - 1} onPress={() => goSentence(1)} hitSlop={8} style={[reader.barButton, activePosition >= sentences.length - 1 && { opacity: 0.3 }]}>
        <Text style={reader.barLabel}>Next</Text><Ionicons name="chevron-down" size={20} color={colors.green} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Listen to this sentence" onPress={() => speak(segments[active].he)} hitSlop={8}><Ionicons name="volume-medium-outline" size={22} color={colors.green} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Done with this sentence" onPress={leaveSentence} hitSlop={8}><Ionicons name="close" size={22} color={colors.muted} /></Pressable>
    </View>}

    {/* Word drawer: compact by default (meaning and save); details expand on request. */}
    {word && <View style={[reader.overlay, reader.sheet, { paddingBottom: 12 + insets.bottom }]} accessibilityViewIsModal onLayout={event => setOverlayHeight(event.nativeEvent.layout.height)}>
      <View style={reader.sheetHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={10}><Ionicons name="close" size={22} color={colors.muted} /></Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={isPhrase ? 'Hear this phrase' : 'Hear this word'} onPress={() => speak(analysis?.vocalized || word.bare)} hitSlop={10}><Ionicons name="volume-medium-outline" size={22} color={colors.green} /></Pressable>
          <Text style={reader.sheetWord}>{analysis?.vocalized || word.bare}</Text>
        </View>
      </View>
      {wordBusy ? <View style={[styles.row, { gap: 8 }]}><ActivityIndicator color={colors.green} /><Text style={styles.copy}>Reading it in context…</Text></View>
        : !!gloss && <Text style={reader.meaning}>{isolateHebrew(gloss)}</Text>}
      {!wordBusy && !analysis && !!gloss && <Text style={[styles.copy, { fontSize: 13 }]}>Detailed explanation unavailable, so this is a direct translation.</Text>}
      {details && !wordBusy && analysis && <View>
        <ScrollView style={{ maxHeight: detailsHeight }} contentContainerStyle={{ gap: 12, paddingBottom: 4 }} scrollEventThrottle={64}
          onScroll={event => measureMore(event.nativeEvent)}
          onContentSizeChange={(_, contentHeight) => setMoreBelow(contentHeight > detailsHeight + 8)}>
          {!isPhrase && !!analysis.readAs && stripNiqqud(analysis.readAs) !== word.bare && <Text style={reader.fact}>The photo text reads <Text style={reader.factHebrew}>{isolateHebrew(word.bare)}</Text>; this is probably <Text style={reader.factHebrew}>{isolateHebrew(analysis.readAs)}</Text>.</Text>}
          {analysis.parts.length > 1 && <Section label="Breakdown"><View style={reader.parts}>
            {analysis.parts.map((part, i) => <View key={i} style={reader.part}><Text style={reader.partHebrew}>{part.text}</Text><Text style={reader.partMeaning}>{isolateHebrew(part.meaning)}</Text></View>)}
          </View></Section>}
          {phrase && <Section label="Phrase"><View style={reader.phrase}>
            <Text style={[reader.fact, { flex: 1 }]}><Text style={reader.factHebrew}>{isolateHebrew(phrase.text)}</Text> · {isolateHebrew(phrase.meaning)}</Text>
            <TextButton title={phraseSaved ? 'Saved ✓' : 'Save phrase'} color={colors.green} onPress={() => void saveWord(true)} />
          </View></Section>}
          <WordFacts analysis={analysis} gloss={gloss} />
        </ScrollView>
        {moreBelow && <Text style={reader.more} pointerEvents="none">More below ↓</Text>}
      </View>}
      <ErrorNotice message={wordError} />
      <View style={[styles.row, { flexWrap: 'nowrap', gap: 10 }]}>
        {hasDetails && !wordBusy && <Pressable accessibilityRole="button" onPress={() => setDetails(value => !value)} style={reader.detailsToggle} hitSlop={6}>
          <Text style={reader.barLabel}>{details ? 'Less' : 'Details'}</Text><Ionicons name={details ? 'chevron-down' : 'chevron-up'} size={16} color={colors.green} />
        </Pressable>}
        <Button secondary={wordSaved} title={wordSaved ? 'Saved ✓' : isPhrase ? 'Save phrase' : 'Save word'} disabled={wordBusy || !gloss || wordSaved} busy={savingWord} onPress={() => void saveWord()} style={{ flex: 1 }} />
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
  paragraph: { paddingVertical: 7, gap: 2 },
  run: { gap: 2, paddingVertical: 2 },
  // The active sentence: a quiet band behind it; the selected word stands out on top.
  activeRun: { backgroundColor: '#EEF3E4', borderRadius: 10, marginHorizontal: -8, paddingHorizontal: 8, paddingVertical: 6, marginVertical: 2 },
  selectedWord: { backgroundColor: colors.lime, borderWidth: 1, borderColor: colors.green, borderRadius: 6 },
  edge: { fontSize: 12, color: colors.muted, fontStyle: 'italic' },
  phrase: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.paper },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  line: { flexDirection: 'row-reverse', flexWrap: 'wrap', columnGap: 2 },
  wordBox: { borderRadius: 6, paddingHorizontal: 3, borderWidth: 1, borderColor: 'transparent' },
  word: { fontSize: 21, lineHeight: 32, color: colors.ink, writingDirection: 'rtl' },
  heading: { fontWeight: '700' },
  marker: { color: colors.muted, paddingHorizontal: 3 },
  english: { fontSize: 15, lineHeight: 21, color: colors.muted, writingDirection: 'ltr', textAlign: 'left', paddingBottom: 2 },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingTop: 10, backgroundColor: colors.white, borderTopWidth: 1, borderColor: colors.line },
  barButton: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  barLabel: { fontSize: 14, fontWeight: '600', color: colors.green },
  barCount: { fontSize: 13, color: colors.muted },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 10, height: 50 },
  sheet: { paddingHorizontal: 18, paddingTop: 14, gap: 10, backgroundColor: colors.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 1, borderColor: colors.line, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetWord: { fontSize: 26, lineHeight: 38, fontWeight: '600', color: colors.ink, writingDirection: 'rtl', flexShrink: 1 },
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
})

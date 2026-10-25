import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type GestureResponderEvent, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import * as Crypto from 'expo-crypto'
import { prefetchSpeech, useSpeech } from '../lib/speech'
import { ListenButton } from '../components/Listen'
import Animated from 'react-native-reanimated'
import { Button, colors, ErrorNotice, Page, Pill, Pressy, styles, TextButton } from '../components/ui'
import { useWordLookup, WordDrawer } from '../components/WordDrawer'
import { APPEAR, REFLOW, SHEET_IN, SHEET_OUT } from '../lib/motion'
import { feel } from '../lib/feedback'
import { FeedbackButton } from '../components/Feedback'
import { request } from '../lib/api'
import { rangeOf, type Rect, wordAt } from '../lib/selection'
import { documentFromRecognition, segmentsOf } from '../lib/documents'
import { readingWords, titleFrom } from '../lib/ocr-cleanup'
import { paragraphsOf, runsOf } from '../lib/page'
import { type EnglishMode, getPref, rememberRead, setPref, TEXT_SIZES } from '../lib/prefs'
import { noteActivity } from '../lib/tree'
import { quickMeanings } from '../lib/recognition'
import { useSession } from '../state/session'
import { useVowels } from '../state/vowels'
import { isVowelled, pageWithVowels, withVowels } from '../lib/vowels'
import { useHebrew } from '../state/script'

// Runs reflow (REFLOW) when a sentence is selected and its English opens beneath it.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export default function Reader() {
  const he = useHebrew()
  const { recognition, session } = useSession()
  const insets = useSafeAreaInsets()
  const { height: screenHeight, width: screenWidth } = useWindowDimensions()
  // Turned sideways the page keeps clear of the notch, and the drawer and sentence bar sit in a
  // column of reading width in the middle rather than across the whole screen.
  const landscape = screenWidth > screenHeight
  const side = landscape ? Math.max(insets.left, insets.right, (screenWidth - 640) / 2) : 0
  const overlaySides = landscape ? [{ left: side, right: side }, reader.overlaySides] : null
  // Height of whatever sits over the bottom of the page (word drawer or sentence bar), so the
  // passage can be padded by it and the active sentence scrolled clear of it.
  const [overlayHeight, setOverlayHeight] = useState(0)
  const scroller = useRef<ScrollView>(null)
  const frame = useRef<View>(null)
  const activeRun = useRef<View | null>(null)
  const scrollY = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(recognition?.library === 'saved')
  // Read when a word is saved, which may be after the passage itself was.
  const savedNow = useRef(saved)
  useEffect(() => { savedNow.current = saved }, [saved])
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
  const [english, setEnglish] = useState<EnglishMode>('tap')
  // Three states: reading (nothing active), a sentence active (highlighted, English under it,
  // sentence bar), and a word or phrase selected in it (drawer). Closing the drawer goes back
  // to the sentence; closing the sentence bar goes back to reading.
  const [active, setActive] = useState<number | null>(recognition?.startAt ?? null)
  // Quick meanings for the words of each selected sentence (by segment), see quickMeanings.
  const [quick, setQuick] = useState<Record<number, string[]>>({})
  const [showNiqqud, setShowNiqqud] = useVowels()
  const v = (text: string) => withVowels(text, showNiqqud)
  // The Vowels button only appears for a page that is actually vowelled.
  const vowelled = useMemo(() => isVowelled(recognition?.text || ''), [recognition?.text])
  const docId = useRef(recognition?.id ?? Crypto.randomUUID())
  // Each sentence read for the first time here feeds the tree (lib/tree.ts).
  const readSentences = useRef(new Set<number>())
  useEffect(() => {
    if (active === null || readSentences.current.has(active)) return
    readSentences.current.add(active); noteActivity('sentences')
  }, [active])
  useEffect(() => { void getPref('english').then(setEnglish) }, [])
  // Text size (A− / A+), remembered on this device; the passage's Hebrew and English scale together.
  const [size, setSize] = useState(1)
  // How the reader works, said once: shown until a sentence has been selected for the first time.
  const [hint, setHint] = useState(false)
  useEffect(() => { void getPref('readerHint').then(setHint) }, [])
  useEffect(() => { void getPref('textSize').then(value => setSize(TEXT_SIZES.includes(Number(value)) ? Number(value) : 1)) }, [])
  const resize = (step: 1 | -1) => {
    const next = TEXT_SIZES[TEXT_SIZES.indexOf(size) + step]
    if (next === undefined) return
    feel('tick'); setSize(next); setPref('textSize', String(next))
  }
  const sized = useMemo(() => ({ word: { fontSize: 21 * size, lineHeight: 32 * size }, english: { fontSize: 15 * size, lineHeight: 21 * size } }), [size])
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
  const segments = useMemo(() => (recognition ? segmentsOf(recognition) : []), [recognition])
  // A page read keeps the page's paragraphs: dividers go between paragraphs, not sentences.
  const paged = recognition?.source === 'page'
  const words = useMemo(() => segments.flatMap((segment, index) => readingWords(segment.he).map(word => ({ ...word, segment: index }))), [segments])
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
  // The tapped word or dragged phrase, with its explanation and saving (components/WordDrawer.tsx);
  // a word's quick meaning from its sentence's shows until the explanation arrives.
  const tapped = selected === null ? undefined : words[selected]
  const lookup = useWordLookup(session, { quick: tapped ? quick[tapped.segment]?.[selected! - indexOfFirstWord[tapped.segment]] || '' : '', onLostError: setError })
  const { invalidate } = lookup
  useFocusEffect(useCallback(() => () => invalidate(), [invalidate]))
  // The sentence after this one that has words, where Next goes.
  const sentenceAfter = useCallback((segment: number) => {
    for (let i = segment + 1; i < segments.length; i++) if (indexOfFirstWord[i] !== undefined) return i
    return undefined
  }, [segments, indexOfFirstWord])
  // Selecting a sentence asks for its words' quick meanings straight away. Once they are in, the
  // next sentence's are asked for too (never before, so they can't hold this one up), so Next
  // opens on meanings already there; each sentence's are asked for only once, and are cached.
  useEffect(() => {
    if (active === null || !session || indexOfFirstWord[active] === undefined) return
    let current = true
    const meaningsOf = (segment: number) => quickMeanings(segments[segment].he, words.slice(indexOfFirstWord[segment], indexOfLastWord[segment] + 1).map(item => item.bare), session.token)
    void meaningsOf(active).then(meanings => {
      if (!current) return
      if (meanings.length) setQuick(known => ({ ...known, [active]: meanings }))
      const next = sentenceAfter(active)
      if (next !== undefined) void meaningsOf(next)
    })
    return () => { current = false }
  }, [active, session, segments, words, indexOfFirstWord, indexOfLastWord, sentenceAfter])
  // While a sentence is being listened to, the next one's audio is fetched, so Next and Listen
  // play at once. Only when listening: a recorded voice costs more than the meanings do.
  const { playing } = useSpeech()
  useEffect(() => {
    if (active === null || !session || playing !== segments[active]?.he) return
    const next = sentenceAfter(active)
    if (next !== undefined) void prefetchSpeech(segments[next].he, session.token)
  }, [playing, active, session, segments, sentenceAfter])
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
  // A capture is saved on opening; a passage opened from the library notes when it was opened.
  useEffect(() => {
    if (autosave) void persist()
    else if (saved && session) void request('texts', { token: session.token, method: 'PATCH', body: { textId: docId.current, opened: true } }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!recognition) return <Page><Text style={styles.title}>Find something to read.</Text><Button title="Open camera" onPress={() => router.replace('/camera')} /></Page>

  const select = (index: number, to = index) => {
    const first = words[index]
    if (!first) return
    feel('select')
    setSelected(index); setSelectedTo(to); setActive(first.segment)
    const segment = segments[first.segment]
    void lookup.open({
      text: words.slice(index, to + 1).map(item => item.bare).join(' '), sentence: segment.he, translation: segment.en, phrase: to > index,
      source: () => (savedNow.current ? { textId: docId.current, chunkId: `${docId.current}-${first.segment}` } : undefined),
    })
  }
  const close = () => { lookup.close(); setSelected(null) }
  const sentences = segments.map((_, i) => i).filter(i => indexOfFirstWord[i] !== undefined)
  const activePosition = active === null ? -1 : sentences.indexOf(active)
  // Where reading stopped, for Continue reading on Today and the Library's progress: only a
  // passage in the library can be opened again.
  const remember = (segment: number) => {
    if (!saved || !recognition || !session) return
    rememberRead(docId.current, segment, recognition.title || titleFrom(recognition.text))
    void request('texts', { token: session.token, method: 'PATCH', body: { textId: docId.current, read: segment } }).catch(() => {})
  }
  const goSentence = (step: number) => {
    const next = sentences[activePosition + step]
    if (next === undefined) return
    feel('tick'); close(); setActive(next); remember(next)
  }
  const leaveSentence = () => { close(); setActive(null) }
  // The first tap on a sentence only selects the sentence (its English, the sentence bar and
  // quick meanings); words are tapped or dragged once their sentence is selected.
  const chooseSentence = (segment: number) => {
    feel('tick'); close(); setActive(segment); remember(segment)
    if (hint) { setHint(false); setPref('readerHint', false) }
  }
  const last = selected === null ? null : (selectedTo ?? selected)
  const word = selected === null || last === null ? null
    : { bare: words.slice(selected, last + 1).map(item => item.bare).join(' '), segment: words[selected].segment }
  const highlighted = dragRange ?? (selected === null ? null : { from: selected, to: last! })
  const nextEnglish: Record<EnglishMode, EnglishMode> = { tap: 'all', all: 'off', off: 'tap' }
  const englishLabel: Record<EnglishMode, string> = { tap: 'EN · tap', all: 'EN · all', off: 'EN · off' }
  const englishSpoken: Record<EnglishMode, string> = { tap: 'for the tapped sentence', all: 'for every sentence', off: 'off' }
  const cycleEnglish = () => setEnglish(value => { setPref('english', nextEnglish[value]); return nextEnglish[value] })
  const toggleNiqqud = () => setShowNiqqud(!showNiqqud)
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
      if (start === undefined || words[start].segment !== active) return false
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
      const range = rangeOf(current.start, clamped)
      // A tick under the finger for every word the selection grows or shrinks by.
      if (range.from !== current.range?.from || range.to !== current.range?.to) feel('tick')
      current.range = range
      setDragRange(range)
    },
    onResponderTerminationRequest: () => false,
    onResponderRelease: () => {
      const range = drag.current?.range
      drag.current = null; setDragRange(null)
      if (range) void select(range.from, range.to)
    },
    onResponderTerminate: () => { drag.current = null; setDragRange(null) },
  })
  // A tap beside the words (between lines, at a line's end, on the English) selects the sentence
  // of the nearest word.
  const tapRun = (line: string, indices: number[], event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent
    lines.current.get(line)?.measureInWindow((x, y) => {
      const nearest = wordAt(boxesOf(indices), pageX - x, pageY - y)
      if (nearest !== undefined && words[nearest].segment !== active) chooseSentence(words[nearest].segment)
    })
  }

  const wordsOf = (segment: number) => indexOfFirstWord[segment] === undefined ? [] : words.slice(indexOfFirstWord[segment], indexOfLastWord[segment] + 1).map((item, offset) => ({ ...item, i: indexOfFirstWord[segment] + offset }))
  const englishOf = (segment: number) => { const { en, marker } = segments[segment]; return en ? `${marker ? `${marker}. ` : ''}${en}` : '' }

  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    {/* The toolbar stays put while the passage scrolls under it. Whole-page listening is gone,
        since every sentence has its own Listen. */}
    <View style={[styles.row, reader.toolbar, { paddingLeft: 22 + insets.left, paddingRight: 22 + insets.right }]}>
      <Pill icon={english === 'off' ? 'eye-off-outline' : 'eye-outline'} label={englishLabel[english]} active={english !== 'off'} onPress={cycleEnglish} accessibilityLabel={`English ${englishSpoken[english]}. Change`} />
      {/* Cursive is written without vowels, so it has no Vowels button. */}
      {vowelled && !he && <Pill label="Vowels" active={showNiqqud} onPress={toggleNiqqud} accessibilityLabel={showNiqqud ? 'Hide vowels' : 'Show vowels'} />}
      <View style={reader.sizes}>
        <Pressy moment="tick" depth={0.94} accessibilityRole="button" accessibilityLabel={`Smaller text, now ${Math.round(size * 100)}%`} onPress={() => resize(-1)} hitSlop={6} style={reader.size}><Text style={reader.sizeLabel}>A−</Text></Pressy>
        <View style={reader.sizesRule} />
        <Pressy moment="tick" depth={0.94} accessibilityRole="button" accessibilityLabel={`Larger text, now ${Math.round(size * 100)}%`} onPress={() => resize(1)} hitSlop={6} style={reader.size}><Text style={reader.sizeLabel}>A+</Text></Pressy>
      </View>
      <View style={{ marginLeft: 'auto' }}>
        <FeedbackButton variant="icon" screen="reader" context={() => ({ raw: recognition.raw, source: recognition.source, omitted: recognition.omitted, readError: recognition.readError, segments, active, word: word?.bare, sentence: word ? segments[word.segment].he : undefined, gloss: lookup.gloss, analysis: lookup.analysis })} />
      </View>
    </View>
    {/* The scrolling area, measured to keep the active sentence in view. */}
    <View ref={frame} style={{ flex: 1 }}>
    <ScrollView ref={scroller} scrollEnabled={!dragRange} scrollEventThrottle={32} onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y }}
      contentContainerStyle={[styles.content, { gap: 10, paddingTop: 10, paddingBottom: active !== null ? overlayHeight + 24 : 36, paddingLeft: 22 + insets.left, paddingRight: 22 + insets.right }]}>
      {active === null && hint && <Text style={[styles.copy, { fontSize: 13, lineHeight: 18 }]}>Tap a sentence to select it, then tap a word for its meaning or drag across words for a phrase.</Text>}
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
              return <AnimatedPressable key={key} accessible={false} layout={REFLOW} ref={(view: View | null) => { if (run.active) activeRun.current = view }} onPress={event => tapRun(key, runWords.map(item => item.i), event)} style={[reader.run, run.active && reader.activeRun]}>
                <View style={reader.line} ref={view => { if (view) lines.current.set(key, view); else lines.current.delete(key) }} {...dragHandlers(key, runWords.map(item => item.i))}>
                  {run.segments.map(s => [
                    segments[s].marker ? <Text key={`m${s}`} style={[reader.word, sized.word, reader.marker]}>{segments[s].marker}.</Text> : null,
                    indexOfFirstWord[s] === undefined ? <Text key={`t${s}`} style={[reader.word, sized.word, he]}>{segments[s].he}</Text> : null,
                    ...wordsOf(s).map(item => {
                      const inSelection = highlighted && item.i >= highlighted.from && item.i <= highlighted.to
                      return <Pressable key={item.i} accessibilityRole="button" accessibilityLabel={`Explain ${item.bare}`} onPress={() => (s === active ? void select(item.i) : chooseSentence(s))}
                        onLayout={event => { wordBoxes.current.set(item.i, event.nativeEvent.layout) }}
                        style={[reader.wordBox, inSelection && reader.selectedWord]}>
                        <Text style={[reader.word, sized.word, segments[s].heading && reader.heading, he]}>{pageWithVowels(item.surface, showNiqqud)}</Text>
                      </Pressable>
                    }),
                  ])}
                </View>
                {!!translation && <Animated.Text entering={APPEAR} selectable style={[reader.english, sized.english, first.heading && { fontWeight: '600' }]}>{translation}</Animated.Text>}
              </AnimatedPressable>
            })}
            {last.cutEnd && <Text style={reader.edge}>Continues on the next page</Text>}
          </View>
        })}
      </View>
      <ErrorNotice message={error} />
      <Button title={saved ? 'Saved to library ✓' : 'Save passage'} disabled={saved} busy={busy} onPress={save} />
      {saved && <TextButton title="Remove from library" onPress={() => void remove()} />}
    </ScrollView>
    </View>

    {/* Sentence bar: moving between sentences is separate from studying a word. */}
    {active !== null && !word && <Animated.View entering={SHEET_IN} exiting={SHEET_OUT} style={[reader.overlay, reader.bar, overlaySides, { paddingBottom: 10 + insets.bottom }]} onLayout={event => setOverlayHeight(event.nativeEvent.layout.height)}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous sentence" disabled={activePosition <= 0} onPress={() => goSentence(-1)} hitSlop={8} style={[reader.barButton, activePosition <= 0 && { opacity: 0.3 }]}>
        <Ionicons name="chevron-up" size={20} color={colors.green} /><Text style={reader.barLabel}>Previous</Text>
      </Pressable>
      <Text style={reader.barCount}>Sentence {activePosition + 1} of {sentences.length}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Next sentence" disabled={activePosition >= sentences.length - 1} onPress={() => goSentence(1)} hitSlop={8} style={[reader.barButton, activePosition >= sentences.length - 1 && { opacity: 0.3 }]}>
        <Text style={reader.barLabel}>Next</Text><Ionicons name="chevron-down" size={20} color={colors.green} />
      </Pressable>
      <ListenButton text={segments[active].he} accessibilityLabel="Listen to this sentence" />
      <Pressable accessibilityRole="button" accessibilityLabel="Done with this sentence" onPress={leaveSentence} hitSlop={8}><Ionicons name="close" size={22} color={colors.muted} /></Pressable>
    </Animated.View>}

    {/* Word drawer: compact by default (meaning and save); details expand on request. */}
    {word && <WordDrawer lookup={lookup} v={v} onClose={close} style={[overlaySides, { paddingBottom: 12 + insets.bottom }]} onLayout={event => setOverlayHeight(event.nativeEvent.layout.height)} />}
  </View>
}

const reader = StyleSheet.create({
  // A− | A+ as one control in the toolbar.
  sizes: { flexDirection: 'row', alignItems: 'center', minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  size: { minHeight: 34, paddingHorizontal: 11, justifyContent: 'center' },
  sizeLabel: { fontSize: 14, fontWeight: '600', color: colors.green },
  sizesRule: { width: 1, height: 18, backgroundColor: colors.line },
  toolbar: { gap: 8, paddingTop: 10, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, backgroundColor: colors.paper },
  paragraph: { paddingVertical: 7, gap: 2 },
  run: { gap: 2, paddingVertical: 2 },
  // The active sentence: a quiet band behind it; the selected word stands out on top.
  activeRun: { backgroundColor: '#EFEBDA', borderRadius: 10, marginHorizontal: -8, paddingHorizontal: 8, paddingVertical: 6, marginVertical: 2 },
  selectedWord: { backgroundColor: colors.lime, borderWidth: 1, borderColor: colors.green, borderRadius: 6 },
  edge: { fontSize: 12, color: colors.muted, fontStyle: 'italic' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  line: { flexDirection: 'row-reverse', flexWrap: 'wrap', columnGap: 2 },
  wordBox: { borderRadius: 6, paddingHorizontal: 3, borderWidth: 1, borderColor: 'transparent' },
  word: { fontSize: 21, lineHeight: 32, color: colors.ink, writingDirection: 'rtl' },
  heading: { fontWeight: '700' },
  marker: { color: colors.muted, paddingHorizontal: 3 },
  english: { fontSize: 15, lineHeight: 21, color: colors.muted, writingDirection: 'ltr', textAlign: 'left', paddingBottom: 2 },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  overlaySides: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingTop: 10, backgroundColor: colors.white, borderTopWidth: 1, borderColor: colors.line },
  barButton: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  barLabel: { fontSize: 14, fontWeight: '600', color: colors.green },
  barCount: { fontSize: 13, color: colors.muted },
})

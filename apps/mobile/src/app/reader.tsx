import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type GestureResponderEvent, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { router } from '../lib/nav'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import * as Crypto from 'expo-crypto'
import { prefetchSpeech, speak, stop as stopSpeaking, useSpeech } from '../lib/speech'
import { ListenButton } from '../components/Listen'
import Animated from 'react-native-reanimated'
import { Button, colors, ErrorNotice, Page, Pill, Pressy, styles, TextButton } from '../components/ui'
import { useWordLookup } from '../components/WordDrawer'
import { ReaderWordSheet } from '../components/ReaderWordSheet'
import { englishMatch } from '../lib/english-match'
import { APPEAR, REFLOW, SHEET_IN, SHEET_OUT } from '../lib/motion'
import { feel } from '../lib/feedback'
import { FeedbackButton } from '../components/Feedback'
import { request } from '../lib/api'
import { rangeOf, type Rect, rowEnd, wordAt } from '../lib/selection'
import { documentFromRecognition, segmentsOf } from '../lib/documents'
import { readingWords, titleFrom } from '../lib/ocr-cleanup'
import { paragraphsOf, runsOf } from '../lib/page'
import { type EnglishMode, getPref, rememberRead, setPref, TEXT_SIZES } from '../lib/prefs'
import { noteActivity } from '../lib/tree'
import { type SentenceWords, sentenceWords } from '../lib/recognition'
import { type LogEvent, sendStudyLog, studySession } from '../lib/study-log'
import { useOffer, useVisit } from '../lib/usage'
import { useSession } from '../state/session'
import { useVowels } from '../state/vowels'
import { isVowelled, pageWithVowels, withVowels } from '../lib/vowels'
import { useCursive, useHebrew } from '../state/script'
import { type Act, act, screenState } from '../lib/trace'

// Runs reflow (REFLOW) when a sentence is selected and its English opens beneath it.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

// The time, outside render (the reader's view events, logView).
const now = () => Date.now()
// How a sentence came to be selected (logged with `select`; `deselect` also says 'done' or 'left').
type SelectedVia = 'word' | 'sentence' | 'next' | 'previous'
export default function Reader() {
  const he = useHebrew()
  const [cursive, setCursive] = useCursive('reader')
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
  // Each selected sentence's words (by segment): their quick meanings, readings and English
  // (lib/recognition.ts sentenceWords); null when they couldn't be had, absent while on their way.
  const [quick, setQuick] = useState<Record<number, SentenceWords | null>>({})
  const quickNow = useRef(quick)
  useEffect(() => { quickNow.current = quick }, [quick])
  // A tapped word said aloud (Reader settings, sayOnTap).
  const [sayOnTap, setSayOnTap] = useState(true)
  useEffect(() => { void getPref('sayOnTap').then(setSayOnTap) }, [])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showNiqqud, setShowNiqqud] = useVowels()
  const v = (text: string) => withVowels(text, showNiqqud)
  // The Vowels button only appears for a page that is actually vowelled.
  const vowelled = useMemo(() => isVowelled(recognition?.text || ''), [recognition?.text])
  const docId = useRef(recognition?.id ?? Crypto.randomUUID())
  // Sent when the reader opens (whatever is waiting) and when it is left.
  useEffect(() => {
    if (!session) return
    void sendStudyLog(session.user.id, session.token)
    return () => { void sendStudyLog(session.user.id, session.token) }
  }, [session])
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
  const sized = useMemo(() => ({ word: { fontSize: 21 * size, lineHeight: 32 * size }, english: { fontSize: 15 * size, lineHeight: 21 * size }, wordGap: { paddingHorizontal: 2.75 * size } }), [size])
  const segments = useMemo(() => (recognition ? segmentsOf(recognition) : []), [recognition])
  // Reading kept as learning events (lib/study-log.ts): the passage opened, how far it was
  // scrolled (`view`), each sentence selected (with whether its English showed) and word looked up.
  const reading = useRef<ReturnType<typeof studySession> | null>(null)
  const startReading = () => {
    if (!session) return null
    if (!reading.current) {
      reading.current = studySession(session.user.id)
      reading.current.log('read', { text: docId.current, ...(recognition?.source ? { source: recognition.source } : {}) })
    }
    return reading.current
  }
  const logRead: LogEvent = (type, fields) => startReading()?.log(type, fields) ?? ''
  // The action that selected the sentence now active, in a debug capture (lib/trace.ts).
  const selected_ = useRef<Act | undefined>(undefined)
  // The sentence selected now and since when, and the English setting (to log its end).
  const selectedSince = useRef<{ segment: number; at: number } | null>(null)
  const englishNow = useRef<EnglishMode>(english)
  useEffect(() => { englishNow.current = english }, [english])
  const endSelected = (how: SelectedVia | 'done' | 'left') => {
    const since = selectedSince.current
    if (!since || !reading.current) return
    selectedSince.current = null
    reading.current.log('deselect', { text: docId.current, segment: since.segment, ms: now() - since.at, english: englishNow.current, how })
  }
  // Leaving the reader ends the sentence selected.
  const endOnLeave = useRef(endSelected)
  useEffect(() => { endOnLeave.current = endSelected })
  useEffect(() => () => endOnLeave.current('left'), [])
  // Opening a passage is logged at once (before 2026-11-17, only once something in it was selected).
  useEffect(() => { if (recognition) startReading() })
  // The part of the passage on screen, as fractions of its height (about which sentences were in
  // view: Learning Insights). Logged when a scroll comes to rest, at most every few seconds unless
  // it moved a good way.
  const contentHeight = useRef(0)
  const viewHeight = useRef(0)
  const lastView = useRef<{ at: number; from: number } | null>(null)
  const logView = () => {
    if (!contentHeight.current || !viewHeight.current) return
    const from = Math.max(0, Math.min(1, scrollY.current / contentHeight.current))
    const to = Math.max(0, Math.min(1, (scrollY.current + viewHeight.current) / contentHeight.current))
    const last = lastView.current
    if (last && now() - last.at < 5000 && Math.abs(from - last.from) < 0.1) return
    lastView.current = { at: now(), from }
    logRead('view', { text: docId.current, from: Math.round(from * 100) / 100, to: Math.round(to * 100) / 100 })
  }
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
  const tappedAt = tapped ? selected! - indexOfFirstWord[tapped.segment] : -1
  const tappedWords = tapped ? quick[tapped.segment] : undefined
  const lookup = useWordLookup(session, { quick: tappedWords?.meanings[tappedAt] || '', quickPending: !!session && !!tapped && tappedWords === undefined, onLostError: setError, log: logRead })
  const { invalidate } = lookup
  useFocusEffect(useCallback(() => () => invalidate(), [invalidate]))
  // The screen as a debug capture sees it, each time it changes: the sentence, its English setting,
  // its quick meanings and the drawer (lib/trace.ts; nothing without a capture).
  useEffect(() => {
    screenState('reader', {
      passage: docId.current, english,
      sentence: active === null ? null : { index: active, text: segments[active]?.he ?? '' },
      quickMeanings: active === null ? null : quick[active] === undefined ? 'loading' : quick[active] ? 'ready' : 'failed',
      drawer: lookup.tap ? { word: lookup.tap.text, loading: lookup.busy, meaning: !!lookup.gloss, explained: !!lookup.analysis } : null,
    })
  })
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
    const meaningsOf = (segment: number, action?: Act) => sentenceWords(segments[segment].he, words.slice(indexOfFirstWord[segment], indexOfLastWord[segment] + 1).map(item => item.bare), session.token,
      { translation: segments[segment].en || undefined, act: action })
    // In a debug capture, for the selection that made this sentence the active one, and the next
    // sentence's as a prefetch of its own, set off by it.
    const selection = selected_.current
    void meaningsOf(active, selection).then(answer => {
      if (!current) return
      // Kept even when none came (null), so a word tapped in it is explained another way.
      setQuick(known => ({ ...known, [active]: answer }))
      const next = sentenceAfter(active)
      if (next !== undefined) void meaningsOf(next, act('prefetch the next sentence’s meanings', { segment: next }, selection))
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
  // With English for the selected sentence only, the paragraph stays one flow of words and the
  // English goes in after the last word on the row the sentence ends on (rowEnd), so selecting
  // a sentence moves no word sideways: rows above stay, rows below only move down. `breakAt` is
  // that word, from the words' boxes; it is worked out again whenever the active paragraph's
  // words are laid out anew (another text size, the phone turned).
  const breakFor = useCallback((segment: number) => {
    const members = paragraphs.find(group => group.includes(segment)) ?? []
    const inParagraph = words.flatMap((word, i) => (members.includes(word.segment) ? [i] : []))
    return rowEnd(wordBoxes.current, inParagraph, indexOfLastWord[segment])
  }, [paragraphs, words, indexOfLastWord])
  const [breakAt, setBreakAt] = useState<number | null>(null)
  const [laidOut, setLaidOut] = useState(0)
  useEffect(() => {
    if (active === null || english !== 'tap') return
    const id = requestAnimationFrame(() => setBreakAt(current => { const next = breakFor(active); return current === next ? current : next }))
    return () => cancelAnimationFrame(id)
  }, [active, english, laidOut, breakFor])
  // The English's box in its paragraph, to keep it in view with its sentence.
  const englishBox = useRef<Rect | null>(null)
  // Keep the active sentence (and its English) in view above whatever covers the bottom of the
  // screen. `activeRun` is the sentence's own run with every translation showing, else its
  // paragraph, of which only the sentence's rows and its English count.
  useEffect(() => {
    if (active === null) return
    const id = requestAnimationFrame(() => {
      const run = activeRun.current
      if (!run || !frame.current) return
      const first = wordBoxes.current.get(indexOfFirstWord[active])
      const end = (english === 'tap' && englishBox.current) || wordBoxes.current.get(indexOfLastWord[active])
      const span = english !== 'all' && first && end ? { top: first.y, bottom: end.y + end.height } : null
      frame.current.measureInWindow((_x, frameY, _w, frameHeight) => run.measureInWindow((_rx, runTop, _rw, runFull) => {
        const runY = span ? runTop + span.top : runTop
        const runHeight = span ? span.bottom - span.top : runFull
        const top = frameY + 8
        const bottom = frameY + frameHeight - overlayHeight - 12
        if (runY >= top && runY + runHeight <= bottom) return
        const delta = runY < top || runHeight > bottom - top ? runY - top : runY + runHeight - bottom
        scroller.current?.scrollTo({ y: Math.max(0, scrollY.current + delta), animated: true })
      }))
    })
    return () => cancelAnimationFrame(id)
  }, [active, overlayHeight, english, breakAt, indexOfFirstWord, indexOfLastWord])

  // Upserts by id, so re-opening the same capture can't create a duplicate. A passage just saved
  // is the one being read, so Continue reading goes to it even before a sentence is selected.
  const persist = () => {
    const doc = documentFromRecognition(recognition!, docId.current)
    return request('texts', { token: session!.token, body: { ...doc, textId: doc.id } })
      .then(() => {
        setSaved(true)
        rememberRead(doc.id, active ?? 0, recognition!.title || titleFrom(recognition!.text))
        void request('texts', { token: session!.token, method: 'PATCH', body: { textId: doc.id, read: active ?? 0 } }).catch(() => {})
      }, (failure: Error) => setError(`This passage wasn't saved. ${failure.message}`))
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

  // Usage (lib/usage.ts): the toolbar's controls each visit, and the sentence bar's each time a
  // sentence is selected with no word (its ends have no Previous or Next).
  const visit = useVisit()
  const readerPick = useOffer('reader', recognition ? visit : null, ['tap a word', 'select words', 'english', 'cursive', vowelled && !cursive && 'vowels', 'text size', 'settings', !saved && 'save passage', saved && 'remove from library'])
  const withWords = segments.map((_, i) => i).filter(i => indexOfFirstWord[i] !== undefined)
  const barAt = active === null ? -1 : withWords.indexOf(active)
  const barPick = useOffer('sentence bar', recognition && visit !== null && active !== null && selected === null ? `${visit}:${active}` : null,
    [barAt > 0 && 'previous', barAt >= 0 && barAt < withWords.length - 1 && 'next', 'listen', 'done'])

  // A tapped word said aloud as this sentence has it (its reading, from the sentence's words): at
  // once when they are here, else when they come, or as written if they take more than a moment.
  // Only the word selected now is said: another tap replaces it, and closing stops it.
  const toSay = useRef<{ index: number; timer: ReturnType<typeof setTimeout> } | null>(null)
  const clearSay = () => { if (toSay.current) clearTimeout(toSay.current.timer); toSay.current = null }
  const sayNow = (index: number) => {
    if (toSay.current?.index !== index) return
    clearSay()
    const word = words[index]
    const reading = quickNow.current[word.segment]?.readings[index - indexOfFirstWord[word.segment]]
    stopSpeaking('another word')
    void speak(reading || word.bare, session?.token)
  }
  const sayWhenRead = (index: number) => {
    clearSay()
    toSay.current = { index, timer: setTimeout(() => sayNow(index), 1500) }
    if (quickNow.current[words[index].segment] !== undefined || !session) sayNow(index)
  }
  useEffect(() => {
    const waiting = toSay.current
    if (waiting && quick[words[waiting.index]?.segment] !== undefined) sayNow(waiting.index)
    // sayNow reads the latest through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick])
  useEffect(() => () => clearSay(), [])
  if (!recognition) return <Page><Text style={styles.title}>Find something to read.</Text><Button title="Open camera" onPress={() => router.replace('/camera')} /></Page>

  // A sentence becomes the active one, its English placed at once from the words' boxes (they
  // don't move when it is), so it never shows for a moment in the wrong place.
  // Logged with how it was chosen (`via`): a word tapped in it, the sentence itself, Next or
  // Previous. The sentence it replaces is logged as no longer selected (`deselect`), with how long
  // it was and the English setting then: while selected in 'tap', its English was on screen, which
  // doesn't say it was read.
  const activate = (segment: number | null, via: SelectedVia | 'done') => {
    if (segment === active) return
    endSelected(segment === null ? 'done' : via)
    if (segment !== null) {
      selected_.current = act('select a sentence', { segment, via })
      logRead('select', { text: docId.current, segment, english, via })
      selectedSince.current = { segment, at: now() }
    }
    setActive(segment); setBreakAt(segment === null ? null : breakFor(segment))
    if (segment !== null && hint) { setHint(false); setPref('readerHint', false) }
  }
  // A word tapped (or words dragged across) in any sentence: it is explained, and its sentence
  // becomes the active one, with its English, in the same tap.
  // `fromDrawer`: a word picked among a phrase's words in the drawer, recorded there.
  const select = (index: number, to = index, fromDrawer = false) => {
    const first = words[index]
    if (!first) return
    if (!fromDrawer) readerPick(to > index ? 'select words' : 'tap a word')
    feel('select')
    setSelected(index); setSelectedTo(to)
    if (first.segment !== active) { activate(first.segment, 'word'); remember(first.segment) }
    const segment = segments[first.segment]
    void lookup.open({
      act: act(to > index ? 'select words' : 'tap a word', { segment: first.segment, place: index - indexOfFirstWord[first.segment] }),
      text: words.slice(index, to + 1).map(item => item.bare).join(' '), sentence: segment.he, translation: segment.en, phrase: to > index,
      source: () => (savedNow.current ? { textId: docId.current, chunkId: `${docId.current}-${first.segment}` } : undefined),
      context: { text: docId.current, segment: first.segment, place: index - indexOfFirstWord[first.segment] },
      defer: true,
    })
    if (to === index && sayOnTap) sayWhenRead(index)
    else { clearSay(); stopSpeaking('another word') }
  }
  const close = () => { clearSay(); lookup.close(); setSelected(null) }
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
    feel('tick'); close(); activate(next, step > 0 ? 'next' : 'previous'); remember(next)
  }
  const leaveSentence = () => { close(); activate(null, 'done') }
  // A tap beside a sentence's words (between rows, at a row's end) selects only the sentence:
  // its English, the sentence bar and its words' quick meanings.
  const chooseSentence = (segment: number) => {
    feel('tick'); close(); activate(segment, 'sentence'); remember(segment)
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
  // Drag across words to explain them together, in any sentence. A mostly horizontal move takes
  // over from the word's tap; positions come from each word's box in its paragraph. The
  // selection stays inside the sentence the drag started in.
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
  // A sentence's English with the words that say the tapped word (or the words dragged across)
  // marked, where they can be found for certain (lib/english-match.ts).
  const markedEnglish = (segment: number, text: string) => {
    if (selected === null || words[selected]?.segment !== segment) return text
    const renders = quick[segment]?.renders ?? []
    const first = indexOfFirstWord[segment]
    const wanted = renders.slice(selected - first, (selectedTo ?? selected) - first + 1)
    if (!wanted.some(Boolean)) return text
    return englishMatch(text, wanted).map((piece, i) => (piece.marked ? <Text key={i} style={reader.englishMatch}>{piece.text}</Text> : piece.text))
  }
  // A sentence as drawn: its list marker, its text when it has no words to tap, and its words.
  // `flowing`: in a paragraph drawn as one flow, where the active sentence is marked on its own
  // words (not a band around a run of its own) and the words' layout says where its English goes.
  const sentenceViews = (s: number, flowing: boolean) => [
    segments[s].marker ? <Text key={`m${s}`} style={[reader.word, sized.word, reader.marker]}>{segments[s].marker}.</Text> : null,
    indexOfFirstWord[s] === undefined ? <Text key={`t${s}`} style={[reader.word, sized.word, he]}>{segments[s].he}</Text> : null,
    ...wordsOf(s).map(item => {
      const inSelection = highlighted && item.i >= highlighted.from && item.i <= highlighted.to
      return <Pressable key={item.i} accessibilityRole="button" accessibilityLabel={`Explain ${item.bare}`} onPress={() => void select(item.i)}
        onLayout={event => { wordBoxes.current.set(item.i, event.nativeEvent.layout); if (flowing && s === active) setLaidOut(value => value + 1) }}
        style={[reader.wordBox, sized.wordGap, flowing && s === active && reader.activeWord, inSelection && reader.selectedWord]}>
        <Text style={[reader.word, sized.word, segments[s].heading && reader.heading, he]}>{pageWithVowels(item.surface, showNiqqud)}</Text>
      </Pressable>
    }),
  ]
  // A paragraph as one flow of words; the active sentence's English (EN · tap) goes in on a row
  // of its own after the row the sentence ends on (breakAt), or right after the sentence until
  // its words have been measured.
  const flowOf = (p: number, members: number[]) => {
    const key = `${p}`
    const flowWords = members.flatMap(wordsOf).map(item => item.i)
    const holds = active !== null && members.includes(active)
    const translation = english === 'tap' && holds ? englishOf(active!) : ''
    const nodes = members.flatMap(s => sentenceViews(s, true))
    if (translation) {
      const end = breakAt !== null && breakAt >= indexOfLastWord[active!] && flowWords.includes(breakAt) ? breakAt : indexOfLastWord[active!]
      const at = nodes.findIndex(node => node?.key === String(end))
      nodes.splice(at + 1, 0, <Animated.Text key="en" entering={APPEAR} selectable onPress={() => {}}
        onLayout={event => { englishBox.current = event.nativeEvent.layout }}
        style={[reader.english, sized.english, reader.flowEnglish, segments[active!].heading && { fontWeight: '600' }]}>{markedEnglish(active!, translation)}</Animated.Text>)
    }
    return <AnimatedPressable key={key} accessible={false} layout={REFLOW} onPress={event => tapRun(key, flowWords, event)} style={reader.run}>
      <View style={reader.line} ref={view => { if (view) lines.current.set(key, view); else lines.current.delete(key); if (holds) activeRun.current = view }} {...dragHandlers(key, flowWords)}>
        {nodes}
      </View>
    </AnimatedPressable>
  }

  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    {/* The toolbar stays put while the passage scrolls under it. Whole-page listening is gone,
        since every sentence has its own Listen. */}
    <View style={[styles.row, reader.toolbar, { paddingLeft: 22 + insets.left, paddingRight: 22 + insets.right }]}>
      <Pill icon={english === 'off' ? 'eye-off-outline' : 'eye-outline'} label={englishLabel[english]} active={english !== 'off'} onPress={() => { readerPick('english', { value: nextEnglish[english] }); cycleEnglish() }} accessibilityLabel={`English ${englishSpoken[english]}. Change`} />
      {/* Print or cursive (state/script.ts); cursive is written without vowels, so it has no Vowels button. */}
      <Pill label="כתב יד" active={cursive} onPress={() => { readerPick('cursive', { value: cursive ? 'print' : 'cursive' }); setCursive(!cursive) }} accessibilityLabel={cursive ? 'Cursive. Show in print' : 'Print. Show in cursive'} />
      {vowelled && !cursive && <Pill label="Vowels" active={showNiqqud} onPress={() => { readerPick('vowels', { value: showNiqqud ? 'off' : 'on' }); toggleNiqqud() }} accessibilityLabel={showNiqqud ? 'Hide vowels' : 'Show vowels'} />}
      <View style={reader.sizes}>
        <Pressy moment="tick" depth={0.94} accessibilityRole="button" accessibilityLabel={`Smaller text, now ${Math.round(size * 100)}%`} onPress={() => { readerPick('text size', { value: 'smaller' }); resize(-1) }} hitSlop={6} style={reader.size}><Text style={reader.sizeLabel}>A−</Text></Pressy>
        <View style={reader.sizesRule} />
        <Pressy moment="tick" depth={0.94} accessibilityRole="button" accessibilityLabel={`Larger text, now ${Math.round(size * 100)}%`} onPress={() => { readerPick('text size', { value: 'larger' }); resize(1) }} hitSlop={6} style={reader.size}><Text style={reader.sizeLabel}>A+</Text></Pressy>
      </View>
      <Pressy moment="tick" depth={0.94} accessibilityRole="button" accessibilityLabel="Reader settings" onPress={() => { readerPick('settings'); setSettingsOpen(true) }} hitSlop={6} style={reader.size}>
        <Ionicons name="settings-outline" size={18} color={colors.green} />
      </Pressy>
      <View style={{ marginLeft: 'auto' }}>
        <FeedbackButton variant="icon" screen="reader" context={() => ({ raw: recognition.raw, source: recognition.source, omitted: recognition.omitted, readError: recognition.readError, segments, active, word: word?.bare, sentence: word ? segments[word.segment].he : undefined, gloss: lookup.gloss, analysis: lookup.analysis })} />
      </View>
    </View>
    {/* The scrolling area, measured to keep the active sentence in view. */}
    <View ref={frame} style={{ flex: 1 }}>
    <ScrollView ref={scroller} scrollEnabled={!dragRange} scrollEventThrottle={32} onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y }}
      onScrollEndDrag={logView} onMomentumScrollEnd={logView} onLayout={event => { viewHeight.current = event.nativeEvent.layout.height }}
      onContentSizeChange={(_width, height) => { contentHeight.current = height; if (!lastView.current) logView() }}
      contentContainerStyle={[styles.content, { gap: 10, paddingTop: 10, paddingBottom: active !== null ? overlayHeight + 24 : 36, paddingLeft: 22 + insets.left, paddingRight: 22 + insets.right }]}>
      {active === null && hint && <Text style={[styles.copy, { fontSize: 13, lineHeight: 18 }]}>Tap a word for its meaning, or beside the words for just the sentence’s English. Drag across words for a phrase.</Text>}
      {!!recognition.readError && <Text style={reader.edge}>Read with basic text recognition, so some letters may be wrong.</Text>}
      <View style={[styles.card, { gap: 0, paddingVertical: 6, paddingHorizontal: 14 }]}>
        {paragraphs.map((members, p) => {
          const first = segments[members[0]]
          const last = segments[members[members.length - 1]]
          return <View key={p} style={[reader.paragraph, p > 0 && !paged && reader.divider]}>
            {first.joined && <Text style={reader.edge}>Starts on the previous page</Text>}
            {first.cutStart && <Text style={reader.edge}>Continued from the previous page</Text>}
            {english === 'all' ? runsOf(members, true, active).map(run => {
              // Every translation showing: each sentence is a run of its own, its English under it.
              const key = `${p}-${run.segments[0]}`
              const runWords = run.segments.flatMap(wordsOf).map(item => item.i)
              const translation = run.segments.map(englishOf).filter(Boolean).join(' ')
              return <AnimatedPressable key={key} accessible={false} layout={REFLOW} ref={(view: View | null) => { if (run.active) activeRun.current = view }} onPress={event => tapRun(key, runWords, event)} style={[reader.run, run.active && reader.activeRun]}>
                <View style={reader.line} ref={view => { if (view) lines.current.set(key, view); else lines.current.delete(key) }} {...dragHandlers(key, runWords)}>
                  {run.segments.map(s => sentenceViews(s, false))}
                </View>
                {!!translation && <Animated.Text entering={APPEAR} selectable style={[reader.english, sized.english, first.heading && { fontWeight: '600' }]}>
                  {run.segments.filter(s => !!englishOf(s)).map((s, i) => <Text key={s}>{i > 0 ? ' ' : ''}{markedEnglish(s, englishOf(s))}</Text>)}
                </Animated.Text>}
              </AnimatedPressable>
            }) : flowOf(p, members)}
            {last.cutEnd && <Text style={reader.edge}>Continues on the next page</Text>}
          </View>
        })}
      </View>
      <ErrorNotice message={error} />
      <Button title={saved ? 'Saved to library ✓' : 'Save passage'} disabled={saved} busy={busy} onPress={() => { readerPick('save passage'); save() }} />
      {saved && <TextButton title="Remove from library" onPress={() => { readerPick('remove from library'); void remove() }} />}
    </ScrollView>
    </View>

    {/* Sentence bar: moving between sentences is separate from studying a word. */}
    {active !== null && !word && <Animated.View entering={SHEET_IN} exiting={SHEET_OUT} style={[reader.overlay, reader.bar, overlaySides, { paddingBottom: 10 + insets.bottom }]} onLayout={event => setOverlayHeight(event.nativeEvent.layout.height)}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous sentence" disabled={activePosition <= 0} onPress={() => { barPick('previous'); goSentence(-1) }} hitSlop={8} style={[reader.barButton, activePosition <= 0 && { opacity: 0.3 }]}>
        <Ionicons name="chevron-up" size={20} color={colors.green} /><Text style={reader.barLabel}>Previous</Text>
      </Pressable>
      <Text style={reader.barCount}>Sentence {activePosition + 1} of {sentences.length}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Next sentence" disabled={activePosition >= sentences.length - 1} onPress={() => { barPick('next'); goSentence(1) }} hitSlop={8} style={[reader.barButton, activePosition >= sentences.length - 1 && { opacity: 0.3 }]}>
        <Text style={reader.barLabel}>Next</Text><Ionicons name="chevron-down" size={20} color={colors.green} />
      </Pressable>
      <ListenButton text={segments[active].he} accessibilityLabel="Listen to this sentence" onListen={() => barPick('listen')} />
      <Pressable accessibilityRole="button" accessibilityLabel="Done with this sentence" onPress={() => { barPick('done'); leaveSentence() }} hitSlop={8}><Ionicons name="close" size={22} color={colors.muted} /></Pressable>
    </Animated.View>}

    {/* Word drawer: compact by default (meaning and save); details expand on request. */}
    {word && <ReaderWordSheet lookup={lookup} v={v} reading={selected === selectedTo ? tappedWords?.readings[tappedAt] : undefined} onClose={close} onPickWord={offset => { if (selected !== null) select(selected + offset, selected + offset, true) }} style={[overlaySides, { paddingBottom: 12 + insets.bottom }]} onLayout={event => setOverlayHeight(event.nativeEvent.layout.height)} />}

    {/* Reader settings: for now, whether a tapped word is said aloud. */}
    <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
      <Pressable style={reader.scrim} accessibilityLabel="Close Reader settings" onPress={() => setSettingsOpen(false)}>
        <Pressable style={[reader.settings, { paddingBottom: 18 + insets.bottom }]} onPress={() => {}}>
          <Text style={styles.heading}>Reader settings</Text>
          <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap', gap: 12 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.heading, { fontSize: 16 }]}>Say a word when you tap it</Text>
              <Text style={styles.copy}>As it is said in its sentence. The speaker beside the word plays it again.</Text>
            </View>
            <Switch value={sayOnTap} onValueChange={value => { readerPick('say on tap', { value }); setSayOnTap(value); setPref('sayOnTap', value); if (!value) { clearSay(); stopSpeaking('say on tap off') } }} trackColor={{ true: colors.green }} accessibilityLabel="Say a word when you tap it" />
          </View>
          <TextButton title="Done" onPress={() => setSettingsOpen(false)} />
        </Pressable>
      </Pressable>
    </Modal>
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
  // The tapped word (or words dragged across): marked within the sentence's band, its box the same
  // size as any word's, so marking it moves nothing.
  selectedWord: { backgroundColor: colors.lime, borderRadius: 4 },
  // In a paragraph drawn as one flow: the active sentence's words, a quiet band with no gaps (each
  // word's box reaches half a space either side), and its English on a row of its own among them
  // (a full-width item in the wrapping row is a row to itself).
  activeWord: { backgroundColor: '#F3EFE2' },
  englishMatch: { color: colors.ink, backgroundColor: colors.lime },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' },
  settings: { gap: 14, padding: 18, backgroundColor: colors.white, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  flowEnglish: { width: '100%', paddingTop: 1, paddingBottom: 6 },
  edge: { fontSize: 12, color: colors.muted, fontStyle: 'italic' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  // Words as prose (2026-11-27): no gap between their boxes, and each box half a space wide either
  // side of its word (wordGap, by text size), so words stand a space apart as in a book.
  line: { flexDirection: 'row-reverse', flexWrap: 'wrap', columnGap: 0 },
  wordBox: {},
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

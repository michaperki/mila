import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, type GestureResponderEvent, type NativeScrollEvent, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import * as Crypto from 'expo-crypto'
import { stop as stopSpeaking } from '../lib/speech'
import { ListenButton } from '../components/Listen'
import Animated from 'react-native-reanimated'
import { Button, colors, ErrorNotice, Page, Pill, styles, TextButton } from '../components/ui'
import { DraggableSheet } from '../components/Motion'
import { APPEAR, REFLOW, SHEET_IN, SHEET_OUT } from '../lib/motion'
import { feel } from '../lib/feedback'
import { FeedbackButton } from '../components/Feedback'
import { request } from '../lib/api'
import { isolateHebrew, otherSenses } from '../lib/bidi'
import { rangeOf, type Rect, wordAt } from '../lib/selection'
import { documentFromRecognition, segmentsOf } from '../lib/documents'
import { bareWord, stripNiqqud, titleFrom } from '../lib/ocr-cleanup'
import { paragraphsOf, runsOf } from '../lib/page'
import { type EnglishMode, getPref, rememberRead, setPref, TEXT_SIZES } from '../lib/prefs'
import { explainWord, quickMeanings } from '../lib/recognition'
import type { Encounter, VocabEntry, WordAnalysis } from '../lib/types'
import { encountersOf, savedKey, savedKeysOf, savedTapsOf, tapKey, vocabId } from '../lib/words'
import { ensureForms } from '../lib/word-forms'
import { useSession } from '../state/session'
import { cachedVocab, dropEntry, putEntry, useVocab } from '../state/vocab'
import { useVowels } from '../state/vowels'
import { isVowelled, withVowels } from '../lib/vowels'

// Runs reflow (REFLOW) when a sentence is selected and its English opens beneath it.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)
const without = (set: Set<string>, key: string) => { const next = new Set(set); next.delete(key); return next }

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
  // Saves pressed and still being written (by tapKey), shown as saved meanwhile.
  const [saving, setSaving] = useState<Set<string>>(new Set())
  // Saves being undone (Saved ✓ tapped again), and saves still on their way that are to be
  // undone once they land, by tapKey.
  const [unsaving, setUnsaving] = useState<Set<string>>(new Set())
  const undoAfterSave = useRef(new Set<string>())
  // Know which words are already saved so the card can say so instead of offering a duplicate,
  // and show a word saved from this sentence with what it was saved with.
  const { entries: vocab } = useVocab(session)
  const savedWords = useMemo(() => savedKeysOf(vocab), [vocab])
  const savedTaps = useMemo(() => savedTapsOf(vocab), [vocab])
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
  const selection = useRef(0)
  const docId = useRef(recognition?.id ?? Crypto.randomUUID())
  useFocusEffect(useCallback(() => () => { selection.current++; stopSpeaking() }, []))
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
  // Selecting a sentence asks for its words' quick meanings straight away.
  useEffect(() => {
    if (active === null || !session || indexOfFirstWord[active] === undefined) return
    let current = true
    const sentenceWords = words.slice(indexOfFirstWord[active], indexOfLastWord[active] + 1).map(item => item.bare)
    void quickMeanings(segments[active].he, sentenceWords, session.token).then(meanings => {
      if (current && meanings.length) setQuick(known => ({ ...known, [active]: meanings }))
    })
    return () => { current = false }
  }, [active, session, segments, words, indexOfFirstWord, indexOfLastWord])
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

  const select = async (index: number, to = index) => {
    const first = words[index]
    if (!first) return
    const text = words.slice(index, to + 1).map(item => item.bare).join(' ')
    const version = ++selection.current
    feel('select')
    setSelected(index); setSelectedTo(to); setActive(first.segment); setDetails(false); setAnalysis(undefined); setGloss(''); setWordError(null); setWordBusy(true)
    // Saved from this sentence: show what it was saved with instead of asking the model again.
    // Words saved before explanations were kept show their saved meaning while it loads.
    const known = savedTaps.get(tapKey(text, segments[first.segment].he))?.encounter
    if (known?.analysis) { setAnalysis(known.analysis); setGloss(known.analysis.meaning); setWordBusy(false); return }
    if (known) setGloss(known.meaning)
    try {
      const result = await explainWord(text, segments[first.segment].he, session?.token)
      if (selection.current !== version) return
      setAnalysis(result.analysis); setGloss(result.gloss)
    } catch (failure) { if (selection.current === version) setWordError((failure as Error).message) }
    finally { if (selection.current === version) setWordBusy(false) }
  }
  const close = () => { selection.current++; setSelected(null); stopSpeaking() }
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
  const isPhrase = selected !== null && last !== null && last > selected
  // The sentence's quick meaning for a single tapped word, shown until the full explanation arrives.
  const quickMeaning = word && !isPhrase && selected !== null ? quick[word.segment]?.[selected - indexOfFirstWord[word.segment]] || '' : ''
  const highlighted = dragRange ?? (selected === null ? null : { from: selected, to: last! })
  // A selected phrase is saved as written; a single word by its dictionary form.
  const lemma = isPhrase ? word!.bare : analysis?.lemmaPlain || analysis?.lemma || word?.bare || ''
  const sentence = word ? segments[word.segment].he : ''
  // Saved is known from the tap itself, so it shows at once rather than after the explanation.
  const wordSaved = !!word && (saving.has(tapKey(word.bare, sentence)) || savedTaps.has(tapKey(word.bare, sentence)) || savedWords.has(savedKey(vocabId(lemma), sentence)))
  const phrase = !isPhrase && analysis?.phrase?.text ? analysis.phrase : null
  const phraseSaved = !!phrase && (saving.has(tapKey(phrase.text, sentence)) || savedWords.has(savedKey(vocabId(phrase.text), sentence)))
  // Saved ✓ tapped again undoes the save from this sentence. The server drops the encounter, and
  // the whole entry if that was its only one and it was never practised; a save still on its way
  // is undone when it lands.
  const unsave = (asPhrase = false) => {
    if (!session || !word || (asPhrase && !phrase)) return
    const key = tapKey(asPhrase ? phrase!.text : word.bare, sentence)
    if (unsaving.has(key)) return
    feel('tick'); setUnsaving(current => new Set(current).add(key))
    if (saving.has(key)) { undoAfterSave.current.add(key); return }
    void removeSave(savedTaps.get(key)?.id ?? vocabId(asPhrase ? phrase!.text : lemma), sentence, key)
  }
  const removeSave = async (id: string, context: string, key: string) => {
    if (!session) return
    try {
      const { deleted } = await request<{ deleted?: boolean }>('vocab', { token: session.token, method: 'PATCH', body: { id, unsave: context } })
      const existing = cachedVocab(session)?.find(item => item.id === id)
      if (deleted) dropEntry(session, id)
      else if (existing) putEntry(session, { ...existing, encounters: (existing.encounters || []).filter(item => item.context !== context) })
    } catch (failure) { setError(`The save wasn't undone. ${(failure as Error).message}`) }
    finally { setUnsaving(current => without(current, key)) }
  }
  // Saves the tapped word, or the multi-word phrase it belongs to, with its source sentence.
  // Saving doesn't wait for the explanation: Saved ✓ shows at once and the entry is written when
  // the explanation arrives (the dictionary form it is saved under comes from it), even if the
  // drawer is closed meanwhile. Without an explanation a single word isn't saved: as written it
  // would be a second entry for a word already saved under its dictionary form.
  const saveWord = async (asPhrase = false) => {
    if (!session) { router.push('/login'); return }
    if (!word || (asPhrase ? !phrase || phraseSaved : wordSaved)) return
    // What was selected when Save was pressed; the selection may change before the entry is written.
    const tapped = word, unit = phrase, dragged = isPhrase, quickNow = quickMeaning, version = selection.current
    const segment = segments[tapped.segment]
    const key = tapKey(asPhrase ? unit!.text : tapped.bare, segment.he)
    setSaving(current => new Set(current).add(key)); setWordError(null); feel('saved')
    try {
      const explained: { analysis?: WordAnalysis; gloss: string } = wordBusy
        ? await explainWord(tapped.bare, segment.he, session.token).catch(() => ({ gloss: '' })) : { analysis, gloss }
      const found = explained.analysis
      const meaning = explained.gloss || quickNow
      if (!meaning) throw new Error('Its meaning could not be looked up.')
      if (!asPhrase && !dragged && !found) throw new Error('It could not be explained just now, so it wasn\'t saved. Try again.')
      const lemmaNow = dragged ? tapped.bare : found?.lemma || tapped.bare
      const id = vocabId(asPhrase ? unit!.text : dragged ? lemmaNow : found?.lemmaPlain || lemmaNow)
      // The entry is the dictionary form; this sentence is added to it as one encounter.
      const encounter: Encounter = {
        surface: asPhrase ? unit!.text : tapped.bare, meaning: asPhrase ? unit!.meaning : meaning, context: segment.he, at: Date.now(),
        ...(segment.en ? { contextTranslation: segment.en } : {}),
        ...(!asPhrase && found?.vocalized ? { vocalized: found.vocalized } : {}),
        ...(!asPhrase && !dragged && found?.form ? { form: found.form } : {}),
        ...(found?.excerpt?.text ? { excerpt: found.excerpt.text, excerptTranslation: found.excerpt.meaning } : {}),
        ...(saved ? { sourceRef: { textId: docId.current, chunkId: `${docId.current}-${tapped.segment}` } } : {}),
        ...(!asPhrase && found ? { analysis: found } : {}),
      }
      const entry: VocabEntry & { encounter: Encounter } = {
        id, createdAt: Date.now(), frequency: 1, encounter,
        ...(asPhrase ? { lemma: unit!.text, gloss: unit!.meaning, partOfSpeech: 'phrase' }
          : dragged ? { lemma: lemmaNow, gloss: found?.lemmaMeaning || meaning, partOfSpeech: 'phrase' } : {
            lemma: lemmaNow, gloss: found?.lemmaMeaning || meaning,
            ...(found?.lemmaPlain ? { lemmaPlain: found.lemmaPlain } : {}),
            ...(found?.partOfSpeech ? { partOfSpeech: found.partOfSpeech } : {}),
            ...(found?.gender ? { gender: found.gender } : {}),
            ...(found?.root ? { root: found.root } : {}),
            ...(found?.binyan ? { binyan: found.binyan } : {}),
          }),
      }
      // The server may add it to the entry the word is already saved under, and says which.
      const { item } = await request<{ item?: VocabEntry }>('vocab', { token: session.token, body: entry })
      const savedId = item?.id ?? id
      // Undone while it was on its way: take it back out now that it has landed.
      if (undoAfterSave.current.delete(key)) { await removeSave(savedId, segment.he, key); return }
      // The saved words as the server now has them: this entry, with this sentence's encounter
      // in place of any earlier one from the same sentence.
      const { encounter: _added, createdAt: _created, ...rest } = entry
      const fields = { ...rest, id: savedId }
      const existing = cachedVocab(session)?.find(item => item.id === savedId)
      const stored: VocabEntry = existing
        ? { ...existing, ...fields, encounters: [...encountersOf(existing).filter(item => item.context !== encounter.context).reverse(), encounter].slice(-20) }
        : { ...fields, createdAt: entry.createdAt, encounters: [encounter] }
      putEntry(session, stored)
      // Write the word's first practice cards now, so they are ready by the next practice.
      void ensureForms(stored, session.token).then(ready => {
        const latest = cachedVocab(session)?.find(item => item.id === savedId)
        if (latest && ready.forms?.length) putEntry(session, { ...latest, forms: ready.forms })
      }).catch(() => {})
    } catch (failure) {
      // Undone anyway: nothing was saved, so there is nothing to say.
      if (undoAfterSave.current.delete(key)) { setUnsaving(current => without(current, key)); return }
      // Shown in the drawer if it is still open on this word, otherwise on the page.
      const message = (failure as Error).message
      if (selection.current === version) setWordError(message)
      else setError(`${isolateHebrew(asPhrase ? unit!.text : tapped.bare)} wasn't saved. ${message}`)
    } finally {
      setSaving(current => { const next = new Set(current); next.delete(key); return next })
    }
  }
  const nextEnglish: Record<EnglishMode, EnglishMode> = { tap: 'all', all: 'off', off: 'tap' }
  const englishLabel: Record<EnglishMode, string> = { tap: 'English: tapped', all: 'English: all', off: 'English: off' }
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
  // Shows a "More below" hint until the explanation is scrolled to its end.
  const measureMore = ({ layoutMeasurement, contentOffset, contentSize }: NativeScrollEvent) => setMoreBelow(contentOffset.y + layoutMeasurement.height < contentSize.height - 8)

  const wordsOf = (segment: number) => indexOfFirstWord[segment] === undefined ? [] : words.slice(indexOfFirstWord[segment], indexOfLastWord[segment] + 1).map((item, offset) => ({ ...item, i: indexOfFirstWord[segment] + offset }))
  const englishOf = (segment: number) => { const { en, marker } = segments[segment]; return en ? `${marker ? `${marker}. ` : ''}${en}` : '' }
  const hasDetails = !!analysis && (analysis.parts.length > 1 || !!analysis.note || !!analysis.root || !!analysis.lemmaMeaning || !!analysis.partOfSpeech || (!!analysis.readAs && stripNiqqud(analysis.readAs) !== word?.bare))
  const detailsHeight = Math.max(180, screenHeight * 0.4)

  return <View ref={frame} style={{ flex: 1, backgroundColor: colors.paper }}>
    <ScrollView ref={scroller} scrollEnabled={!dragRange} scrollEventThrottle={32} onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y }}
      contentContainerStyle={[styles.content, { gap: 10, paddingTop: 14, paddingBottom: active !== null ? overlayHeight + 24 : 36 }]}>
      <View style={[styles.row, { gap: 8 }]}>
        <Pill icon={english === 'off' ? 'eye-off-outline' : 'eye-outline'} label={englishLabel[english]} active={english !== 'off'} onPress={cycleEnglish} accessibilityLabel={`${englishLabel[english]}. Change`} />
        {vowelled && <Pill label="Vowels" active={showNiqqud} onPress={toggleNiqqud} accessibilityLabel={showNiqqud ? 'Hide vowels' : 'Show vowels'} />}
        <Pill label="A−" onPress={() => resize(-1)} accessibilityLabel={`Smaller text, now ${Math.round(size * 100)}%`} />
        <Pill label="A+" onPress={() => resize(1)} accessibilityLabel={`Larger text, now ${Math.round(size * 100)}%`} />
        <View style={[styles.row, { gap: 6, flexWrap: 'nowrap' }]}><ListenButton pill text={segments.map(segment => segment.he)} accessibilityLabel="Listen to the whole page in Hebrew" /></View>
        <FeedbackButton screen="reader" context={() => ({ raw: recognition.raw, source: recognition.source, omitted: recognition.omitted, readError: recognition.readError, segments, active, word: word?.bare, sentence: word ? segments[word.segment].he : undefined, gloss, analysis })} />
      </View>
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
                    indexOfFirstWord[s] === undefined ? <Text key={`t${s}`} style={[reader.word, sized.word]}>{segments[s].he}</Text> : null,
                    ...wordsOf(s).map(item => {
                      const inSelection = highlighted && item.i >= highlighted.from && item.i <= highlighted.to
                      return <Pressable key={item.i} accessibilityRole="button" accessibilityLabel={`Explain ${item.bare}`} onPress={() => (s === active ? void select(item.i) : chooseSentence(s))}
                        onLayout={event => { wordBoxes.current.set(item.i, event.nativeEvent.layout) }}
                        style={[reader.wordBox, inSelection && reader.selectedWord]}>
                        <Text style={[reader.word, sized.word, segments[s].heading && reader.heading]}>{v(item.surface)}</Text>
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

    {/* Sentence bar: moving between sentences is separate from studying a word. */}
    {active !== null && !word && <Animated.View entering={SHEET_IN} exiting={SHEET_OUT} style={[reader.overlay, reader.bar, { paddingBottom: 10 + insets.bottom }]} onLayout={event => setOverlayHeight(event.nativeEvent.layout.height)}>
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
    {word && <DraggableSheet onDismiss={close} style={[reader.overlay, reader.sheet, { paddingBottom: 12 + insets.bottom }]} accessibilityViewIsModal onLayout={event => setOverlayHeight(event.nativeEvent.layout.height)}
      handle={<View style={reader.sheetHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={10}><Ionicons name="close" size={22} color={colors.muted} /></Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
          <ListenButton text={analysis?.vocalized || word.bare} accessibilityLabel={isPhrase ? 'Hear this phrase' : 'Hear this word'} />
          <Text style={reader.sheetWord}>{v(analysis?.vocalized || word.bare)}</Text>
        </View>
      </View>}>
      {wordBusy && !quickMeaning ? <View style={[styles.row, { gap: 8 }]}><ActivityIndicator color={colors.green} /><Text style={styles.copy}>Reading it in context…</Text></View>
        : <View style={[styles.row, { gap: 8, flexWrap: 'nowrap' }]}>
          {!!(gloss || quickMeaning) && <Animated.Text key={gloss ? 'full' : 'quick'} entering={APPEAR} style={[reader.meaning, { flexShrink: 1 }]}>{isolateHebrew(v(gloss || quickMeaning))}</Animated.Text>}
          {wordBusy && <ActivityIndicator color={colors.green} />}
        </View>}
      {!wordBusy && !analysis && !!gloss && <Text style={[styles.copy, { fontSize: 13 }]}>Detailed explanation unavailable, so this is a direct translation.</Text>}
      {/* A word that belongs to an expression (להעמיד פנים) is taught as the expression: its own
          meaning can be misleading on its own, so the expression leads and is what Save keeps. */}
      {phrase && !wordBusy && <Animated.View entering={APPEAR} style={[reader.phrase, { flexDirection: 'column', alignItems: 'flex-start', gap: 2, paddingRight: 10, paddingVertical: 8 }]}>
        <Text style={reader.label}>Part of an expression</Text>
        <Text style={reader.fact}><Text style={reader.factHebrew}>{isolateHebrew(v(phrase.text))}</Text> · {isolateHebrew(v(phrase.meaning))}</Text>
      </Animated.View>}
      {details && !wordBusy && analysis && <Animated.View entering={APPEAR}>
        <ScrollView style={{ maxHeight: detailsHeight }} contentContainerStyle={{ gap: 12, paddingBottom: 4 }} scrollEventThrottle={64}
          onScroll={event => measureMore(event.nativeEvent)}
          onContentSizeChange={(_, contentHeight) => setMoreBelow(contentHeight > detailsHeight + 8)}>
          {!isPhrase && !!analysis.readAs && stripNiqqud(analysis.readAs) !== word.bare && <Text style={reader.fact}>The photo text reads <Text style={reader.factHebrew}>{isolateHebrew(word.bare)}</Text>; this is probably <Text style={reader.factHebrew}>{isolateHebrew(v(analysis.readAs))}</Text>.</Text>}
          {analysis.parts.length > 1 && <Section label="Breakdown"><View style={reader.parts}>
            {analysis.parts.map((part, i) => <View key={i} style={reader.part}><Text style={reader.partHebrew}>{v(part.text)}</Text><Text style={reader.partMeaning}>{isolateHebrew(v(part.meaning))}</Text></View>)}
          </View></Section>}
          <WordFacts analysis={analysis} gloss={gloss} v={v} />
        </ScrollView>
        {moreBelow && <Text style={reader.more} pointerEvents="none">More below ↓</Text>}
      </Animated.View>}
      <ErrorNotice message={wordError} />
      <View style={[styles.row, { flexWrap: 'nowrap', gap: 10 }]}>
        {hasDetails && !wordBusy && <Pressable accessibilityRole="button" onPress={() => setDetails(value => !value)} style={reader.detailsToggle} hitSlop={6}>
          <Text style={reader.barLabel}>{details ? 'Less' : 'Details'}</Text><Ionicons name={details ? 'chevron-down' : 'chevron-up'} size={16} color={colors.green} />
        </Pressable>}
        {phrase
          ? <Button secondary={phraseSaved} title={phraseSaved ? 'Expression saved ✓' : 'Save expression'} detail={phraseSaved ? 'Tap to undo' : undefined}
            busy={unsaving.has(tapKey(phrase.text, sentence))} moment={phraseSaved ? null : undefined} onPress={() => (phraseSaved ? unsave(true) : void saveWord(true))} style={{ flex: 1 }} />
          : <Button secondary={wordSaved} title={wordSaved ? 'Saved ✓' : isPhrase ? 'Save phrase' : 'Save word'} detail={wordSaved ? 'Tap to undo' : undefined}
            busy={unsaving.has(tapKey(word.bare, sentence))} moment={wordSaved ? null : undefined} onPress={() => (wordSaved ? unsave() : void saveWord())} style={{ flex: 1 }} />}
      </View>
      {phrase && <TextButton title={unsaving.has(tapKey(word.bare, sentence)) ? 'Undoing…' : wordSaved ? `${isolateHebrew(word.bare)} saved on its own ✓ · Undo` : `Save just ${isolateHebrew(word.bare)}`}
        onPress={() => (wordSaved ? unsave() : void saveWord())} />}
    </DraggableSheet>}
  </View>
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return <View style={{ gap: 4 }}><Text style={reader.label}>{label}</Text>{children}</View>
}

// Dictionary entry (form, other senses, root, grammar) and an optional note, always in this order.
function WordFacts({ analysis, gloss, v }: { analysis: WordAnalysis; gloss: string; v: (text: string) => string }) {
  const grammar = [analysis.partOfSpeech, analysis.binyan, analysis.form].filter(Boolean).join(' · ')
  const showLemma = !!analysis.lemma && stripNiqqud(analysis.lemma) !== stripNiqqud(analysis.vocalized || analysis.word)
  const senses = otherSenses(analysis.lemmaMeaning || '', gloss)
  const hasEntry = showLemma || !!senses || !!analysis.root || !!grammar
  return <>
    {hasEntry && <Section label="Dictionary">
      {showLemma && <Text style={reader.fact}><Text style={reader.factHebrew}>{isolateHebrew(v(analysis.lemma))}</Text>{senses ? ` · ${isolateHebrew(v(senses))}` : ''}</Text>}
      {!showLemma && !!senses && <Text style={reader.fact}>Other senses: {isolateHebrew(v(senses))}</Text>}
      {(!!analysis.root || !!grammar) && <Text style={reader.fact}>{analysis.root ? <>Root <Text style={reader.factHebrew}>{isolateHebrew(analysis.root)}</Text>{grammar ? ' · ' : ''}</> : null}{grammar}</Text>}
    </Section>}
    {!!analysis.note && <Section label="Note"><Text style={reader.fact}>{isolateHebrew(v(analysis.note))}</Text></Section>}
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

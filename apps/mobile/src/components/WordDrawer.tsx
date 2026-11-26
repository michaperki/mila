import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, type LayoutChangeEvent, type NativeScrollEvent, Pressable, ScrollView, type StyleProp, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native'
import { router } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated from 'react-native-reanimated'
import { ListenButton } from './Listen'
import { Button, colors, ErrorNotice, Pill, styles, TextButton } from './ui'
import { DraggableSheet } from './Motion'
import { Constructions } from './Constructions'
import { APPEAR } from '../lib/motion'
import { feel } from '../lib/feedback'
import { request } from '../lib/api'
import { isolateHebrew, otherSenses } from '../lib/bidi'
import { stripNiqqud } from '../lib/ocr-cleanup'
import { plainSpelling } from '../lib/spelling'
import { stop as stopSpeaking } from '../lib/speech'
import { noteActivity } from '../lib/tree'
import { explainWord, quickMeanings } from '../lib/recognition'
import type { LogEvent } from '../lib/study-log'
import { type Act, act, onPhone } from '../lib/trace'
import { useOffer } from '../lib/usage'
import type { Built, Encounter, Phrase, Session, VocabEntry, WordAnalysis } from '../lib/types'
import { constructionsOf, encountersOf, lemmaKey, patternLabel, savedByLemma, savedBySurface, savedKey, savedKeysOf, savedTapsOf, tapKey, vocabId } from '../lib/words'
import { cachedVocab, dropEntry, putEntry, useVocab } from '../state/vocab'
import { useHebrew } from '../state/script'

// A word or phrase looked up in its sentence, its explanation, and saving it: the reader's word
// drawer, and the same drawer over a flashcard for a word in the card's sentence. `phrase` is a
// run of words dragged across rather than one word tapped. `source` says, when it is saved, the
// passage it was met in, if that is in the library by then.
// `card`: a word tapped on a flashcard, which shows at once what the card says it means there
// (`meaning`, with its dictionary form `lemma`), or for a card written without that, its meaning
// from one quick lookup of the whole sentence's words (`words`, the tapped one at `at`); the full
// explanation is asked for only on More or Save.
export type Lookup = {
  text: string; sentence: string; translation?: string; phrase?: boolean; source?: () => Encounter['sourceRef']
  card?: { meaning?: string; lemma?: string; words: string[]; at: number }
  // Where the tap was, kept with its `lookup` event (the passage and sentence, or the card).
  context?: Record<string, unknown>
  // The tap as a debug capture's action (lib/trace.ts), which the work for it points to.
  act?: Act
}

// When a save is written (read in the save handler, never while drawing).
const now = () => Date.now()
const without = (set: Set<string>, key: string) => { const next = new Set(set); next.delete(key); return next }

// `quick` is the sentence's quick meaning for the word, shown until the explanation arrives.
// `onLostError` says what went wrong with a save once the drawer has moved on to another word.
// `log` keeps each lookup, its explanation arriving and each save or undo as learning events
// (lib/study-log.ts), each later one with the id of the lookup it follows.
export function useWordLookup(session: Session | null, { quick = '', onLostError, log }: { quick?: string; onLostError: (message: string) => void; log?: LogEvent }) {
  const [tap, setTap] = useState<Lookup | null>(null)
  const version = useRef(0)
  const [analysis, setAnalysis] = useState<WordAnalysis | undefined>()
  const [gloss, setGloss] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState(false)
  // Saves pressed and still being written (by tapKey), shown as saved meanwhile.
  const [saving, setSaving] = useState<Set<string>>(new Set())
  // Saves being undone (Saved ✓ tapped again), and saves still on their way that are to be
  // undone once they land, by tapKey.
  const [unsaving, setUnsaving] = useState<Set<string>>(new Set())
  const undoAfterSave = useRef(new Set<string>())
  // Know which words are already saved so the drawer can say so instead of offering a duplicate,
  // and show a word saved from this sentence with what it was saved with.
  const { entries: vocab, loaded: vocabLoaded } = useVocab(session)
  // The first word ever saved: until then the drawer says why to save one, and once it is written,
  // offers to study it, so the first save leads straight into the first practice.
  const [firstSave, setFirstSave] = useState(false)
  const noWordsYet = !!session && vocabLoaded && !vocab.length && !saving.size
  const savedWords = useMemo(() => savedKeysOf(vocab), [vocab])
  const savedTaps = useMemo(() => savedTapsOf(vocab), [vocab])
  const byLemma = useMemo(() => savedByLemma(vocab), [vocab])
  const bySurface = useMemo(() => savedBySurface(vocab), [vocab])

  // The lookup open now: when it was asked for, when its meaning first showed, and when its
  // details were opened, for its `closed` event (Learning Insights: how long a word was looked at).
  const lookedUp = useRef<{ id: string; at: number; shownAt?: number; detailsAt?: number } | null>(null)
  const closedFor = useRef(new Set<string>())
  useEffect(() => { const looked = lookedUp.current; if (looked && !looked.shownAt && (gloss || analysis)) looked.shownAt = now() }, [gloss, analysis])
  useEffect(() => { const looked = lookedUp.current; if (looked && !looked.detailsAt && details) looked.detailsAt = now() }, [details])
  // The drawer leaving the word it shows: another word, closed, or the screen left.
  const finish = (how: 'next word' | 'closed' | 'left') => {
    const looked = lookedUp.current
    if (!looked || closedFor.current.has(looked.id)) return
    closedFor.current.add(looked.id)
    log?.('closed', { of: looked.id, how, ms: now() - looked.at, waitMs: looked.shownAt ? looked.shownAt - looked.at : null, details: !!looked.detailsAt })
  }
  const explainedFor = useRef(new Set<string>())
  // The explanation of a word looked up arriving: its dictionary form and how it is used here,
  // how long it took, and what asked for it (the tap, More or Save). Kept once per lookup, and
  // even after the drawer has moved on (tap, Save, next word), since the save is made with it.
  const logExplained = (looked: { id: string; at: number } | null, found: WordAnalysis | undefined, why: 'tap' | 'more' | 'save') => {
    if (!found || !looked || explainedFor.current.has(looked.id)) return
    explainedFor.current.add(looked.id)
    log?.('explained', {
      of: looked.id, why, ms: now() - looked.at, lemma: found.lemmaPlain || found.lemma,
      partOfSpeech: found.partOfSpeech, form: found.form, ...(found.phrase?.text ? { phrase: found.phrase.lemmaPlain || found.phrase.lemma || found.phrase.text } : {}),
    })
  }
  const open = async (next: Lookup) => {
    const current = ++version.current
    finish('next word')
    setTap(next); setDetails(false); setAnalysis(undefined); setGloss(''); setError(null); setBusy(true); setAsked(false)
    // Saved from this sentence: show what it was saved with instead of asking the model again.
    // Words saved before explanations were kept show their saved meaning while it loads.
    const known = savedTaps.get(tapKey(next.text, next.sentence))?.encounter
    const saved = !!known || !!(next.card?.lemma ? byLemma.get(lemmaKey(next.card.lemma)) : bySurface.get(lemmaKey(next.text)))
    const id = log?.('lookup', {
      ...next.context, word: next.text, ...(next.phrase ? { phrase: true } : {}), saved,
      ...(next.card ? { place: next.card.at, ...(next.card.lemma ? { lemma: next.card.lemma } : {}), glossed: !!next.card.meaning } : {}),
    })
    const looked = lookedUp.current = id ? { id, at: now() } : null
    if (known?.analysis) { onPhone(next.act, 'explanation', 'saved with the word from this sentence: no request'); setAnalysis(known.analysis); setGloss(known.analysis.meaning); setBusy(false); return }
    if (known) setGloss(known.meaning)
    // On a card: its own meaning for the word at once, or the sentence's quick meanings (asked
    // once per sentence and kept); the model explains it only on More or Save (explain, save).
    if (next.card) {
      const { meaning, words, at } = next.card
      if (meaning) { onPhone(next.act, 'meaning on the card', 'the card’s own data: no request'); setGloss(meaning); setBusy(false); return }
      const quick = session ? await quickMeanings(next.sentence, words, session.token, next.act).then(meanings => meanings[at] || '') : ''
      if (version.current !== current) return
      if (quick) setGloss(quick)
      setBusy(false); return
    }
    try {
      const result = await explainWord(next.text, next.sentence, session?.token, next.act)
      logExplained(looked, result.analysis, 'tap')
      if (version.current !== current) return
      setAnalysis(result.analysis); setGloss(result.gloss)
    } catch (failure) { if (version.current === current) setError((failure as Error).message) }
    finally { if (version.current === current) setBusy(false) }
  }
  // More on a card's word: the full explanation, asked for now, shown with its details. If it
  // can't be had, the card's meaning stays and the drawer says the explanation is unavailable.
  const [asked, setAsked] = useState(false)
  const explain = async () => {
    if (!tap || analysis || busy) return
    const current = version.current, looked = lookedUp.current
    setAsked(true); setBusy(true); setError(null)
    try {
      const result = await explainWord(tap.text, tap.sentence, session?.token, act('More on a word', { word: tap.text }))
      logExplained(looked, result.analysis, 'more')
      if (version.current !== current) return
      if (result.analysis) { setAnalysis(result.analysis); setGloss(result.gloss); setDetails(true) }
      else if (!gloss) setGloss(result.gloss)
    } catch (failure) { if (version.current === current) setError((failure as Error).message) }
    finally { if (version.current === current) setBusy(false) }
  }
  // Anything still on its way for the word shown is dropped (leaving the screen does this too).
  const leave = useRef(finish)
  useEffect(() => { leave.current = finish })
  const invalidate = useCallback(() => { version.current++; stopSpeaking(); leave.current('left') }, [])
  const close = () => { finish('closed'); invalidate(); setTap(null) }

  const isPhrase = !!tap?.phrase
  const quickMeaning = tap && !isPhrase ? quick : ''
  // A selected phrase is saved as written; a single word by its dictionary form.
  const lemma = isPhrase ? tap!.text : analysis?.lemmaPlain || analysis?.lemma || tap?.card?.lemma || tap?.text || ''
  const sentence = tap?.sentence ?? ''
  // Saved is known from the tap itself, so it shows at once rather than after the explanation.
  const wordSaved = !!tap && (saving.has(tapKey(tap.text, sentence)) || savedTaps.has(tapKey(tap.text, sentence)) || savedWords.has(savedKey(vocabId(lemma), sentence)))
  // Selected words have one only when they are a use of a pattern or part of a larger expression,
  // so saving נטולת דאגות adds it to נָטוּל + [שֵׁם עֶצֶם] rather than starting a phrase of its own.
  const phrase = analysis?.phrase?.text ? analysis.phrase : null
  // An expression is saved under its dictionary form (לעבור דרך), so every way it is met is one
  // entry; older explanations only give it as written.
  const phraseId = phrase ? vocabId(phrase.lemmaPlain || phrase.lemma || phrase.text) : ''
  const phraseSaved = !!phrase && (saving.has(tapKey(phrase.text, sentence)) || savedWords.has(savedKey(phraseId, sentence)))
  // Already in your words from another sentence, or met here in another form (וצעק is the
  // לצעוק saved from צעק): Save then adds this sentence to that entry as one more example.
  // Before the explanation arrives it is known only if this form itself was saved somewhere.
  // A card's word knows its dictionary form from the card.
  const savedEntry = !tap ? undefined : analysis || isPhrase || tap.card?.lemma ? byLemma.get(lemmaKey(lemma)) : bySurface.get(lemmaKey(tap.text))
  const phraseEntry = phrase ? byLemma.get(lemmaKey(phrase.lemmaPlain || phrase.lemma || phrase.text)) : undefined
  // A pattern (נטול ינשופים: נָטוּל + [שֵׁם עֶצֶם]) is led by when its fixed words are tapped; the
  // word in its open place (ינשופים) is a word of its own, with the pattern offered alongside.
  const isPattern = phrase?.kind === 'pattern' && !!phrase.pattern
  // Words joined with a maqaf are one tap (ונטול־ינשופים), so each piece is compared.
  const tappedPieces = tap ? lemmaKey(tap.text).split(' ') : []
  const fillsPattern = isPattern && !!phrase!.words?.length && !phrase!.words.some(item => tappedPieces.includes(lemmaKey(item)))
  // A pattern being saved leads the drawer: what it is and how else it is used come before
  // what these words mean here.
  const patternFirst = isPattern && !fillsPattern
  const leadPhrase = !!phrase && !fillsPattern
  // A pattern on one word (נָטוּל + …) is saved as that word, so it has no "Save just" of its own.
  const phraseIsWord = !!phrase && !!analysis && lemmaKey(phrase.lemmaPlain || phrase.lemma || '') === lemmaKey(lemma)
  const inYourWords = leadPhrase ? phraseEntry : savedEntry

  // Saved ✓ tapped again undoes the save from this sentence. The server drops the encounter, and
  // the whole entry if that was its only one and it was never practised; a save still on its way
  // is undone when it lands.
  const unsave = (asPhrase = false) => {
    if (!session || !tap || (asPhrase && !phrase)) return
    const key = tapKey(asPhrase ? phrase!.text : tap.text, sentence)
    if (unsaving.has(key)) return
    feel('tick'); setUnsaving(current => new Set(current).add(key))
    log?.('unsave', { of: lookedUp.current?.id, ...(asPhrase ? { phrase: true } : {}) })
    if (saving.has(key)) { undoAfterSave.current.add(key); return }
    void removeSave(savedTaps.get(key)?.id ?? (asPhrase ? phraseId : vocabId(lemma)), sentence, key)
  }
  const removeSave = async (id: string, context: string, key: string) => {
    if (!session) return
    try {
      const { deleted } = await request<{ deleted?: boolean }>('vocab', { token: session.token, method: 'PATCH', body: { id, unsave: context } })
      const existing = cachedVocab(session)?.find(item => item.id === id)
      if (deleted) dropEntry(session, id)
      else if (existing) putEntry(session, { ...existing, encounters: (existing.encounters || []).filter(item => item.context !== context) })
    } catch (failure) { onLostError(`The save wasn't undone. ${(failure as Error).message}`) }
    finally { setUnsaving(current => without(current, key)) }
  }
  // Saves the tapped word, or the multi-word phrase it belongs to, with its source sentence.
  // Saving doesn't wait for the explanation: Saved ✓ shows at once and the entry is written when
  // the explanation arrives (the dictionary form it is saved under comes from it), even if the
  // drawer is closed meanwhile. Without an explanation a single word isn't saved: as written it
  // would be a second entry for a word already saved under its dictionary form.
  // Words dragged across are saved only as the unit the explanation found them to make (asPhrase),
  // under its dictionary form, never as written: בהתה חזרה is saved as לִבְהוֹת חֲזָרָה.
  const save = async (asPhrase = false) => {
    if (!session) { router.push('/login'); return }
    if (!tap || (asPhrase ? !phrase || phraseSaved : wordSaved || isPhrase)) return
    // What was selected when Save was pressed; the selection may change before the entry is written.
    const tapped = tap, unit = phrase, dragged = isPhrase, quickNow = quickMeaning, current = version.current, looked = lookedUp.current, of = looked?.id
    const key = tapKey(asPhrase ? unit!.text : tapped.text, tapped.sentence)
    if (noWordsYet) setFirstSave(true)
    setSaving(saves => new Set(saves).add(key)); setError(null); feel('saved')
    try {
      // A card's word has its meaning but not yet its explanation, which Save asks for now.
      const explained: { analysis?: WordAnalysis; gloss: string } = busy || (!analysis && !!tapped.card)
        ? await explainWord(tapped.text, tapped.sentence, session.token).catch(() => ({ gloss: '' })) : { analysis, gloss }
      const found = explained.analysis
      logExplained(looked, found, 'save')
      const meaning = explained.gloss || quickNow
      if (!meaning) throw new Error('Its meaning could not be looked up.')
      if (!asPhrase && !found) throw new Error('It could not be explained just now, so it wasn\'t saved. Try again.')
      const lemmaNow = found?.lemma || tapped.text
      const id = vocabId(asPhrase ? unit!.lemmaPlain || unit!.lemma || unit!.text : found?.lemmaPlain || lemmaNow)
      // The entry is the dictionary form; this sentence is added to it as one encounter.
      const encounter: Encounter = {
        surface: asPhrase ? unit!.text : tapped.text, meaning: asPhrase ? unit!.meaning : meaning, context: tapped.sentence, at: now(),
        // An expression's own words, which may stand apart in the sentence (lib/marks.ts).
        ...(asPhrase && unit!.words?.length ? { mark: unit!.words.join(' ') } : {}),
        // A pattern's example means what it says here ("owl-free"), not the pattern's meaning.
        ...(asPhrase && unit!.kind === 'pattern' && unit!.textMeaning ? { meaning: unit!.textMeaning } : {}),
        ...(tapped.translation ? { contextTranslation: tapped.translation } : {}),
        ...(!asPhrase && found?.vocalized ? { vocalized: found.vocalized } : {}),
        ...(!asPhrase && !dragged && found?.form ? { form: found.form } : {}),
        ...(found?.excerpt?.text ? { excerpt: found.excerpt.text, excerptTranslation: found.excerpt.meaning } : {}),
        ...(tapped.source?.() ? { sourceRef: tapped.source() } : {}),
        ...(!asPhrase && found ? { analysis: found } : {}),
      }
      // Its themes and register, from the explanation already here (VOCAB-2): the server keeps
      // them only where the word has none yet.
      const organised = asPhrase ? unit : found
      const entry: VocabEntry & { encounter: Encounter } = {
        id, createdAt: now(), frequency: 1, encounter,
        ...(Array.isArray(organised?.categories) ? { categories: organised.categories, ...(organised.register ? { register: organised.register } : {}) } : {}),
        ...(asPhrase ? expressionEntry(unit!, found) : {
            lemma: lemmaNow, gloss: found?.lemmaMeaning || meaning,
            ...(found?.lemmaPlain ? { lemmaPlain: found.lemmaPlain } : {}),
            ...(found?.partOfSpeech ? { partOfSpeech: found.partOfSpeech } : {}),
            ...(found?.gender ? { gender: found.gender } : {}),
            ...(found?.feminine ? { feminine: found.feminine } : {}),
            ...(found?.root ? { root: found.root } : {}),
            ...(found?.binyan ? { binyan: found.binyan } : {}),
            ...(found?.constructions?.length ? { constructions: found.constructions } : {}),
          }),
      }
      // The server may add it to the entry the word is already saved under, and says which.
      const { item } = await request<{ item?: VocabEntry }>('vocab', { token: session.token, body: entry })
      const savedId = item?.id ?? id
      // Undone while it was on its way: take it back out now that it has landed.
      if (undoAfterSave.current.delete(key)) { await removeSave(savedId, tapped.sentence, key); return }
      noteActivity('saved')
      // The word saved as `saved` (an event's own `id` is its id: before 2026-11-17 this was lost).
      log?.('save', { of, saved: savedId, ...(asPhrase ? { phrase: true } : {}) })
      // The saved words as the server now has them: this entry, with this sentence's encounter
      // in place of any earlier one from the same sentence.
      const { encounter: _added, createdAt: _created, ...rest } = entry
      const fields = { ...rest, id: savedId }
      const existing = cachedVocab(session)?.find(item => item.id === savedId)
      const stored: VocabEntry = existing
        ? { ...existing, ...fields, ...(existing.taxonomy ? { categories: existing.categories, register: existing.register } : {}), encounters: [...encountersOf(existing).filter(item => item.context !== encounter.context).reverse(), encounter].slice(-20) }
        : { ...fields, createdAt: entry.createdAt, encounters: [encounter] }
      // Its practice cards are written when Study is about to bring it in (practice.tsx), or
      // when its page is opened, not on saving: most saved words wait a while to be studied.
      putEntry(session, stored)
    } catch (failure) {
      // Undone anyway: nothing was saved, so there is nothing to say.
      if (undoAfterSave.current.delete(key)) { setUnsaving(saves => without(saves, key)); return }
      // Shown in the drawer if it is still open on this word, otherwise where the word was met.
      const message = (failure as Error).message
      if (version.current === current) setError(message)
      else onLostError(`${isolateHebrew(asPhrase ? unit!.text : tapped.text)} wasn't saved. ${message}`)
    } finally {
      setSaving(saves => without(saves, key))
    }
  }

  return {
    tap, open, close, invalidate, explain, asked, analysis, gloss, busy, error, details, setDetails, quickMeaning,
    isPhrase, lemma, wordSaved, phrase, phraseSaved, isPattern, fillsPattern, patternFirst, leadPhrase, phraseIsWord, inYourWords,
    saving, unsaving, firstSave, noWordsYet, save, unsave,
  }
}
export type WordLookup = ReturnType<typeof useWordLookup>

// The drawer itself: compact by default (meaning and save); details expand on request. `style`
// places it (the screen's overlay, its sides and safe area); `onClose` closes it, by default
// just the drawer. `onPickWord` opens one of the words dragged across (by its place among them),
// offered when they don't make a unit, so one of them can be saved instead.
export function WordDrawer({ lookup, v, style, onLayout, onClose = lookup.close, onPickWord }: {
  lookup: WordLookup; v: (text: string) => string; style?: StyleProp<ViewStyle>; onLayout?: (event: LayoutChangeEvent) => void; onClose?: () => void
  onPickWord?: (offset: number) => void
}) {
  const he = useHebrew()
  const { height: screenHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [moreBelow, setMoreBelow] = useState(false)
  const scroller = useRef<ScrollView>(null)
  const scrollHeight = useRef(0)
  // Where Details begins in the scrolling part, to bring it into view when it is opened.
  const openedDetails = useRef(false)
  const { tap, analysis, gloss, busy, quickMeaning, isPhrase, phrase, isPattern, fillsPattern, patternFirst, leadPhrase, phraseIsWord, inYourWords, wordSaved, phraseSaved, saving, unsaving, details } = lookup
  const hasDetails = !!tap && !!analysis && (analysis.parts.length > 1 || !!analysis.note || !!analysis.root || !!analysis.lemmaMeaning || !!analysis.partOfSpeech || (!!analysis.readAs && stripNiqqud(analysis.readAs) !== tap.text))
  // Usage (lib/usage.ts): each lookup is a showing of the drawer, with the controls it came to
  // have (Details only once there is an explanation with details to show).
  const mainSaved = leadPhrase ? phraseSaved : wordSaved
  const drawerPick = useOffer(tap?.card ? 'study drawer' : 'reader drawer', tap, [
    'close', 'listen', hasDetails && !busy && 'details', !!tap?.card && !analysis && !busy && !lookup.asked && 'more',
    (leadPhrase || !isPhrase) && (mainSaved ? 'undo save' : 'save'), !!inYourWords && !busy && 'in your words',
    isPhrase && !phrase && !busy && !!onPickWord && 'pick a word', leadPhrase && !phraseIsWord && !isPhrase && 'save just the word',
    fillsPattern && 'save the pattern', lookup.firstSave && (wordSaved || phraseSaved) && !saving.size && 'study now',
  ])
  if (!tap) return null
  const closing = () => { drawerPick('close'); onClose() }
  const sentence = tap.sentence
  // The sheet stays below the top of the screen (and the reader's toolbar): what doesn't fit
  // scrolls, between the word at the top and Save at the bottom, which are always in view.
  const maxHeight = Math.min(screenHeight * 0.82, screenHeight - insets.top - 56)
  // Shows a "More below" hint until the explanation is scrolled to its end.
  const measureMore = ({ layoutMeasurement, contentOffset, contentSize }: NativeScrollEvent) => setMoreBelow(contentOffset.y + layoutMeasurement.height < contentSize.height - 8)
  const toggleDetails = () => { if (!details) drawerPick('details'); lookup.setDetails(value => { openedDetails.current = !value; return !value }) }
  // How the tapped word was read: its pieces, its form and the dictionary form it comes from
  // (וְ + צָעַק · past, he · from לִצְעֹק), so each occurrence is seen as a form of one word. The
  // pieces' meanings are in the meaning above and under Details (Breakdown), not repeated here,
  // where English between the Hebrew pieces broke up their right-to-left order.
  const reading = !isPhrase && analysis ? [
    analysis.parts.length > 1 ? analysis.parts.map(part => part.text).join(' + ') : '',
    analysis.form,
    analysis.lemma && stripNiqqud(analysis.lemma) !== stripNiqqud(analysis.vocalized || analysis.word) ? `from ${analysis.lemma}` : '',
  ].filter(Boolean).join(' · ') : ''
  // A word that belongs to an expression (להעמיד פנים) is taught as the expression: its own
  // meaning can be misleading on its own, so the expression leads and is what Save keeps. A
  // pattern shows how it is built, what it means, and two more uses of it; an expression whose
  // words don't plainly add up to its meaning, what it says word for word.
  const unitBox = phrase && !busy ? <Animated.View entering={APPEAR} style={[drawer.phrase, { flexDirection: 'column', alignItems: 'flex-start', gap: 2, paddingRight: 10, paddingVertical: 8 }]}>
    <Text style={drawer.label}>{!isPattern ? 'Part of an expression' : fillsPattern ? 'Used here in a pattern' : 'A pattern'}</Text>
    {patternFirst
      ? <><Text style={[drawer.pattern, he]}>{v(patternLabel(phrase.pattern!))}</Text><Text style={drawer.fact}>{isolateHebrew(v(phrase.meaning))}</Text></>
      : <Text style={drawer.fact}><Text style={[drawer.factHebrew, he]}>{isolateHebrew(v((isPattern && phrase.pattern && patternLabel(phrase.pattern)) || phrase.lemma || phrase.text))}</Text> · {isolateHebrew(v(phrase.meaning))}</Text>}
    {isPattern && phrase.examples?.map(example => <Text key={example.text} style={drawer.fact}><Text style={[drawer.factHebrew, he]}>{isolateHebrew(v(example.text))}</Text> · {isolateHebrew(v(example.meaning))}</Text>)}
    {!isPattern && !!phrase.literal && <Text style={drawer.fact}>Literally “{phrase.literal}”</Text>}
    {isPattern && !!phrase.textMeaning && <Text style={drawer.fact}>Here <Text style={[drawer.factHebrew, he]}>{isolateHebrew(v(phrase.text))}</Text> · {isolateHebrew(v(phrase.textMeaning))}</Text>}
  </Animated.View> : null

  return <DraggableSheet onDismiss={closing} style={[drawer.sheet, style, { maxHeight }]} accessibilityViewIsModal onLayout={onLayout}
    handle={<View style={drawer.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closing} hitSlop={10}><Ionicons name="close" size={22} color={colors.muted} /></Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
        <ListenButton text={analysis?.vocalized || tap.text} accessibilityLabel={isPhrase ? 'Hear this phrase' : 'Hear this word'} onListen={() => drawerPick('listen')} />
        <Text style={[drawer.word, he]}>{v(analysis?.vocalized || tap.text)}</Text>
      </View>
    </View>}>
    <View style={{ flexShrink: 1 }}>
    <ScrollView ref={scroller} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10 }} scrollEventThrottle={64} alwaysBounceVertical={false}
      onScroll={event => measureMore(event.nativeEvent)}
      onLayout={event => { scrollHeight.current = event.nativeEvent.layout.height }}
      onContentSizeChange={(_, contentHeight) => setMoreBelow(contentHeight > scrollHeight.current + 8)}>
    {patternFirst && unitBox}
    {busy && !quickMeaning && !gloss ? <View style={[styles.row, { gap: 8 }]}><ActivityIndicator color={colors.green} /><Text style={styles.copy}>Reading it in context…</Text></View>
      : <View style={[styles.row, { gap: 8, flexWrap: 'nowrap' }]}>
        {!!(gloss || quickMeaning) && <Animated.Text key={gloss ? 'full' : 'quick'} entering={APPEAR} style={[drawer.meaning, { flexShrink: 1 }]}>{isolateHebrew(v(gloss || quickMeaning))}</Animated.Text>}
        {busy && <ActivityIndicator color={colors.green} />}
      </View>}
    {!busy && !analysis && !!gloss && (!tap.card || lookup.asked) && <Text style={[styles.copy, { fontSize: 13 }]}>{tap.card ? 'Detailed explanation unavailable just now.' : 'Detailed explanation unavailable, so this is a direct translation.'}</Text>}
    {!!reading && !busy && <Text style={drawer.reading}>{isolateHebrew(v(reading))}</Text>}
    {/* The constructions the word is used in, learned with it (לְהִרְהֵר בְּ־, אַחֲרֵי). */}
    {!isPhrase && !leadPhrase && !busy && !!analysis && constructionsOf(analysis).length > 0
      && <Constructions items={constructionsOf(analysis)} v={v} size={15} meanings align="start" />}
    {!patternFirst && unitBox}
    {inYourWords && !busy && <Pressable accessibilityRole="link" onPress={() => { drawerPick('in your words'); router.push({ pathname: '/word', params: { id: inYourWords.id } }) }} hitSlop={6} style={[styles.row, { gap: 4 }]}>
      <Ionicons name="bookmark" size={14} color={colors.green} />
      <Text style={drawer.saved}>In your words · <Text style={[drawer.factHebrew, he]}>{isolateHebrew(v(inYourWords.lemma))}</Text></Text>
      <Ionicons name="chevron-forward" size={14} color={colors.green} />
    </Pressable>}
    {details && !busy && analysis && <Animated.View entering={APPEAR} style={{ gap: 12, paddingBottom: 4 }}
      onLayout={event => { if (openedDetails.current) { openedDetails.current = false; scroller.current?.scrollTo({ y: event.nativeEvent.layout.y, animated: true }) } }}>
        {!isPhrase && !!analysis.readAs && stripNiqqud(analysis.readAs) !== tap.text && <Text style={drawer.fact}>The photo text reads <Text style={[drawer.factHebrew, he]}>{isolateHebrew(tap.text)}</Text>; this is probably <Text style={[drawer.factHebrew, he]}>{isolateHebrew(v(analysis.readAs))}</Text>.</Text>}
        {analysis.parts.length > 1 && <Section label="Breakdown"><View style={drawer.parts}>
          {analysis.parts.map((part, i) => <View key={i} style={drawer.part}><Text style={[drawer.partHebrew, he]}>{v(part.text)}</Text><Text style={drawer.partMeaning}>{isolateHebrew(v(part.meaning))}</Text></View>)}
        </View></Section>}
        <WordFacts analysis={analysis} gloss={gloss} v={v} />
    </Animated.View>}
    </ScrollView>
    {moreBelow && <Text style={drawer.more} pointerEvents="none">More below ↓</Text>}
    </View>
    <ErrorNotice message={lookup.error} />
    {lookup.noWordsYet && !busy && <Text style={[styles.copy, { fontSize: 13, lineHeight: 18 }]}>Save it to practise it later: Mila makes flashcards for it, each with a sentence of its own.</Text>}
    <View style={[styles.row, { flexWrap: 'nowrap', gap: 10 }]}>
      {hasDetails && !busy && <Pressable accessibilityRole="button" onPress={toggleDetails} style={drawer.detailsToggle} hitSlop={6}>
        <Text style={drawer.toggleLabel}>{details ? 'Less' : 'Details'}</Text><Ionicons name={details ? 'chevron-down' : 'chevron-up'} size={16} color={colors.green} />
      </Pressable>}
      {/* A card's word: its meaning is the card's; the full explanation only when asked for. */}
      {!!tap.card && !analysis && !busy && !lookup.asked && <Pressable accessibilityRole="button" accessibilityLabel="Explain this word in full" onPress={() => { drawerPick('more'); openedDetails.current = true; void lookup.explain() }} style={drawer.detailsToggle} hitSlop={6}>
        <Text style={drawer.toggleLabel}>More</Text><Ionicons name="chevron-up" size={16} color={colors.green} />
      </Pressable>}
      {leadPhrase
        ? <Button secondary={phraseSaved} title={phraseSaved ? `${isPattern ? 'Pattern' : 'Expression'} saved ✓` : lookup.inYourWords ? 'Add this example' : isPattern ? 'Save pattern' : 'Save expression'} detail={phraseSaved ? 'Tap to undo' : undefined}
          busy={unsaving.has(tapKey(phrase!.text, sentence))} moment={phraseSaved ? null : undefined} onPress={() => { drawerPick(phraseSaved ? 'undo save' : 'save'); if (phraseSaved) lookup.unsave(true); else void lookup.save(true) }} style={{ flex: 1 }} />
        : isPhrase ? null
        : <Button secondary={wordSaved} title={wordSaved ? 'Saved ✓' : inYourWords ? 'Add this example' : 'Save word'} detail={wordSaved ? 'Tap to undo' : undefined}
          busy={unsaving.has(tapKey(tap.text, sentence))} moment={wordSaved ? null : undefined} onPress={() => { drawerPick(wordSaved ? 'undo save' : 'save'); if (wordSaved) lookup.unsave(); else void lookup.save() }} style={{ flex: 1 }} />}
    </View>
    {/* Words dragged across that aren't one phrase are not saved as written: one of them can be. */}
    {isPhrase && !phrase && !busy && !!onPickWord && <View style={{ gap: 6 }}>
      <Text style={drawer.label}>Not one phrase · tap a word to save it</Text>
      <View style={[styles.row, { flexDirection: 'row-reverse', gap: 6 }]}>
        {tap.text.split(/\s+/).map((word, i) => <Pill key={i} label={v(word)} accessibilityLabel={`Open ${word}`} onPress={() => { drawerPick('pick a word'); onPickWord(i) }} />)}
      </View>
    </View>}
    {leadPhrase && !phraseIsWord && !isPhrase && <TextButton title={unsaving.has(tapKey(tap.text, sentence)) ? 'Undoing…' : wordSaved ? `${isolateHebrew(tap.text)} saved on its own ✓ · Undo` : `Save just ${isolateHebrew(tap.text)}`}
      onPress={() => { drawerPick('save just the word', { value: wordSaved ? 'undo' : 'save' }); if (wordSaved) lookup.unsave(); else void lookup.save() }} />}
    {fillsPattern && <TextButton title={unsaving.has(tapKey(phrase!.text, sentence)) ? 'Undoing…' : phraseSaved ? 'Pattern saved ✓ · Undo' : `Save the pattern ${isolateHebrew(plainSpelling(phrase!.pattern!))}`}
      onPress={() => { drawerPick('save the pattern', { value: phraseSaved ? 'undo' : 'save' }); if (phraseSaved) lookup.unsave(true); else void lookup.save(true) }} />}
    {lookup.firstSave && (wordSaved || phraseSaved) && !saving.size && <TextButton title="Your first word is saved · Study it now" color={colors.green} onPress={() => { drawerPick('study now'); onClose(); router.push('/practice') }} />}
  </DraggableSheet>
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return <View style={{ gap: 4 }}><Text style={drawer.label}>{label}</Text>{children}</View>
}

// Dictionary entry (form, other senses, root, grammar) and an optional note, always in this order.
function WordFacts({ analysis, gloss, v }: { analysis: WordAnalysis; gloss: string; v: (text: string) => string }) {
  const he = useHebrew()
  const grammar = [analysis.partOfSpeech, analysis.binyan, analysis.form].filter(Boolean).join(' · ')
  const showLemma = !!analysis.lemma && stripNiqqud(analysis.lemma) !== stripNiqqud(analysis.vocalized || analysis.word)
  const senses = otherSenses(analysis.lemmaMeaning || '', gloss)
  const hasEntry = showLemma || !!senses || !!analysis.root || !!grammar
  return <>
    {hasEntry && <Section label="Dictionary">
      {showLemma && <Text style={drawer.fact}><Text style={[drawer.factHebrew, he]}>{isolateHebrew(v(analysis.lemma))}</Text>{senses ? ` · ${isolateHebrew(v(senses))}` : ''}</Text>}
      {!showLemma && !!senses && <Text style={drawer.fact}>Other senses: {isolateHebrew(v(senses))}</Text>}
      {(!!analysis.root || !!grammar) && <Text style={drawer.fact}>{analysis.root ? <>Root <Text style={[drawer.factHebrew, he]}>{isolateHebrew(analysis.root)}</Text>{grammar ? ' · ' : ''}</> : null}{grammar}</Text>}
    </Section>}
    {!!analysis.note && <Section label="Note"><Text style={drawer.fact}>{isolateHebrew(v(analysis.note))}</Text></Section>}
  </>
}

// An expression as a saved word: its dictionary form, and the word in it that inflects, which
// gives it that word's stages (lib/forms.ts). The root comes along when the tapped word is that
// word. A pattern keeps its pattern (נָטוּל + [שֵׁם עֶצֶם]). An older explanation has the
// expression only as written: then it is a plain phrase.
function expressionEntry(unit: Phrase, found: WordAnalysis | undefined): Pick<VocabEntry, 'lemma' | 'gloss'> & Partial<VocabEntry> {
  if (!unit.lemma) return { lemma: unit.text, gloss: unit.meaning, partOfSpeech: 'phrase' }
  const headIsTapped = !!found && !!unit.headPlain && lemmaKey(found.lemmaPlain || found.lemma) === lemmaKey(unit.headPlain)
  const pattern = unit.kind === 'pattern' && unit.pattern ? { pattern: unit.pattern } : {}
  // A pattern on one word (נָטוּל + [שֵׁם עֶצֶם]) is that word, learned with its pattern: it has
  // the word's own stages (נטול, נטולה, נטולים, נטולות) and is the entry the word alone is saved as.
  if (pattern.pattern && !lemmaKey(unit.lemmaPlain || unit.lemma).includes(' ')) {
    const partOfSpeech = unit.partOfSpeech && unit.partOfSpeech !== 'other' ? unit.partOfSpeech : headIsTapped ? found?.partOfSpeech : undefined
    return {
      lemma: unit.lemma, gloss: unit.meaning, ...pattern,
      ...(unit.lemmaPlain ? { lemmaPlain: unit.lemmaPlain } : {}),
      ...(partOfSpeech ? { partOfSpeech } : {}),
      ...(unit.binyan ? { binyan: unit.binyan } : {}),
      ...(headIsTapped && found?.root ? { root: found.root } : {}),
      ...(headIsTapped && found?.gender ? { gender: found.gender } : {}),
    }
  }
  return {
    lemma: unit.lemma, gloss: unit.meaning, partOfSpeech: 'expression', ...pattern,
    ...(unit.lemmaPlain ? { lemmaPlain: unit.lemmaPlain } : {}),
    ...(unit.head ? { head: { lemma: unit.head, ...(unit.headPlain ? { lemmaPlain: unit.headPlain } : {}), ...(unit.partOfSpeech ? { partOfSpeech: unit.partOfSpeech } : {}), ...(unit.binyan ? { binyan: unit.binyan } : {}) } } : {}),
    ...(headIsTapped && found?.root ? { root: found.root } : {}),
    ...builtOf(unit),
  }
}
// How a fixed expression is built, when the explanation gives it (lib/types.ts).
const builtOf = (unit: Phrase): Built => (!unit.literal ? {} : {
  literal: unit.literal,
  ...(unit.built?.length ? { built: unit.built.map(({ lemma, lemmaPlain, meaning }) => ({ lemma, meaning, ...(lemmaPlain ? { lemmaPlain } : {}) })) } : {}),
  ...(unit.literalNote ? { literalNote: unit.literalNote } : {}),
})

const drawer = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 14, gap: 10, backgroundColor: colors.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 1, borderColor: colors.line, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  word: { fontSize: 26, lineHeight: 38, fontWeight: '600', color: colors.ink, writingDirection: 'rtl', flexShrink: 1 },
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
  pattern: { fontSize: 22, lineHeight: 32, fontWeight: '600', color: colors.ink, writingDirection: 'rtl' },
  reading: { fontSize: 14, lineHeight: 20, color: colors.muted },
  saved: { fontSize: 14, fontWeight: '600', color: colors.green },
  phrase: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.paper },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 10, height: 50 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: colors.green },
})

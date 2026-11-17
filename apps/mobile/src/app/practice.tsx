import { type ReactNode, useEffect, useRef, useState } from 'react'
import Animated from 'react-native-reanimated'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { router, Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { stop as stopSpeaking } from '../lib/speech'
import { ListenButton } from '../components/Listen'
import { Button, colors, ErrorNotice, Loading, Page, Pressy, styles } from '../components/ui'
import { DraggableSheet, FlipCard, Shake, type Side, SwipeCard } from '../components/Motion'
import { APPEAR, CARD_BACK_IN, CARD_IN, DISAPPEAR } from '../lib/motion'
import { feel } from '../lib/feedback'
import { type Table, tableMeaning } from '../lib/explore'
import { tableFor } from '../lib/explore-requests'
import { ago, assess, type Card, planRound, type Plan, cardKey, type ChoiceMode, checkpointGroup, exerciseOf, freshCards, freshPicks, freshRound, justAfterItsWord, onSentence, type Sentence, sentenceFor, shownForm, wantsSentence, writerOf, checkpointRecord, cuedTranslation, exposureOf, firstSense, followUps, type Include, isPrimed, kindLabel, kindOfEntry, lastStudied, missingStages, type Order, quizOf, recommendedStages, type Seen, stagesOf, startingStages, studyPool, upcoming } from '../lib/forms'
import { englishPieces, hebrewPieces, prefixOf } from '../lib/marks'
import { bareWord, stripNiqqud } from '../lib/ocr-cleanup'
import { type Front, getPref, noteStudyDay, type Planner, setPref } from '../lib/prefs'
import { noteActivity } from '../lib/tree'
import type { FormCard, Results, Session, VocabEntry } from '../lib/types'
import { withVowels } from '../lib/vowels'
import { bothForms, constructionsOf, lemmaKey, savedByLemma, savedBySurface } from '../lib/words'
import { alignment, englishTokens, hasWords, helpFor, needsWords, targetPlaces, withSentenceWords } from '../lib/english-help'
import { Constructions } from '../components/Constructions'
import { useWordLookup, WordDrawer, type WordLookup } from '../components/WordDrawer'
import { cardWords, ensureForms, freshSentences } from '../lib/word-forms'
import { askBeforeResuming, resumeRound, roundToSave } from '../lib/rounds'
import { clearRound, loadRound, saveRound } from '../lib/saved-round'
import { fingerprint, sendStudyLog, studySession } from '../lib/study-log'
import { planUnified, shadowLog, shadowRanking, unifiedRanking } from '../lib/scoring'
import { saveResult, sendResults } from '../lib/results'
import type { ResultBody } from '../lib/result-queue'
import { appInfo } from '../lib/app-info'
import { useSession } from '../state/session'
import { cachedVocab, putEntry, vocabFor } from '../state/vocab'
import { useVowels } from '../state/vowels'
import { ScriptContext, useCursive, useHebrew } from '../state/script'

const bare = (text: string) => stripNiqqud(bareWord(text))
type Settings = { front: Front; order: Order; include: Include; choices: ChoiceMode; planner: Planner }
const CHOICES: Record<ChoiceMode, string> = { some: 'Sometimes', all: 'Always', off: 'Off' }
// How long a filled-in blank stays to show how it went before the next card: enough to see the
// right answer, longer beside a wrong one.
// A blank in the Hebrew, drawn as a line long enough to see.
const BLANK = '＿＿＿'
const RIGHT_PAUSE = 900
// Words (a stage each) given new sentences in a visit to Study, at most (prepareAhead).
const VARY_PER_VISIT = 3
// A wrong choice waits long enough to read the sentence as it should be: a little longer for a
// longer sentence, and a tap on the card holds it there.
const wrongPause = (form: FormCard | null) => Math.min(5000, 2500 + 25 * ((form?.translation || '').length + (form?.sentence || '').length))
const FRONTS: Record<Front, string> = { he: 'Hebrew first', en: 'English first', mixed: 'Mixed' }
const INCLUDES: Record<Include, string> = { both: 'Words & sentences', words: 'Words', sentences: 'Sentences' }
const ORDERS: Record<Order, string> = { smart: 'Smart', shuffle: 'Shuffled' }
const PLANNERS: Record<Planner, string> = { standard: 'Standard', unified: 'Unified' }
// A round as the chosen planner makes it: smart order by Study's standard rules or, as an experiment,
// by the unified ranking (lib/scoring.ts planUnified); shuffled is always shuffled.
const planFor = (entries: VocabEntry[], settings: Settings, now = Date.now(), seed = String(now)) =>
  (settings.order === 'smart' && settings.planner === 'unified' ? planUnified(entries, settings, now) : planRound(entries, settings, now, seed))
const SHOW_FIRST: Record<Front, string> = { he: 'Hebrew', en: 'English', mixed: 'Mixed' }
// A word's table of forms for its checkpoints, or why it couldn't be had.
type Loaded = Table | { error: string }

// The one place to study. A round of cards (lib/forms.ts planRound): saved words, their forms in
// sentences, and checkpoints on a whole tense. Tap a card to turn it over; swipe it right if you
// knew it, left if you're still learning (the arrows move on or back without answering). What
// is answered only shapes what Mila brings in next and what comes round more: nothing is ever
// due. A round ends calmly and can go round again for as long as you like; Done stops. Hebrew or
// English first, smart or shuffled order, which cards and quiz mode are chosen on the screen and
// remembered. New stages' cards are written in the background. A long press on the card count
// shows why each card is in the round (lib/forms.ts planRound), to see what Mila is choosing.
// The round is kept on the phone as it goes (lib/rounds.ts): leaving Study, or Mila, only pauses
// it, and Study opens again on the same card and side (after hours away, once the learner says
// to go on with it rather than start a new one). Finishing it, Done or a new round from the top
// bar ends it. Everything shown and answered is logged (lib/study-log.ts), and cards
// are written only for the words a round is about to draw on (lib/forms.ts upcoming).
export default function Practice() {
  const { session } = useSession()
  const insets = useSafeAreaInsets()
  // A card's question side is in print with the vowels setting; its answer side in cursive
  // (without vowels) unless print is chosen for answers; the word drawer is as in the reader.
  const [showVowels, , vowelSetting] = useVowels()
  const [cursiveAnswers, setCursiveAnswers] = useCursive('answers')
  const v = (text: string) => withVowels(text, showVowels)
  const vQuestion = (text: string) => withVowels(text, vowelSetting)
  const vAnswer = (text: string) => withVowels(text, vowelSetting && !cursiveAnswers)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [why, setWhy] = useState(false)
  useEffect(() => { void getPref('studyWhy').then(setWhy) }, [])
  const toggleWhy = () => { feel('tick'); setPref('studyWhy', !why); setWhy(!why) }
  const [deck, setDeck] = useState<Card[] | null>(null)
  // Temporary, for checking cues: only cards whose English shows one, English first.
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Where the round being studied starts in the deck (rounds are appended as they go round).
  const [roundStart, setRoundStart] = useState(0)
  const [position, setPosition] = useState(0)
  const [way, setWay] = useState<'next' | 'previous'>('next')
  const [flipped, setFlipped] = useState(false)
  // By position in the deck: the answer given, the card's record before it (so an answer can be
  // changed on going back) and a quiz choice.
  const [answers, setAnswers] = useState<Record<number, boolean>>({})
  const [before, setBefore] = useState<Record<number, Results>>({})
  const [picks, setPicks] = useState<Record<number, string>>({})
  const [unlocked, setUnlocked] = useState<string[]>([])
  const [done, setDone] = useState(false)
  // A round left hours ago, until the learner chooses to go on with it or start a new one.
  const [away, setAway] = useState<{ at: number; of: number; savedAt: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tables, setTables] = useState<Record<string, Loaded>>({})
  // The latest copy of each word, so results and new stages build on each other within a session.
  const [words, setWords] = useState<Record<string, VocabEntry>>({})
  // A drag in progress, or when the last one ended: the release of a swipe is not a tap.
  const drag = useRef<{ on: boolean; ended: number }>({ on: false, ended: 0 })
  const tapped = () => !drag.current.on && Date.now() - drag.current.ended > 300
  const onDrag = (dragging: boolean) => { drag.current = { on: dragging, ended: dragging ? drag.current.ended : Date.now() } }
  const keep = (ready: VocabEntry) => setWords(current => ({ ...current, [ready.id]: withNewForms(current[ready.id], ready) }))
  // Cards for the open stages, written now for the words of `cards` and the next ones a round
  // will draw on (lib/forms.ts upcoming), never for every saved word; resolves to those written.
  const prepareAhead = (cards: Card[], all: VocabEntry[], include: Include) => {
    if (!session) return Promise.resolve([])
    const wanted = new Map([...cards.map(card => card.entry), ...upcoming(all, include)].map(entry => [entry.id, entry]))
    const missing = [...wanted.values()].filter(entry => missingStages(entry).length)
    const ready = Promise.all(missing.map(entry => ensureForms(entry, session.token)))
    void ready.then(written => written.forEach(item => { share(session, item); keep(item) }))
    varyAhead(cards, all)
    wordsAhead(cards)
    return ready
  }
  // Word data for the round's older cards (lib/english-help.ts): asked for in the background, in
  // the round's order and two at a time, so each card has it before it comes up and nothing in
  // Study waits for it; kept on the card by the server. Each card once a visit.
  const wordsAsked = useRef<Set<string>>(new Set())
  const wordsAhead = (cards: Card[]) => {
    if (!session) return
    const latest = new Map((cachedVocab(session) ?? []).map(entry => [entry.id, entry]))
    const queue = cards.flatMap(card => {
      const entry = latest.get(card.entry.id) ?? card.entry
      const form = card.form ? entry.forms?.find(item => item.key === card.form!.key) : undefined
      if (!form || !needsWords(form) || wordsAsked.current.has(`${entry.id}:${form.key}`)) return []
      wordsAsked.current.add(`${entry.id}:${form.key}`)
      return [{ entry, key: form.key }]
    })
    const next = (): Promise<void> => {
      const item = queue.shift()
      return !item ? Promise.resolve() : cardWords(item.entry, item.key, session.token)
        .then(({ sentences }) => mergeWords(item.entry.id, item.key, sentences), () => undefined).then(next)
    }
    void next(); void next()
  }
  const mergeWords = (id: string, key: string, sentences: Parameters<typeof withSentenceWords>[2]) => {
    if (!session || !sentences.length) return
    setWords(current => (current[id] ? { ...current, [id]: withSentenceWords(current[id], key, sentences) } : current))
    const cached = cachedVocab(session)?.find(item => item.id === id)
    if (cached) putEntry(session, withSentenceWords(cached, key, sentences))
  }
  // New sentences for the round's cards that would be helped by one (lib/forms.ts wantsSentence:
  // known in one sentence only, or missed twice in the same one), written while the round goes on
  // so the card shows it when it comes up, this round or the next. A few words a visit at most
  // (word-forms.ts caps the day too); nothing is written for a card that doesn't need it.
  const varied = useRef<Set<string>>(new Set())
  const varyAhead = (cards: Card[], all: VocabEntry[]) => {
    if (!session) return
    const latest = new Map(all.map(entry => [entry.id, entry]))
    const asks = new Map<string, { entry: VocabEntry; stage: string; keys: string[]; why: string }>()
    for (const card of cards) {
      const entry = latest.get(card.entry.id) ?? card.entry
      const form = card.form && !card.mode ? entry.forms?.find(item => item.key === card.form!.key) : undefined
      const why = form && wantsSentence(form)
      if (!form || !why) continue
      const id = `${entry.id}:${form.stage}`
      if (varied.current.has(id)) continue
      const ask = asks.get(id) ?? asks.set(id, { entry, stage: form.stage, keys: [], why }).get(id)!
      if (!ask.keys.includes(form.key)) ask.keys.push(form.key)
    }
    for (const ask of [...asks.entries()].slice(0, Math.max(0, VARY_PER_VISIT - varied.current.size))) {
      varied.current.add(ask[0])
      const { entry, stage, keys, why } = ask[1]
      void freshSentences(entry, stage, session.token, { keys, why }).then(ready => {
        setWords(current => ({ ...current, [entry.id]: withVariants(current[entry.id], ready) }))
        putEntry(session, withVariants(cachedVocab(session)?.find(item => item.id === entry.id), ready))
      }, () => undefined)
    }
  }
  // This visit's study log (lib/study-log.ts): the cards shown in order, and for each position
  // when it was first shown and what of its word had been shown before it; an answer's primed
  // mark is settled on its first answer, so changing the answer keeps it.
  const study = useRef<ReturnType<typeof studySession> | null>(null)
  // A round as Mila planned it (lib/forms.ts planRound), logged with how it was divided, each
  // card's part of the round and rank in it, and the shadow score's ranking beside it (lib/scoring.ts,
  // which never changes the round): Learning Insights. Its cards from `from` in the deck.
  // `planner`: which planner made the round (Study → Settings → Try), so rounds can be told apart.
  const planned = (plan: Plan, from: number, entries: VocabEntry[], { include, order, planner }: Settings) => {
    let shadow: ReturnType<typeof shadowLog> | null = null
    try { shadow = shadowLog(shadowRanking(plan, entries, include), unifiedRanking(plan, entries, include)) } catch { /* the score is only looked at, never needed */ }
    study.current?.log('plan', { from, planner: order === 'smart' ? planner : 'shuffle', budget: plan.budget, cards: plan.considered.filter(item => item.chosen).map(({ key, slot, rank }) => ({ key, slot, rank })), left: plan.considered.filter(item => !item.chosen).length, ...(shadow ? { shadow } : {}) })
    return plan.cards
  }
  const seen = useRef<Seen[]>([])
  const shownAt = useRef<Record<number, { at: number; key: string; wordCardsAgo: number | null; wordMsAgo: number | null }>>({})
  const primedAt = useRef<Record<number, boolean>>({})
  const revealed = useRef<Set<number>>(new Set())
  // Which side a card shows first. Mixed: one or the other, settled per card and position.
  const frontOf = (card: Card, at: number): 'he' | 'en' => (!settings ? 'he' : settings.front === 'mixed'
    ? ([...`${cardKey(card)}${at - roundStart}`].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2 ? 'en' : 'he') : settings.front)
  // The Hebrew for an English word held on a card's question side, by position (holdWord).
  const [wordHint, setWordHint] = useState<Record<number, { index: number; text: string | null; note?: boolean }>>({})
  // Turning a card over, logged the first time at each position with how long it took.
  const turnOver = () => {
    if (!flipped && !revealed.current.has(position) && deck?.[position]) {
      revealed.current.add(position)
      study.current?.log('reveal', { position, key: cardKey(deck[position]), ms: Date.now() - (shownAt.current[position]?.at ?? Date.now()) })
    }
    // A word's Hebrew asked for on the question side goes with it.
    setWordHint(current => { const { [position]: _gone, ...rest } = current; return rest })
    setFlipped(value => !value)
  }
  // A word of a card's sentence looked up on its answer side, in the reader's drawer over the
  // card: saving it keeps it for later study and leaves this round as it is.
  const lookup = useWordLookup(session, { onLostError: setError, log: (type, fields) => study.current?.log(type, fields) ?? '' })
  // Help with one word on a card shown in English (lib/english-help.ts): an English word held
  // puts the Hebrew that says it on one line under the sentence, as the card's other quiet lines
  // are; the next hold replaces it and turning the card over clears it (`wordHint`, by position). The
  // word is marked only while held (`holding`). A word with no Hebrew of its own, or the card's
  // own, says so on the same line. The card has what it needs (prepared ahead, wordsAhead); one
  // not yet prepared asks for its sentence now, the rare fallback, and the line fills in.
  // `asked`, by position: the Hebrew words given, which the answer keeps for the learner model.
  const [holding, setHolding] = useState<number | null>(null)
  const [asked, setAsked] = useState<Record<number, number[]>>({})
  const [holdTip, setHoldTip] = useState(false)
  useEffect(() => { void getPref('holdTip').then(setHoldTip) }, [])
  const holdWord = async (card: Card, entry: VocabEntry, form: FormCard, variant: number, index: number) => {
    if (!session) return
    const here = position, started = Date.now()
    feel('select')
    setHolding(index)
    const show = (text: string | null, note = false) => setWordHint(current => (current[here] && current[here].index !== index ? current : { ...current, [here]: { index, text, note } }))
    setWordHint(current => ({ ...current, [here]: { index, text: null } }))
    if (holdTip) { setHoldTip(false); setPref('holdTip', false) }
    // Which English words each Hebrew word says: from the card, or (not yet prepared) asked now.
    const words = form.sentence.split(/\s+/).filter(Boolean)
    const ready = hasWords(form)
    let glosses = ready ? form.glosses! : null
    if (!glosses) {
      const done = await cardWords(entry, form.key, session.token, variant - 1).catch(() => null)
      if (done) mergeWords(entry.id, form.key, done.sentences)
      glosses = done?.sentences.find(item => item.variant === variant - 1)?.glosses ?? null
    }
    const help = glosses ? helpFor(index, alignment(englishTokens(cuedTranslation(form)), glosses.map(item => ({ place: item.i, t: item.t ?? '' }))), form.sentence, targetPlaces(form.sentence, form.mark)) : null
    // Every hold, with what it found (Learning Insights: help that found nothing is seen too); the
    // Hebrew words given are also logged as lookups below, which the learner model reads.
    study.current?.log('hold', {
      key: cardKey(card), position: here, index, english: englishTokens(cuedTranslation(form))[index]?.text, found: help?.kind ?? 'failed',
      ...(help?.kind === 'hebrew' ? { hebrew: help.hebrew, places: help.places } : {}), from: ready ? 'card' : 'late', ...(ready ? {} : { waitMs: Date.now() - started }),
    })
    if (help?.kind !== 'hebrew') {
      show(!help ? 'Couldn’t be looked up just now' : help.kind === 'target' ? 'Part of the word you’re recalling'
        : help.kind === 'none' ? 'No separate word in Hebrew' : 'No hint for this word', true)
      return
    }
    show(help.hebrew)
    if (help.places.every(place => asked[here]?.includes(place))) return
    setAsked(current => ({ ...current, [here]: [...new Set([...(current[here] ?? []), ...help.places])] }))
    // Logged as a lookup of each Hebrew word given, on the card, asked from its English; `from`
    // says whether the card had it ('card') or it was asked for then ('late', the fallback).
    const saved = cachedVocab(session) ?? []
    const byLemma = savedByLemma(saved), bySurface = savedBySurface(saved)
    for (const place of help.places) {
      const gloss = glosses?.find(item => item.i === place)
      const word = bareWord(words[place] ?? '')
      study.current?.log('lookup', {
        key: cardKey(card), position: here, word, place, help: 'english', english: englishTokens(cuedTranslation(form))[index]?.text, own: false, from: ready ? 'card' : 'late',
        saved: !!(gloss?.lemma ? byLemma.get(lemmaKey(gloss.lemma)) : bySurface.get(lemmaKey(word))), ...(gloss?.lemma ? { lemma: gloss.lemma } : {}),
      })
    }
  }
  // How a card is put to the learner: which of its sentences and why (lib/forms.ts sentenceFor),
  // settled from its record before this visit's answer and kept for its place in the round, so
  // neither answering nor a sentence arriving meanwhile changes it; and how it is asked and why
  // (exerciseOf), fill in the blank with its options or a flashcard. Who wrote the sentence is
  // logged with it.
  const sentenceAt = useRef<Record<string, Sentence>>({})
  const presentation = (card: Card, entry: VocabEntry, record: Results, english: boolean, primed: boolean, at: number) => {
    const stored = card.form ? entry.forms?.find(item => item.key === card.form!.key) || card.form : null
    const pin = `${at}:${cardKey(card)}`
    const sentence = !stored ? null : card.variant !== undefined
      ? { variant: card.variant, why: 'asked' as const, fresh: !(record.seen || []).includes(card.variant) }
      : (sentenceAt.current[pin] ??= sentenceFor(stored, record))
    const variant = sentence?.variant ?? 0
    const shown = stored ? shownForm(stored, variant) : null
    const exercise = settings ? exerciseOf(card, record, settings.choices, primed, sentence ?? undefined) : null
    const quiz = exercise?.choice
      ? quizOf(Object.values(words), { entry, form: shown }, english, `${cardKey(card)}-${record.results?.length ?? 0}`) : null
    return { shown, variant, sentence, exercise, quiz, writer: stored ? writerOf(stored, variant) : undefined }
  }
  // What a showing or answer says about how its card was put (study-log.ts): the sentence, whether
  // it was new to the learner and why it was chosen, and why it was asked as it was.
  const presented = (shownAs: ReturnType<typeof presentation> | null) => ({
    ...(shownAs?.sentence ? { variant: shownAs.variant, sentence: shownAs.sentence.why, sentenceNew: shownAs.sentence.fresh } : {}),
    ...(shownAs?.exercise ? { exerciseWhy: shownAs.exercise.why } : {}), ...(shownAs?.writer ? { writer: shownAs.writer } : {}),
  })
  const [writing, setWriting] = useState<number | null>(null)
  // A filled-in blank moves on by itself after a moment to take in the result, longer when it was
  // wrong; going anywhere else first, or looking up a word on it, stops that.
  const advancing = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pausing, setPausing] = useState(false)
  const clearAdvance = () => { if (advancing.current) { clearTimeout(advancing.current); advancing.current = null } }
  const stopAdvancing = () => { clearAdvance(); setPausing(false) }
  useEffect(() => { if (lookup.tap) clearAdvance() }, [lookup.tap])
  useEffect(() => clearAdvance, [])

  useEffect(() => {
    if (!session) return
    let current = true
    void (async () => {
      try {
        const [front, order, include, quiz, picked, planner] = await Promise.all([getPref('studyFront'), getPref('studyOrder'), getPref('studyCards'), getPref('studyQuiz'), getPref('studyChoices'), getPref('studyPlanner')])
        // Quiz forms switched on before fill in the blank had a setting of its own is Always.
        const chosen: Settings = { front, order, include, choices: quiz ? 'all' : picked, planner }
        // The saved words already loaded if there are any, so studying opens at once.
        const entries = await vocabFor(session)
        if (!current) return
        setSettings(chosen)
        setWords(Object.fromEntries(entries.map(entry => [entry.id, entry])))
        study.current = studySession(session.user.id)
        void sendStudyLog(session.user.id, session.token); void sendResults(session.user.id, session.token)
        // The round left unfinished, if anything of it is left, or a new one. One left hours ago
        // waits for the learner to say whether to go on with it.
        const saved = loadRound(session.user.id)
        const resumed = resumeRound(saved, entries)
        let cards = resumed ? resumed.deck : planned(planFor(entries, chosen), 0, entries, chosen)
        // Its words, and the next a round will draw on, get the cards of their open stages
        // written now. Studying starts with what is ready; only if nothing is does it wait.
        const preparing = prepareAhead(cards, entries, chosen.include)
        const pool = studyPool(entries, chosen.include)
        study.current.log('start', { ...chosen, resumed: !!resumed, cards: cards.length, saved: entries.length, started: pool.started.length, unstarted: pool.unstarted.length, app: appInfo() })
        if (resumed) {
          setDeck(resumed.deck); setPosition(resumed.position); setFlipped(resumed.flipped)
          setAnswers(resumed.answers); setBefore(resumed.before)
          if (askBeforeResuming(saved)) setAway({ at: resumed.position + 1, of: resumed.deck.length, savedAt: saved!.savedAt })
          return
        }
        if (!cards.length && entries.length) {
          const written = new Map((await preparing).map(entry => [entry.id, entry]))
          const latest = entries.map(entry => written.get(entry.id) ?? entry)
          cards = planned(planFor(latest, chosen), 0, latest, chosen)
        }
        if (current) setDeck(cards)
      } catch (failure) { if (current) setError((failure as Error).message) }
    })()
    return () => {
      current = false; stopSpeaking()
      if (session) void sendStudyLog(session.user.id, session.token)
    }
    // Once per account signed in; prepareAhead is the same work whichever render made it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // A checkpoint's table of forms, asked for as the card (or the one after it) comes up.
  const token = session?.token
  useEffect(() => {
    if (!deck || !token) return
    for (const item of deck.slice(position, position + 2)) {
      const entry = words[item.entry.id] || item.entry
      if (!item.checkpoint || tables[entry.id]) continue
      void tableFor(entry, token).then(table => setTables(current => ({ ...current, [entry.id]: table })),
        (failure: Error) => setTables(current => ({ ...current, [entry.id]: { error: failure.message } })))
    }
    // Only a new card can need a table; `words` and `tables` change with every answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, position, token])

  // The round as it stands, kept after each change; let go once it is over. Not while Study is
  // asking whether to go on with it, so leaving without choosing asks again next time.
  const owner = session?.user.id
  useEffect(() => {
    if (!owner || !deck || away) return
    if (done) clearRound()
    else saveRound(roundToSave(owner, deck, roundStart, position, flipped, answers, before))
  }, [owner, deck, roundStart, position, flipped, answers, before, done, away])

  // Each card as it is shown, once per position (again only if the position now holds another
  // card), with what of its word and of itself this visit had shown before, and its record.
  const shownKey = deck?.[position] ? cardKey(deck[position]) : null
  useEffect(() => {
    const card = deck?.[position]
    if (!card || !settings || !study.current || done || shownAt.current[position]?.key === shownKey) return
    const now = Date.now()
    const entry = words[card.entry.id] || card.entry
    const key = cardKey(card)
    const word = exposureOf(seen.current, item => item.word === entry.id, now)
    const self = exposureOf(seen.current, item => item.key === key, now)
    const record = card.checkpoint ? checkpointRecord(entry, card.checkpoint) : (card.form && entry.forms?.find(item => item.key === card.form!.key)) || entry
    shownAt.current[position] = { at: now, key, wordCardsAgo: word?.cardsAgo ?? null, wordMsAgo: word?.msAgo ?? null }
    seen.current.push({ key, word: entry.id, at: now })
    const front = frontOf(card, position)
    const shownAs = card.checkpoint ? null : presentation(card, entry, record, front !== 'en', justAfterItsWord(deck!, position, roundStart), position)
    study.current.log('show', {
      ...cardFields(card, entry, position, roundStart), front: shownAs?.quiz ? null : front, quiz: !!shownAs?.quiz, exercise: shownAs?.quiz ? 'choice' : 'card',
      // Which sentence exactly, so an event can be read against it after the card is repaired.
      ...(shownAs?.shown?.sentence ? { sentenceId: fingerprint(shownAs.shown.sentence) } : {}),
      ...(shownAs?.quiz ? { tests: !card.form || card.form.stage === 'meanings' ? 'word' : 'form' } : {}),
      ...presented(shownAs),
      wordShown: word, cardShown: self, results: record.results ?? [], primed: record.primed ?? [], lastAnswered: record.last ?? null, wordLastStudied: lastStudied(entry) || null,
    })
    // Only a new card or position needs logging; `words` changes with every answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, position, settings, done])
  // A round's end, by finishing it or Done: how much was answered, and what is waiting is sent.
  useEffect(() => {
    if (!done || !study.current || !session) return
    study.current.log('end', { answered: Object.keys(answers).length, round: roundStart })
    void sendStudyLog(session.user.id, session.token)
    // Once per end of a round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  if (!session) return <Page><Text style={styles.copy}>Sign in to study your saved words.</Text></Page>
  if (!deck || !settings) return <Page>{error ? <ErrorNotice message={error} /> : <Loading />}</Page>
  if (!Object.keys(words).length) return <Page>
    <Text style={styles.title}>Nothing to study yet.</Text>
    <Text style={styles.copy}>Save words as you read and they will show up here.</Text>
    <Button title="Back" onPress={() => router.back()} />
  </Page>

  // Another round, from the latest copy of each word (its order reflects what was just studied).
  const newRound = () => {
    stopAdvancing()
    const again = planned(planFor(Object.values(words), settings, Date.now(), `${Date.now()}`), deck.length, Object.values(words), settings)
    // Don't show the card just studied twice in a row.
    const last = deck[deck.length - 1]
    if (again.length > 1 && last && cardKey(again[0]) === cardKey(last)) again.push(again.shift()!)
    void prepareAhead(again, Object.values(words), settings.include)
    setRoundStart(deck.length); setDeck([...deck, ...again]); setPosition(deck.length)
    setWay('next'); setFlipped(false); setDone(false)
  }
  // From the top bar: partway through a round, asked first, since the place in it is let go.
  const confirmNewRound = () => {
    const midway = position > roundStart && position < deck.length - 1
    const start = () => { feel('advance'); lookup.close(); newRound() }
    if (!midway) { start(); return }
    Alert.alert('Start a new round?', `You're on card ${position - roundStart + 1} of ${deck.length - roundStart}. Your answers so far are saved.`, [
      { text: 'Keep going', style: 'cancel' },
      { text: 'New round', onPress: start },
    ])
  }
  // A round of new sentences (lib/forms.ts freshPicks): the words being learned, a stage each,
  // their cards in sentences written now for what the learner knows (kept beside the cards' own,
  // word-forms.ts fresh), answered as ever. Stages that have them already aren't written again.
  const newSentences = async () => {
    const picks = freshPicks(Object.values(words))
    setSettingsOpen(false); lookup.close(); stopAdvancing()
    if (!picks.length) {
      Alert.alert('No words to write new sentences for', Object.values(words).some(entry => entry.forms?.some(form => form.variants?.length))
        ? 'The words you’re learning got new sentences lately, and Study now brings in more by itself when a word needs one. Try again tomorrow.'
        : 'They are written for words you have studied in sentences. Study a few sentence cards first.')
      return
    }
    feel('advance'); setWriting(picks.length); setError(null)
    const had = picks.map(({ entry }) => words[entry.id] || entry)
    const written = await Promise.all(picks.map(({ stage }, i) => freshSentences(had[i], stage, session.token, { why: 'asked' }).catch(() => null)))
    const cards = freshRound(written.map((entry, i) => (entry ? freshCards(entry, picks[i].stage, had[i]) : [])))
    setWriting(null)
    if (!cards.length) { setError('New sentences couldn\'t be written just now. Try again in a moment.'); return }
    const fresh = written.filter((entry): entry is VocabEntry => !!entry)
    setWords(current => ({ ...current, ...Object.fromEntries(fresh.map(entry => [entry.id, entry])) }))
    fresh.forEach(entry => putEntry(session, entry))
    setRoundStart(deck.length); setDeck([...deck, ...cards]); setPosition(deck.length)
    setWay('next'); setFlipped(false); setDone(false)
  }
  // A round of new sentences says so wherever it is: in the title, over each of its cards, in the
  // line under the top bar and at its end.
  const freshNow = writing !== null || deck.slice(roundStart).some(item => item.mode === 'fresh')
  const title = <Stack.Screen options={{ title: freshNow ? 'New sentences' : 'Study' }} />
  if (writing !== null) return <Page>
    {title}
    <Text style={styles.title}>New sentences</Text>
    <Text style={styles.copy}>Mila is writing sentences you haven’t seen for {writing} {writing === 1 ? 'word' : 'words'} you’re learning, using the words you know and those you’ve looked up lately. This takes a few seconds.</Text>
    <Loading />
  </Page>
  if (away) return <Page>
    <Text style={styles.title}>Welcome back</Text>
    <Text style={styles.copy}>You stopped at card {away.at} of {away.of}, {ago(away.savedAt)}. Your answers are saved either way.</Text>
    <Button title="Continue this round" onPress={() => { feel('advance'); setAway(null) }} />
    <Button secondary title="Start a new round" onPress={() => { feel('advance'); setAway(null); newRound() }} />
  </Page>
  if (done) return <Summary title={title} fresh={freshNow} answered={Object.keys(answers).length} words={new Set(Object.keys(answers).map(i => deck[Number(i)].entry.id)).size}
    unlocked={unlocked} error={error} onMore={newRound} onFresh={() => void newSentences()} />

  // Moving through the round. Past its end, the round is over. Every card comes back to its
  // question side, a quiz card to its choices; an answer it was given stays and is shown.
  // `quiet` when an answer already made its sound; `added`, cards the answer just brought in
  // behind it (not yet in `deck`). False when there was nowhere to go.
  const go = (step: 1 | -1, quiet = false, added = 0) => {
    const to = position + step
    if (to < roundStart) return false
    lookup.close(); stopAdvancing()
    if (to >= deck.length + added) { setDone(true); return true }
    if (!quiet) feel('advance')
    setWay(step === 1 ? 'next' : 'previous'); setPosition(to); setFlipped(false)
    return true
  }
  const stopStudying = () => { stopSpeaking(); if (Object.keys(answers).length) setDone(true); else { clearRound(); router.back() } }

  // Settings apply from the next card on; which side shows first applies at once.
  const change = (patch: Partial<Settings>) => {
    const updated = { ...settings, ...patch }
    setSettings(updated)
    if (patch.front) setPref('studyFront', patch.front)
    if (patch.order) setPref('studyOrder', patch.order)
    if (patch.include) setPref('studyCards', patch.include)
    if (patch.choices) { setPref('studyChoices', patch.choices); setPref('studyQuiz', false) }
    if (patch.planner) setPref('studyPlanner', patch.planner)
    if (patch.order || patch.include || patch.planner) {
      const here = deck[position]
      const rest = planned(planFor(Object.values(words), updated, Date.now(), `${Date.now()}`), position + 1, Object.values(words), updated).filter(card => !here || cardKey(card) !== cardKey(here))
      void prepareAhead(rest, Object.values(words), updated.include)
      setDeck([...deck.slice(0, position + 1), ...rest])
    }
  }

  const summary = freshNow ? `New sentences · ${new Set(deck.slice(roundStart).map(item => item.entry.id)).size} words you’re learning` : [FRONTS[settings.front], settings.order === 'shuffle' ? 'Shuffled' : settings.planner === 'unified' ? 'Unified order' : 'Smart order', INCLUDES[settings.include],
    settings.choices === 'all' && 'Fill in the blank', cursiveAnswers && 'Answers in כתב יד'].filter(Boolean).join(' · ')
  const sheet = settingsOpen && <SettingsSheet settings={settings} change={change} cursive={cursiveAnswers} onCursive={() => setCursiveAnswers(!cursiveAnswers)} onClose={() => setSettingsOpen(false)} onFresh={() => void newSentences()} />

  const card = deck[position]
  const progress = { at: position - roundStart + 1, of: deck.length - roundStart }
  if (!card) return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    {title}
    <TopBar summary={summary} progress={null} canGoBack={false} onBack={() => go(-1)} onNext={() => go(1)} onDone={stopStudying} onNewRound={confirmNewRound} onSettings={() => { stopAdvancing(); setSettingsOpen(true) }} />
    <View style={[styles.content, { gap: 12 }]}>
      <Text style={styles.copy}>{settings.include === 'sentences' ? 'No sentence cards yet. They are written for each word as you save it.' : 'Nothing to study with these settings.'}</Text>
      <Button title="Study words and sentences" onPress={() => change({ include: 'both' })} />
    </View>
    {sheet}
  </View>

  const entry = words[card.entry.id] || card.entry
  const stored = card.form ? entry.forms?.find(item => item.key === card.form!.key) || card.form : null
  const checkpoint = card.checkpoint ?? null
  const record: Results = checkpoint ? checkpointRecord(entry, checkpoint) : stored || entry
  const englishFirst = frontOf(card, position) === 'en' && (!stored || !!stored.translation)
  // The card as shown: one of its sentences, and as a fill in the blank or turned over. Fill in
  // the blank: a word card shown in Hebrew asks for its meaning, shown in English for the word. A
  // checkpoint is always recalled and turned over.
  const shownAs = checkpoint ? null : presentation(card, entry, before[position] ?? record, !englishFirst, justAfterItsWord(deck, position, roundStart), position)
  const form = shownAs?.shown ?? stored
  const stage = form ? stagesOf(entry).find(item => item.key === form.stage) : null
  const loaded = tables[entry.id]
  const rows = checkpoint && loaded && 'groups' in loaded ? loaded.groups.find(group => group.key === checkpointGroup(entry, checkpoint))?.rows ?? [] : []
  const quiz = shownAs?.quiz ?? null
  const choices = quiz?.options ?? null
  // A blank already filled (on going back, or in a round resumed, where the choice itself wasn't
  // kept: '' then) shows how it was answered and can't be answered again.
  const picked = picks[position] ?? (!!quiz && answers[position] !== undefined ? '' : null)
  const right = !!quiz && !!picked && bare(picked) === bare(quiz.answer)
  const testsForm = !!form && form.stage !== 'meanings'
  const answered = answers[position]
  // A checkpoint can only be answered once its forms are there to check against.
  const answerable = !checkpoint || rows.length > 0

  // An answer records the card's result (from its record before this session's answer, so
  // changing an answer replaces it). It never schedules anything: it shapes which stages Mila
  // brings in and how often the card comes round.
  // Returns how many cards it brought in behind this one.
  // A fill in the blank is logged as a choice: what it tested (the word, or its form), the options
  // shown and the one chosen, and no side first, since it is neither recalled from the Hebrew nor
  // said from the English.
  const answer = (knew: boolean, felt = false, chosen?: string) => {
    if (!felt) feel(knew ? 'gotIt' : 'graded')
    void noteStudyDay()
    // Only a card's first answer here counts toward the tree; changing it on going back doesn't.
    if (answered === undefined) noteActivity('cards')
    const start = before[position] ?? record
    // Primed when its word was just shown (lib/forms.ts isPrimed): settled on the first answer.
    const now = Date.now()
    const shown = shownAt.current[position]
    const primed = primedAt.current[position] ?? isPrimed({ sequence: card.sequence, cardsAgo: shown?.wordCardsAgo, msAgo: shown?.wordMsAgo, lastAnswered: lastStudied(entry) }, now)
    primedAt.current[position] = primed
    study.current?.log('answer', {
      ...cardFields(card, entry, position, roundStart), knew, primed, revised: answered !== undefined, quiz: !!choices,
      exercise: choices ? 'choice' : 'card', front: choices ? null : englishFirst ? 'en' : 'he',
      ...(choices ? { tests: !form || form.stage === 'meanings' ? 'word' : 'form', options: choices, chosen: chosen ?? null, answer: quiz!.answer } : {}),
      ...presented(shownAs),
      ms: shown ? now - shown.at : null, turnedOver: revealed.current.has(position),
      // On a card shown in English: the Hebrew words given for English words held (by place).
      ...(englishFirst && !choices ? { asked: asked[position] ?? [] } : {}),
    })
    // A choice is kept as not unaided, like a primed answer (lib/forms.ts ProgressRules): choosing
    // right can't make a card familiar alone. The event keeps whether it was primed as such.
    const result = assess(start, knew, now, primed || !!choices)
    // A sentence card also keeps which of its sentences this was answered on.
    const recorded = form ? onSentence(start, result, shownAs?.variant ?? 0) : result
    const [body, updated]: [Record<string, unknown>, VocabEntry] = checkpoint
      ? [{ id: entry.id, checkpoint: { stage: checkpoint, ...result } }, { ...entry, checkpoints: { ...entry.checkpoints, [checkpoint]: result } }]
      : form
        ? [{ id: entry.id, form: { key: form.key, ...recorded } }, { ...entry, forms: (entry.forms || []).map(item => (item.key === form.key ? { ...item, ...recorded } : item)) }]
        : [{ id: entry.id, ...result }, { ...entry, ...result }]
    // Kept on the phone until the server has it (lib/results.ts); the round doesn't wait.
    saveResult(session.user.id, session.token, body as ResultBody)
    const opened = recommendedStages(entry).map(item => item.key)
    setWords(current => ({ ...current, [entry.id]: updated })); putEntry(session, updated)
    // A stage Mila now brings in: have its cards written for next time, and note it for the
    // summary unless every word starts with it (a verb's present comes in once it is met).
    const fresh = recommendedStages(updated).filter(item => !opened.includes(item.key))
    if (fresh.length) {
      const starting = startingStages(entry).map(item => item.key)
      const news = fresh.filter(item => !starting.includes(item.key))
      if (news.length) {
        setUnlocked(current => [...current, ...news.map(item => `${v(entry.lemma)}: ${item.label}`)])
        setTimeout(() => feel('unlock'), 250)
      }
      void ensureForms(updated, session.token).then(ready => { share(session, ready); keep(ready) })
    }
    // The round in front of the learner isn't reordered by an answer, except that in smart order a
    // word still being learned brings its next cards in right behind it (lib/forms.ts followUps),
    // taking them from later in the round. Only on a card's first answer at the end of what has
    // been answered: answers are kept by position, so nothing answered moves.
    let added = 0
    if (answered === undefined && settings.order === 'smart' && !Object.keys(answers).some(at => Number(at) > position)) {
      // This round as answered, with this card as it was just before the answer (the deck's copy may be older).
      const asAnswered = deck.slice(roundStart).map((item, at) => (at === position - roundStart ? { ...item, entry } : item))
      const more = followUps(asAnswered, position - roundStart, updated, knew, start, settings.include)
      const keys = new Set(more.map(cardKey))
      if (more.length) setDeck(current => current && [...current.slice(0, position + 1), ...more, ...current.slice(position + 1).filter(item => !keys.has(cardKey(item)))])
      added = more.length
    }
    setBefore(current => ({ ...current, [position]: start })); setAnswers(current => ({ ...current, [position]: knew }))
    return added
  }
  // A swipe answers the card and moves on: right, knew it; left, still learning. A quiz card is
  // answered by its choice, so a swipe only moves on.
  const swiped = (side: Side) => {
    if (choices || !answerable) return go(1)
    return go(1, true, answer(side === 'right'))
  }

  // A noun for a person with both forms is heard as both (מַזְכִּיר, מַזְכִּירָה).
  const listen = checkpoint ? undefined : form ? form.sentence : entry.feminine ? `${entry.lemma}, ${entry.feminine}` : entry.lemma
  // An English word held on this card's question side (holdWord).
  const holdHere = (index: number) => { if (form) void holdWord(card, entry, form, shownAs?.variant ?? 0, index) }
  const letGo = () => setHolding(null)
  const flipHere = () => { if (tapped()) { feel('reveal'); turnOver() } }
  const side = (english: boolean, answerSide: boolean) => <ScriptContext.Provider value={answerSide ? 'answers' : 'print'}>
    {form
      ? <SentenceSide entry={entry} form={form} english={english} answer={answerSide} position={position} front={englishFirst ? 'en' : 'he'} hideMark={!!choices && picked === null} v={answerSide ? vAnswer : vQuestion} lookup={answerSide ? lookup : undefined}
        hint={!flipped ? wordHint[position] : undefined} holding={holding} holdable={english && !answerSide && !choices} onHold={holdHere} onLetGo={letGo} onTap={flipHere} />
      : <WordSide entry={entry} english={english} answer={answerSide} v={answerSide ? vAnswer : vQuestion} />}
  </ScriptContext.Provider>
  const hint = checkpoint
    ? (!answerable ? (loaded && 'error' in loaded ? 'The forms could not be loaded, so swipe to skip this one.' : '')
      : flipped ? 'Swipe right if you knew them all, left if not.' : 'Say them to yourself, then tap to check.')
    : choices ? (picked !== null ? (pausing && !lookup.tap ? (right ? '' : 'Tap the card to stay on it.') : 'Answered. Swipe or → to go on.') : testsForm ? 'Choose the form that fits.' : 'Choose the word that fits.')
      : answered !== undefined ? `${answered ? 'You knew it' : 'Still learning'}. Swipe again to change.`
        : !flipped && holdTip && englishFirst && !!form ? 'Hold any word for its Hebrew. Tap to turn the card over.'
          : Object.keys(answers).length < 3 ? 'Swipe right if you knew it, left if you\'re still learning.' : ''

  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    {title}
    <TopBar summary={summary} progress={progress} canGoBack={position > roundStart} onBack={() => go(-1)} onNext={() => go(1)} onDone={stopStudying} onNewRound={confirmNewRound} onWhy={toggleWhy} onSettings={() => { stopAdvancing(); setSettingsOpen(true) }} />
    <ScrollView contentContainerStyle={[styles.content, { flexGrow: 1, gap: 16, justifyContent: 'center', paddingBottom: 24 + insets.bottom }]}>
      <ErrorNotice message={error} />
      {why && !!card.why && <Text style={practice.why}>{card.why}</Text>}
      {/* A card in a learning sequence says so: the same word again, just after the card before. */}
      {card.sequence && !why && <Text style={[practice.eyebrow, { textAlign: 'center' }]}>{form ? 'Same word · in a sentence' : 'Same word · once more'}</Text>}
      {/* A new sentence written for this round: the word is one being learned, the sentence new. */}
      {card.mode === 'fresh' && !card.sequence && !why && <Text style={[practice.eyebrow, { textAlign: 'center' }]}>New sentence · a word you’re learning</Text>}
      {/* A sentence the card hasn't been answered on, chosen in an ordinary round. */}
      {!card.mode && !card.sequence && !why && !!shownAs?.sentence && shownAs.variant > 0 && shownAs.sentence.fresh && <Text style={[practice.eyebrow, { textAlign: 'center' }]}>New sentence</Text>}
      {/* One swipe card for the whole deck; only what is on it changes (see SwipeCard). No exit
          animation: a swiped card has already left. */}
      <SwipeCard card={position} onSwipe={swiped} onDrag={onDrag} hints={choices || !answerable ? undefined : HINTS}>
        <Animated.View key={position} entering={way === 'next' ? CARD_IN : CARD_BACK_IN}>
          {checkpoint
            ? <FlipCard flipped={flipped} onPress={() => { if (tapped()) { feel('reveal'); turnOver() } }} style={[styles.card, practice.card]}
              accessibilityLabel={flipped ? 'Answer side' : 'Question side'}
              front={<ScriptContext.Provider value="print"><CheckpointSide entry={entry} stage={checkpoint} rows={rows} loading={!loaded} answer={false} v={vQuestion} /></ScriptContext.Provider>}
              back={<ScriptContext.Provider value="answers"><CheckpointSide entry={entry} stage={checkpoint} rows={rows} loading={!loaded} answer v={vAnswer} /></ScriptContext.Provider>} />
            : choices
              ? <Pressable accessible={false} onPress={() => { if (advancing.current) stopAdvancing() }} style={[styles.card, practice.card]}>
                <ScriptContext.Provider value="print"><CardHead label={stage?.label} lemma={testsForm || picked !== null ? vQuestion(entry.lemma) : undefined} listen={picked !== null ? listen : undefined} /></ScriptContext.Provider>
                {side(!form && englishFirst, picked !== null)}
                <ScriptContext.Provider value="print"><Choices choices={choices} answer={quiz!.answer} picked={picked} v={vQuestion} onPick={option => {
                  // Once only: a quick second tap, or a blank answered before, records nothing more.
                  if (!tapped() || picked !== null || advancing.current) return
                  const isRight = bare(option) === bare(quiz!.answer)
                  setPicks(current => ({ ...current, [position]: option })); feel(isRight ? 'right' : 'wrong')
                  const added = answer(isRight, true, option)
                  setPausing(true)
                  advancing.current = setTimeout(() => { advancing.current = null; setPausing(false); go(1, true, added) }, isRight ? RIGHT_PAUSE : wrongPause(form))
                }} /></ScriptContext.Provider>
                {picked !== null && <Text style={[practice.verdict, { color: right ? colors.green : colors.red }]}>{right ? 'Right' : 'Not quite'}</Text>}
              </Pressable>
              : <FlipCard flipped={flipped} onPress={() => { if (tapped()) { feel('reveal'); turnOver() } }} style={[styles.card, practice.card]}
                accessibilityLabel={flipped ? 'Answer side' : 'Question side'}
                front={<>
                  <CardHead label={form ? stage?.label : 'Word'} />
                  {side(englishFirst, false)}
                </>}
                back={<>
                  <ScriptContext.Provider value="answers"><CardHead label={form ? stage?.label : 'Word'} lemma={form ? vAnswer(bothForms(entry)) : undefined} listen={listen} /></ScriptContext.Provider>
                  {side(englishFirst, true)}
                </>} />}
        </Animated.View>
      </SwipeCard>
      {/* Room for the line is kept while there is none, so the card doesn't move when it appears. */}
      <Text style={[practice.hint, { minHeight: 22 }]}>{hint}</Text>
    </ScrollView>
    <WordDrawer lookup={lookup} v={v} style={{ paddingBottom: 12 + insets.bottom }} />
    {sheet}
  </View>
}

// What a drag says on each side of the card.
const practiceHint = StyleSheet.create({
  tag: { fontSize: 14, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', borderWidth: 1.5 },
  knew: { color: colors.green, borderColor: colors.green, backgroundColor: colors.lime },
  learning: { color: colors.muted, borderColor: colors.line, backgroundColor: colors.white },
})
const HINTS: Record<Side, ReactNode> = {
  right: <Text style={[practiceHint.tag, practiceHint.knew]}>Knew it</Text>,
  left: <Text style={[practiceHint.tag, practiceHint.learning]}>Still learning</Text>,
}

// Done, the arrows and where the round is, a new round and the settings button; below, the
// settings in force in one quiet line, which opens them too (SettingsSheet).
function TopBar({ summary, progress, canGoBack, onBack, onNext, onDone, onNewRound, onWhy, onSettings }: {
  summary: string; progress: { at: number; of: number } | null; canGoBack: boolean; onBack: () => void; onNext: () => void; onDone: () => void
  onNewRound: () => void; onWhy?: () => void; onSettings: () => void
}) {
  return <View style={practice.top}>
    <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
      <Pressable accessibilityRole="button" onPress={onDone} hitSlop={10}><Text style={practice.done}>Done</Text></Pressable>
      <View style={[styles.row, { gap: 4, flexWrap: 'nowrap' }]}>
        <Arrow icon="chevron-back" label="Previous card" disabled={!canGoBack} onPress={onBack} />
        <Text style={practice.progress} onLongPress={onWhy} accessibilityLabel={progress ? `Card ${progress.at} of ${progress.of}` : undefined}>{progress ? `${progress.at} / ${progress.of}` : ''}</Text>
        <Arrow icon="chevron-forward" label="Next card" onPress={onNext} />
        <Pressy moment="tick" accessibilityRole="button" accessibilityLabel="Start a new round" onPress={onNewRound} style={practice.arrow}>
          <Ionicons name="refresh-outline" size={22} color={colors.ink} />
        </Pressy>
        <Pressy moment="tick" accessibilityRole="button" accessibilityLabel={`Study settings: ${summary}`} onPress={onSettings} style={practice.arrow}>
          <Ionicons name="options-outline" size={22} color={colors.ink} />
        </Pressy>
      </View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Study settings: ${summary}`} onPress={onSettings} hitSlop={6}>
      <Text style={practice.summary} numberOfLines={1}>{summary}</Text>
    </Pressable>
  </View>
}

// The settings, grouped: what is studied and how (Study) and how answers look (Display). Each
// shows its choices with the one in force selected; changes apply as they do from the top bar
// (the order and which cards from the next card, which side first at once). A new round is
// started from the top bar.
function SettingsSheet({ settings, change, cursive, onCursive, onClose, onFresh }: {
  settings: Settings; change: (patch: Partial<Settings>) => void; cursive: boolean; onCursive: () => void; onClose: () => void; onFresh: () => void
}) {
  const insets = useSafeAreaInsets()
  return <View style={StyleSheet.absoluteFill}>
    <Animated.View entering={APPEAR} exiting={DISAPPEAR} style={[StyleSheet.absoluteFill, practice.scrim]}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close settings" onPress={onClose} />
    </Animated.View>
    <DraggableSheet onDismiss={onClose} accessibilityViewIsModal style={[practice.sheet, { paddingBottom: insets.bottom + 18 }]}
      handle={<View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={practice.sheetTitle}>Settings</Text>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10}><Text style={practice.done}>Done</Text></Pressable>
      </View>}>
      <Text style={practice.group}>Study</Text>
      <Choice label="Show first" options={SHOW_FIRST} value={settings.front} onChange={front => change({ front })} />
      <Choice label="Order" options={ORDERS} value={settings.order} onChange={order => change({ order })} />
      <Choice label="Cards" options={INCLUDES} value={settings.include} onChange={include => change({ include })} />
      <Choice label="Fill in the blank" options={CHOICES} value={settings.choices} onChange={choices => change({ choices })} />
      <Text style={practice.settingDetail}>A sentence you’ve studied, with its word left out, and four to choose from</Text>
      <Text style={practice.group}>Try</Text>
      <Pressy moment="press" accessibilityRole="button" onPress={onFresh} style={practice.tryRow}>
        <Ionicons name="sparkles-outline" size={20} color={colors.green} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={practice.settingLabel}>New sentences <Text style={practice.experimental}>· Experimental</Text></Text>
          <Text style={practice.settingDetail}>Mila writes sentences you haven’t seen for up to six words you’re learning, using the words you know and those you’ve looked up lately. Your answers count as usual, and the new sentences come back in ordinary Study.</Text>
        </View>
      </Pressy>
      <Choice label="Plan rounds by" options={PLANNERS} value={settings.planner} onChange={planner => change({ planner })} />
      <Text style={practice.settingDetail}>Experimental. Unified picks each round’s words by what practising them now would add to what you remember a month on, times how useful they are, across reviews, words met lately and new words, instead of Study’s fixed parts. The cards and how they’re asked are as usual. Learning Insights → Upcoming shows why.</Text>
      <Text style={practice.group}>Display</Text>
      <Toggle label="Answers in כתב יד" detail="Cursive on the answer side; questions stay in print" value={cursive} onChange={onCursive} />
    </DraggableSheet>
  </View>
}

// One setting with a few choices, side by side, the one in force filled.
function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: Record<T, string>; value: T; onChange: (value: T) => void }) {
  return <View style={{ gap: 6 }}>
    <Text style={practice.settingLabel}>{label}</Text>
    <View style={practice.segments} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {(Object.keys(options) as T[]).map(key => <Pressy key={key} moment="tick" depth={0.96} accessibilityRole="radio" accessibilityState={{ checked: key === value }}
        onPress={() => { if (key !== value) onChange(key) }} style={[practice.segment, key === value && practice.segmentOn]}>
        <Text style={[practice.segmentText, key === value && practice.segmentTextOn]} numberOfLines={1} adjustsFontSizeToFit>{options[key]}</Text>
      </Pressy>)}
    </View>
  </View>
}

function Toggle({ label, detail, value, onChange }: { label: string; detail: string; value: boolean; onChange: () => void }) {
  return <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap', gap: 12 }]}>
    <View style={{ flex: 1, gap: 1 }}>
      <Text style={practice.settingLabel}>{label}</Text>
      <Text style={practice.settingDetail}>{detail}</Text>
    </View>
    <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.green }} accessibilityLabel={label} />
  </View>
}

function Arrow({ icon, label, disabled, onPress }: { icon: 'chevron-back' | 'chevron-forward'; label: string; disabled?: boolean; onPress: () => void }) {
  return <Pressy moment={null} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[practice.arrow, disabled && { opacity: 0.3 }]}>
    <Ionicons name={icon} size={22} color={colors.ink} />
  </Pressy>
}

function CardHead({ label, lemma, listen }: { label?: string; lemma?: string; listen?: string }) {
  const he = useHebrew()
  return <View style={[styles.row, { justifyContent: 'space-between', alignSelf: 'stretch', flexWrap: 'nowrap', minHeight: 28 }]}>
    <Text style={practice.stage}>{label}{lemma ? <> · <Text style={[practice.lemma, he]}>{lemma}</Text></> : null}</Text>
    {!!listen && <ListenButton text={listen} accessibilityLabel="Listen" size={24} />}
  </View>
}

// A word on its own: its dictionary form one side, its meanings the other; the answer side
// shows both, with its part of speech, root and binyan, and for an expression whose words don't
// plainly add up to its meaning, what it says word for word. The constructions it is used in are
// chips under it wherever it is shown in Hebrew (components/Constructions.tsx).
function WordSide({ entry, english, answer: answerSide, v }: { entry: VocabEntry; english: boolean; answer: boolean; v: (text: string) => string }) {
  const he = useHebrew()
  const constructions = constructionsOf(entry)
  const lemma = <Text style={[practice.word, he]}>{v(bothForms(entry))}</Text>
  // Its constructions under it as chips, and on the answer side what it means in each, when it
  // has more than one (with one, that is the meaning shown).
  const hebrew = !constructions.length ? lemma : <View style={{ gap: 6, alignItems: 'center', alignSelf: 'stretch' }}>
    {lemma}
    <Constructions items={constructions} v={v} meanings={answerSide && constructions.length > 1} />
  </View>
  const meaning = <Text style={practice.meaning}>{entry.gloss}</Text>
  if (!answerSide) return english ? meaning : hebrew
  const grammar = [kindLabel(entry), entry.binyan, entry.root && `root ${entry.root}`].filter(Boolean).join(' · ')
  return <View style={{ gap: 8, alignItems: 'center', alignSelf: 'stretch' }}>
    {english ? <>{meaning}{hebrew}</> : <>{hebrew}{meaning}</>}
    {!!grammar && <Text style={practice.detail}>{grammar}</Text>}
    {!!entry.literal && <Text style={[practice.detail, { fontStyle: 'italic', textAlign: 'center' }]}>Literally “{entry.literal}”</Text>}
  </View>
}

// What the target word sounds like on its own, as it is in the sentence (עוברים, not לעבור):
// written with the card, else the form itself; a meanings card's form is the dictionary form,
// so then the word as written in the sentence.
const heardOf = (form: FormCard) => form.said || (form.stage === 'meanings' ? form.mark : form.he)

// One form in its sentence: the Hebrew sentence with the form marked, or its English with the
// meaning marked. The answer side shows the Hebrew sentence, what the form means (with the form
// alone to listen to), the form with the constructions the word is used in, and the translation.
// On the answer side each word of the sentence can be tapped to look it up (`lookup`); the
// question side is only turned over by a tap, so a lookup never gives the answer away.
// On a question side shown in English, each English word but the card's own can be held for the
// Hebrew that says it (`onHold`, lib/english-help.ts), shown on one quiet line under the sentence
// (`hint`), and a tap still turns the card over. The word held is marked only while held.
function SentenceSide({ entry, form, english, answer: answerSide, position, front, hideMark, v, lookup, hint, holding, holdable, onHold, onLetGo, onTap }: {
  entry: VocabEntry; form: FormCard; english: boolean; answer: boolean; position: number; front: 'en' | 'he'; hideMark: boolean; v: (text: string) => string; lookup?: WordLookup
  hint?: { text: string | null; note?: boolean }; holding: number | null; holdable: boolean; onHold: (index: number) => void; onLetGo: () => void; onTap: () => void
}) {
  const he = useHebrew()
  // A word tapped at its place among the sentence's words (`at`): what the card says it means
  // there, shown at once (the card's own word is its English), or for a card written without
  // glosses, the sentence's quick meanings; the full explanation only on More or Save.
  const onWord = lookup && ((word: string, at: number, own: boolean) => {
    feel('select')
    const gloss = own ? { en: form.en, lemma: entry.lemmaPlain || entry.lemma } : form.glosses?.find(item => item.i === at)
    const words = form.sentence.split(/\s+/).filter(Boolean).map(bareWord)
    void lookup.open({ text: word, sentence: form.sentence, translation: form.translation, card: { meaning: gloss?.en, lemma: gloss?.lemma || undefined, words, at }, context: { key: `${entry.id}:${form.key}`, own, position, side: answerSide ? 'back' : 'front', front } })
  })
  const looked = lookup?.tap?.sentence === form.sentence ? lookup.tap.card?.at : undefined
  const hebrew = <Text style={[practice.sentence, he]}><MarkedHebrew sentence={v(form.sentence)} mark={form.mark} form={form.he} blank={hideMark} onWord={onWord} looked={looked} /></Text>
  if (!answerSide) return <>
    {english ? <Text style={practice.english}><Marked text={cuedTranslation(form)} mark={form.enMark} holdable={holdable} holding={holding} onHold={onHold} onLetGo={onLetGo} onTap={onTap} /></Text> : hebrew}
    {english && holdable && !!hint && <Text style={[practice.hintLine, !hint.note && !!hint.text && [practice.hintHebrew, he]]} accessibilityLiveRegion="polite">
      {hint.text === null ? '…' : hint.note ? hint.text : v(hint.text)}
    </Text>}
    {/* Fill in the blank: what the whole sentence says, so the choice is the Hebrew that says it
        here. Its English is kept for a word too: with it left out, a related distractor can fit
        the sentence as well (ללטף, לנשק: "began to ___ her hand"), and the question is unfair. */}
    {hideMark && <Text style={practice.hint}><Marked text={cuedTranslation(form)} mark={form.enMark} /></Text>}
  </>
  const heard = heardOf(form)
  return <View style={{ gap: 8, alignSelf: 'stretch' }}>
    {hebrew}
    <View style={[styles.row, { justifyContent: 'center', gap: 6, flexWrap: 'nowrap' }]}>
      <Text style={[practice.meaning, { flexShrink: 1 }]}>{form.en}</Text>
      {!!heard && <ListenButton text={heard} accessibilityLabel="Listen to the word" size={22} speed={false} />}
    </View>
    <Text style={[practice.detail, { textAlign: 'center' }]}>{v(form.he)}</Text>
    <Constructions items={constructionsOf(entry)} v={v} size={14} />
    {!!form.translation && <Text style={practice.detail}>{form.translation}</Text>}
  </View>
}

// The sentence with the form marked (every word of an expression, even where others come
// between, lib/marks.ts), or blanked for a quiz (an attached prefix such as ו or ש stays).
// With `onWord`, a tap on a word looks it up (as written, without its punctuation, with its place
// among the sentence's words and whether it is the card's own), and the word looked up (by its
// place, `looked`, so only that one of a word written twice) is shown as selected.
function MarkedHebrew({ sentence, mark, form, blank, onWord, looked }: {
  sentence: string; mark: string; form: string; blank: boolean; onWord?: (word: string, at: number, own: boolean) => void; looked?: number
}) {
  const formWords = form.split(/\s+/)
  let k = 0
  let at = -1
  return <>{hebrewPieces(sentence, mark).map((piece, i) => {
    const word = bareWord(piece.text)
    if (piece.text && !/^\s+$/.test(piece.text)) at++
    const place = at
    const tap = onWord && word ? { onPress: () => onWord(word, place, piece.marked), suppressHighlighting: true } : {}
    const selected = !!word && looked === place && practice.looked
    if (!piece.marked) return <Text key={i} {...tap} style={selected}>{piece.text}</Text>
    const own = formWords[k++] ?? ''
    if (blank) return <Text key={i}>{prefixOf(piece.text, own)}<Text style={practice.blank}>{BLANK}</Text></Text>
    return <Text key={i} {...tap} style={[practice.mark, selected]}>{piece.text}</Text>
  })}</>
}

// English text with the card's words marked (case-insensitive, in order, possibly apart);
// unmarked if they aren't found. Each word is marked on its own and the spaces between are not:
// iOS draws a marked run that wraps onto the next line of centred text from that line's edge,
// far wider than the words, so no marked run may contain a place where the line can break.
// `holdable`: each word but the marked ones can be held (onHold, with its index among the text's
// words) and tapped (onTap, as the card itself would be).
function Marked({ text, mark, holdable, holding, onHold, onLetGo, onTap }: {
  text: string; mark?: string; holdable?: boolean; holding?: number | null; onHold?: (index: number) => void; onLetGo?: () => void; onTap?: () => void
}) {
  let index = -1
  return <>{englishPieces(text, mark).map((piece, i) => {
    if (piece.text && !/^\s+$/.test(piece.text)) index++
    const at = index
    if (piece.marked) return <Text key={i} style={practice.mark}>{piece.text}</Text>
    // Only words: a person cue (👩) or a dash is part of the English, not a word to hold.
    if (!holdable || !onHold || !/\p{L}/u.test(piece.text)) return piece.text
    return <Text key={i} onPress={onTap} onLongPress={() => onHold(at)} onPressOut={onLetGo} suppressHighlighting style={holding === at ? practice.holding : undefined}>{piece.text}</Text>
  })}</>
}

// A checkpoint: recall a whole tense (or an adjective's forms) at once. The question side gives
// the word, what it means and who each form is for; the answer side the forms from its table,
// each to listen to.
function CheckpointSide({ entry, stage, rows, loading, answer: answerSide, v }: {
  entry: VocabEntry; stage: string; rows: Table['groups'][number]['rows']; loading: boolean; answer: boolean; v: (text: string) => string
}) {
  const he = useHebrew()
  const label = stagesOf(entry).find(item => item.key === stage)?.label ?? stage
  const binyan = entry.binyan || entry.head?.binyan
  const slots = rows.length ? rows.map(row => row.label) : Object.values(stagesOf(entry).find(item => item.key === stage)?.slots ?? {})
  return <View style={{ gap: 10, alignSelf: 'stretch', alignItems: 'center' }}>
    <Text style={practice.eyebrow}>{kindOfEntry(entry) === 'verb' ? 'Conjugation checkpoint' : 'Forms checkpoint'}</Text>
    <Text style={practice.stage}>{label}{binyan ? ` · ${binyan}` : ''}</Text>
    <Text style={practice.meaning}>{firstSense(tableMeaning(entry))}</Text>
    <Text style={[practice.word, he]}>{v(entry.lemma)}</Text>
    {!answerSide && <Text style={practice.hint}>Recall the {label.toLowerCase()} forms</Text>}
    <View style={{ alignSelf: 'stretch', gap: 2 }}>
      {answerSide && loading && <ActivityIndicator color={colors.green} />}
      {(answerSide ? rows : slots.map(slot => ({ slot, label: slot, he: '', en: '' }))).map(row => <View key={row.slot} style={practice.checkRow}>
        <Text style={practice.checkLabel}>{row.label}</Text>
        {answerSide && <View style={[styles.row, { gap: 6, flexWrap: 'nowrap' }]}>
          <Text style={[practice.checkForm, he]}>{v(row.he)}</Text>
          <ListenButton text={row.he} accessibilityLabel={`Hear ${row.he}`} size={18} speed={false} />
        </View>}
      </View>)}
    </View>
  </View>
}

// Quiz mode: the blank is filled by choosing among the word's own forms.
function Choices({ choices, answer: correct, picked, v, onPick }: { choices: string[]; answer: string; picked: string | null; v: (text: string) => string; onPick: (option: string) => void }) {
  const he = useHebrew()
  return <View style={{ gap: 8, alignSelf: 'stretch' }}>
    {choices.map(option => {
      const isAnswer = bare(option) === bare(correct)
      const chosen = picked !== null && bare(option) === bare(picked)
      return <Shake key={option} on={chosen && !isAnswer}>
        <Pressy moment={null} accessibilityRole="button" disabled={picked !== null} onPress={() => onPick(option)}
          style={[practice.option, picked !== null && isAnswer && practice.optionRight, chosen && !isAnswer && practice.optionWrong]}>
          <Text style={[practice.optionText, he]}>{v(option)}</Text>
        </Pressy>
      </Shake>
    })}
  </View>
}

// Cards written in the background also join the shared saved words.
// What a study event says about its card (lib/study-log.ts).
const cardFields = (card: Card, entry: VocabEntry, position: number, roundStart: number) => ({
  position, round: roundStart, key: cardKey(card), wordId: entry.id, lemma: entry.lemmaPlain || entry.lemma,
  kind: card.checkpoint ? 'checkpoint' : card.form ? 'form' : 'word', form: card.form?.key, stage: card.checkpoint ?? card.form?.stage,
  why: card.why, sequence: !!card.sequence, ...(card.mode ? { mode: card.mode } : {}),
})
// New sentences written for a word's cards join its latest copy, its results as they are.
function withVariants(current: VocabEntry | undefined, ready: VocabEntry): VocabEntry {
  if (!current) return ready
  const byKey = new Map((ready.forms || []).map(form => [form.key, form]))
  return { ...current, forms: (current.forms || []).map(form => {
    const variants = byKey.get(form.key)?.variants
    return variants && variants.length > (form.variants?.length ?? 0) ? { ...form, variants } : form
  }) }
}
const share = (session: Session, ready: VocabEntry) => putEntry(session, withNewForms(cachedVocab(session)?.find(item => item.id === ready.id), ready))

// Cards written in the background join the latest copy of a word without undoing results
// recorded since the request started.
function withNewForms(current: VocabEntry | undefined, ready: VocabEntry): VocabEntry {
  if (!current) return ready
  const have = new Set((current.forms || []).map(form => form.key))
  const added: FormCard[] = (ready.forms || []).filter(form => !have.has(form.key))
  return added.length ? { ...current, forms: [...(current.forms || []), ...added] } : current
}

// The end of a round (or of studying): one calm line, any stage Mila brought in, another round
// if you like, and back to the tree, which shows the rest (lib/tree.ts). A card answered in two
// rounds counts twice, so cards can outnumber words.
function Summary({ title, fresh, answered, words, unlocked, error, onMore, onFresh }: {
  title: ReactNode; fresh: boolean; answered: number; words: number; unlocked: string[]; error: string | null; onMore: () => void; onFresh: () => void
}) {
  useEffect(() => { feel('complete') }, [])
  return <Page>
    {title}
    <Text style={styles.title}>{answered ? 'Done' : 'End of the round'}</Text>
    {answered > 0 && <Text style={styles.copy}>{answered} {answered === 1 ? 'card' : 'cards'} from {words} {words === 1 ? 'word' : 'words'}. The tree is tended.</Text>}
    {fresh && <Text style={styles.copy}>The new sentences stay with their cards and come round in ordinary Study, taking turns with the sentences you had.</Text>}
    {unlocked.map(line => <View key={line} style={practice.unlocked}>
      <Ionicons name="sparkles-outline" size={18} color={colors.green} /><Text style={[styles.copy, { color: colors.ink, flexShrink: 1 }]}>New for you: {line}</Text>
    </View>)}
    <ErrorNotice message={error} />
    <Button title="Back to your tree" onPress={() => router.dismissTo('/')} />
    <Button secondary title="Another round" onPress={onMore} />
    <Button secondary title="New sentences round" onPress={onFresh} />
  </Page>
}


const practice = StyleSheet.create({
  top: { gap: 4, paddingHorizontal: 22, paddingTop: 12 },
  summary: { fontSize: 13, color: colors.muted },
  scrim: { backgroundColor: '#2A252038' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 10, paddingHorizontal: 22, gap: 14, backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  group: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5, color: colors.muted, textTransform: 'uppercase', marginTop: 6 },
  settingLabel: { fontSize: 16, fontWeight: '600', color: colors.ink },
  settingDetail: { fontSize: 13, lineHeight: 18, color: colors.muted },
  segments: { flexDirection: 'row', padding: 3, gap: 3, borderRadius: 12, backgroundColor: colors.line },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 38, paddingHorizontal: 6, borderRadius: 9 },
  segmentOn: { backgroundColor: colors.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  segmentTextOn: { color: colors.green },
  done: { fontSize: 16, fontWeight: '600', color: colors.green },
  progress: { fontSize: 14, color: colors.muted, minWidth: 52, textAlign: 'center', fontVariant: ['tabular-nums'] },
  why: { fontSize: 12, color: colors.muted, textAlign: 'center', fontVariant: ['tabular-nums'] },
  arrow: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  unlocked: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.lime },
  experimental: { fontSize: 13, fontWeight: '600', color: colors.muted },
  tryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  card: { alignItems: 'center', gap: 14, paddingVertical: 18, minHeight: 240, justifyContent: 'center' },
  stage: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5, color: colors.green, textTransform: 'uppercase' },
  lemma: { fontSize: 15, color: colors.ink },
  word: { fontSize: 34, lineHeight: 48, color: colors.ink, writingDirection: 'rtl', textAlign: 'center' },
  sentence: { fontSize: 22, lineHeight: 36, color: colors.ink, writingDirection: 'rtl', textAlign: 'center' },
  mark: { backgroundColor: colors.lime, fontWeight: '600' },
  english: { fontSize: 20, lineHeight: 30, color: colors.ink, textAlign: 'center' },
  blank: { color: colors.green, fontWeight: '700' },
  // A word of the sentence looked up on the answer side.
  looked: { color: colors.green, textDecorationLine: 'underline', textDecorationColor: colors.green },
  // A word of an English card while it is held for its Hebrew, as the card's own is marked.
  holding: { backgroundColor: colors.lime },
  // The Hebrew for the word held: a quiet line under the sentence, as the card's other lines are.
  hintLine: { fontSize: 15, lineHeight: 28, color: colors.muted, textAlign: 'center', minHeight: 28 },
  hintHebrew: { fontSize: 21, color: colors.ink },
  hint: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  option: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  optionRight: { borderColor: colors.green, backgroundColor: colors.lime },
  optionWrong: { borderColor: colors.red, backgroundColor: '#FBE7E6' },
  optionText: { fontSize: 22, color: colors.ink, writingDirection: 'rtl' },
  verdict: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  meaning: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  detail: { fontSize: 15, lineHeight: 22, color: colors.muted, writingDirection: 'ltr', textAlign: 'left' },
  checkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  checkLabel: { fontSize: 15, color: colors.muted },
  checkForm: { fontSize: 22, color: colors.ink, writingDirection: 'rtl' },
})

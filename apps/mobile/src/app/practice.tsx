import { type ReactNode, useEffect, useRef, useState } from 'react'
import Animated from 'react-native-reanimated'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { stop as stopSpeaking } from '../lib/speech'
import { ListenButton } from '../components/Listen'
import { Button, colors, ErrorNotice, Loading, Page, Pill, Pressy, styles } from '../components/ui'
import { FlipCard, Shake, type Side, SwipeCard } from '../components/Motion'
import { CARD_BACK_IN, CARD_IN } from '../lib/motion'
import { feel } from '../lib/feedback'
import { request } from '../lib/api'
import { type Table, tableMeaning } from '../lib/explore'
import { tableFor } from '../lib/explore-requests'
import { assess, type Card, cardKey, checkpointGroup, checkpointsOf, deckOf, firstSense, type Include, kindLabel, kindOfEntry, missingStages, type Order, quizOf, recommendedStages, stagesOf } from '../lib/forms'
import { englishPieces, hebrewPieces, prefixOf } from '../lib/marks'
import { bareWord, stripNiqqud } from '../lib/ocr-cleanup'
import { type Front, getPref, noteStudyDay, setPref } from '../lib/prefs'
import { noteActivity } from '../lib/tree'
import type { FormCard, Results, Session, VocabEntry } from '../lib/types'
import { withVowels } from '../lib/vowels'
import { ensureForms } from '../lib/word-forms'
import { useSession } from '../state/session'
import { cachedVocab, putEntry, vocabFor } from '../state/vocab'
import { useVowels } from '../state/vowels'

const bare = (text: string) => stripNiqqud(bareWord(text))
type Settings = { front: Front; order: Order; include: Include; quiz: boolean }
const FRONTS: Record<Front, string> = { he: 'Hebrew first', en: 'English first', mixed: 'Mixed' }
const INCLUDES: Record<Include, string> = { both: 'Words & sentences', words: 'Words', sentences: 'Sentences' }
const next = <T extends string>(options: Record<T, string>, value: T) => { const keys = Object.keys(options) as T[]; return keys[(keys.indexOf(value) + 1) % keys.length] }
// A word's table of forms for its checkpoints, or why it couldn't be had.
type Loaded = Table | { error: string }

// The one place to study. A round of cards (lib/forms.ts deckOf): saved words, their forms in
// sentences, and checkpoints on a whole tense. Tap a card to turn it over; swipe it right if you
// knew it, left if you're still learning (the arrows move on or back without answering). What
// is answered only shapes what Mila brings in next and what comes round more: nothing is ever
// due. A round ends calmly and can go round again for as long as you like; Done stops. Hebrew or
// English first, smart or shuffled order, which cards and quiz mode are chosen on the screen and
// remembered. New stages' cards are written in the background.
export default function Practice() {
  const { session } = useSession()
  const insets = useSafeAreaInsets()
  const [showVowels] = useVowels()
  const v = (text: string) => withVowels(text, showVowels)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [deck, setDeck] = useState<Card[] | null>(null)
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
  const [error, setError] = useState<string | null>(null)
  const [tables, setTables] = useState<Record<string, Loaded>>({})
  // The latest copy of each word, so results and new stages build on each other within a session.
  const [words, setWords] = useState<Record<string, VocabEntry>>({})
  // A drag in progress, or when the last one ended: the release of a swipe is not a tap.
  const drag = useRef<{ on: boolean; ended: number }>({ on: false, ended: 0 })
  const tapped = () => !drag.current.on && Date.now() - drag.current.ended > 300
  const onDrag = (dragging: boolean) => { drag.current = { on: dragging, ended: dragging ? drag.current.ended : Date.now() } }
  const keep = (ready: VocabEntry) => setWords(current => ({ ...current, [ready.id]: withNewForms(current[ready.id], ready) }))

  useEffect(() => {
    if (!session) return
    let current = true
    void (async () => {
      try {
        const [front, order, include, quiz] = await Promise.all([getPref('studyFront'), getPref('studyOrder'), getPref('studyCards'), getPref('studyQuiz')])
        const chosen = { front, order, include, quiz }
        // The saved words already loaded if there are any, so studying opens at once.
        const entries = await vocabFor(session)
        if (!current) return
        setSettings(chosen)
        setWords(Object.fromEntries(entries.map(entry => [entry.id, entry])))
        // Words whose open stage has no cards yet get them written now. Studying starts with
        // what is ready; only if nothing is does it wait for them.
        const preparing = Promise.all(entries.map(entry => (missingStages(entry).length ? ensureForms(entry, session.token) : entry)))
        void preparing.then(ready => {
          ready.forEach(item => share(session, item))
          if (current) ready.forEach(keep)
        })
        let cards = deckOf(entries, chosen)
        if (!cards.length && entries.length) cards = deckOf(await preparing, chosen)
        if (current) setDeck(cards)
      } catch (failure) { if (current) setError((failure as Error).message) }
    })()
    return () => { current = false; stopSpeaking() }
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

  if (!session) return <Page><Text style={styles.copy}>Sign in to study your saved words.</Text></Page>
  if (!deck || !settings) return <Page>{error ? <ErrorNotice message={error} /> : <Loading />}</Page>
  if (!Object.keys(words).length) return <Page>
    <Text style={styles.title}>Nothing to study yet.</Text>
    <Text style={styles.copy}>Save words as you read and they will show up here.</Text>
    <Button title="Back" onPress={() => router.back()} />
  </Page>

  // Another round, from the latest copy of each word (its order reflects what was just studied).
  const newRound = () => {
    const again = deckOf(Object.values(words), settings, Date.now(), `${Date.now()}`)
    // Don't show the card just studied twice in a row.
    const last = deck[deck.length - 1]
    if (again.length > 1 && last && cardKey(again[0]) === cardKey(last)) again.push(again.shift()!)
    setRoundStart(deck.length); setDeck([...deck, ...again]); setPosition(deck.length)
    setWay('next'); setFlipped(false); setDone(false)
  }
  if (done) return <Summary answered={Object.keys(answers).length} words={new Set(Object.keys(answers).map(i => deck[Number(i)].entry.id)).size}
    unlocked={unlocked} error={error} onMore={newRound} />

  // Moving through the round. Past its end, the round is over. Every card comes back to its
  // question side, a quiz card to its choices; an answer it was given stays and is shown.
  // `quiet` when an answer already made its sound. False when there was nowhere to go.
  const go = (step: 1 | -1, quiet = false) => {
    const to = position + step
    if (to < roundStart) return false
    if (to >= deck.length) { setDone(true); return true }
    if (!quiet) feel('advance')
    setWay(step === 1 ? 'next' : 'previous'); setPosition(to); setFlipped(false)
    setPicks(current => { const { [to]: _gone, ...rest } = current; return rest })
    return true
  }
  const stopStudying = () => { stopSpeaking(); if (Object.keys(answers).length) setDone(true); else router.back() }

  // Settings apply from the next card on; which side shows first applies at once.
  const change = (patch: Partial<Settings>) => {
    const updated = { ...settings, ...patch }
    setSettings(updated)
    if (patch.front) setPref('studyFront', patch.front)
    if (patch.order) setPref('studyOrder', patch.order)
    if (patch.include) setPref('studyCards', patch.include)
    if (patch.quiz !== undefined) setPref('studyQuiz', patch.quiz)
    if (patch.order || patch.include) {
      const here = deck[position]
      const rest = deckOf(Object.values(words), updated, Date.now(), `${Date.now()}`).filter(card => !here || cardKey(card) !== cardKey(here))
      setDeck([...deck.slice(0, position + 1), ...rest])
    }
  }

  const card = deck[position]
  const progress = { at: position - roundStart + 1, of: deck.length - roundStart }
  if (!card) return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <TopBar settings={settings} change={change} progress={null} canGoBack={false} onBack={() => go(-1)} onNext={() => go(1)} onDone={stopStudying} />
    <View style={[styles.content, { gap: 12 }]}>
      <Text style={styles.copy}>{settings.include === 'sentences' ? 'No sentence cards yet. They are written for each word as you save it.' : 'Nothing to study with these settings.'}</Text>
      <Button title="Study words and sentences" onPress={() => change({ include: 'both' })} />
    </View>
  </View>

  const entry = words[card.entry.id] || card.entry
  const form = card.form ? entry.forms?.find(item => item.key === card.form!.key) || card.form : null
  const checkpoint = card.checkpoint ?? null
  const record: Results = checkpoint ? { results: checkpointsOf(entry, checkpoint), last: entry.checkpoints?.[checkpoint]?.last } : form || entry
  const stage = form ? stagesOf(entry).find(item => item.key === form.stage) : null
  const loaded = tables[entry.id]
  const rows = checkpoint && loaded && 'groups' in loaded ? loaded.groups.find(group => group.key === checkpointGroup(entry, checkpoint))?.rows ?? [] : []
  // Mixed: each card shows one side or the other first, settled per card and position.
  const front: 'he' | 'en' = settings.front === 'mixed' ? ([...`${cardKey(card)}${position}`].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2 ? 'en' : 'he') : settings.front
  const englishFirst = front === 'en' && (!form || !!form.translation)
  // Quiz mode: a word card shown in Hebrew asks for its meaning, shown in English for the word.
  // A checkpoint is always recalled and turned over.
  const quiz = settings.quiz && !checkpoint ? quizOf(Object.values(words), { entry, form }, !englishFirst, `${cardKey(card)}-${record.results?.length ?? 0}`) : null
  const choices = quiz?.options ?? null
  const picked = picks[position] ?? null
  const right = !!quiz && picked !== null && bare(picked) === bare(quiz.answer)
  const answered = answers[position]
  // A checkpoint can only be answered once its forms are there to check against.
  const answerable = !checkpoint || rows.length > 0

  // An answer records the card's result (from its record before this session's answer, so
  // changing an answer replaces it). It never schedules anything: it shapes which stages Mila
  // brings in and how often the card comes round.
  const answer = (knew: boolean, felt = false) => {
    if (!felt) feel(knew ? 'gotIt' : 'graded')
    void noteStudyDay()
    // Only a card's first answer here counts toward the tree; changing it on going back doesn't.
    if (answered === undefined) noteActivity('cards')
    const start = before[position] ?? record
    const result = assess(start, knew)
    const [body, updated]: [Record<string, unknown>, VocabEntry] = checkpoint
      ? [{ id: entry.id, checkpoint: { stage: checkpoint, ...result } }, { ...entry, checkpoints: { ...entry.checkpoints, [checkpoint]: result } }]
      : form
        ? [{ id: entry.id, form: { key: form.key, ...result } }, { ...entry, forms: (entry.forms || []).map(item => (item.key === form.key ? { ...item, ...result } : item)) }]
        : [{ id: entry.id, ...result }, { ...entry, ...result }]
    void request('vocab', { token: session.token, method: 'PATCH', body }).catch((failure: Error) => setError(`A result wasn't saved. ${failure.message}`))
    const opened = recommendedStages(entry).map(item => item.key)
    setWords(current => ({ ...current, [entry.id]: updated })); putEntry(session, updated)
    // A stage Mila now brings in: note it for the summary and have its cards written for next time.
    const fresh = recommendedStages(updated).filter(item => !opened.includes(item.key))
    if (fresh.length) {
      setUnlocked(current => [...current, ...fresh.map(item => `${v(entry.lemma)}: ${item.label}`)])
      setTimeout(() => feel('unlock'), 250)
      void ensureForms(updated, session.token).then(ready => { share(session, ready); keep(ready) })
    }
    // The round in front of the learner isn't reordered by an answer.
    setBefore(current => ({ ...current, [position]: start })); setAnswers(current => ({ ...current, [position]: knew }))
  }
  // A swipe answers the card and moves on: right, knew it; left, still learning. A quiz card is
  // answered by its choice, so a swipe only moves on.
  const swiped = (side: Side) => {
    if (choices || !answerable) return go(1)
    answer(side === 'right')
    return go(1, true)
  }

  const listen = checkpoint ? undefined : form ? form.sentence : entry.lemma
  const side = (english: boolean, answerSide: boolean) => form
    ? <SentenceSide form={form} english={english} answer={answerSide} hideMark={!!choices && picked === null} v={v} />
    : <WordSide entry={entry} english={english} answer={answerSide} v={v} />
  const hint = checkpoint
    ? (!answerable ? (loaded && 'error' in loaded ? 'The forms could not be loaded, so swipe to skip this one.' : '')
      : flipped ? 'Swipe right if you knew them all, left if not.' : 'Say them to yourself, then tap to check.')
    : choices ? (picked !== null ? 'Swipe to go on.' : '')
      : answered !== undefined ? `${answered ? 'You knew it' : 'Still learning'}. Swipe again to change.`
        : Object.keys(answers).length < 3 ? 'Swipe right if you knew it, left if you\'re still learning.' : ''

  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <TopBar settings={settings} change={change} progress={progress} canGoBack={position > roundStart} onBack={() => go(-1)} onNext={() => go(1)} onDone={stopStudying} />
    <ScrollView contentContainerStyle={[styles.content, { flexGrow: 1, gap: 16, justifyContent: 'center', paddingBottom: 24 + insets.bottom }]}>
      <ErrorNotice message={error} />
      {/* One swipe card for the whole deck; only what is on it changes (see SwipeCard). No exit
          animation: a swiped card has already left. */}
      <SwipeCard card={position} onSwipe={swiped} onDrag={onDrag} hints={choices || !answerable ? undefined : HINTS}>
        <Animated.View key={position} entering={way === 'next' ? CARD_IN : CARD_BACK_IN}>
          {checkpoint
            ? <FlipCard flipped={flipped} onPress={() => { if (tapped()) { feel('reveal'); setFlipped(value => !value) } }} style={[styles.card, practice.card]}
              accessibilityLabel={flipped ? 'Answer side' : 'Question side'}
              front={<CheckpointSide entry={entry} stage={checkpoint} rows={rows} loading={!loaded} answer={false} v={v} />}
              back={<CheckpointSide entry={entry} stage={checkpoint} rows={rows} loading={!loaded} answer v={v} />} />
            : choices
              ? <View style={[styles.card, practice.card]}>
                <CardHead label={stage?.label} lemma={v(entry.lemma)} listen={picked !== null ? listen : undefined} />
                {side(!form && englishFirst, picked !== null)}
                <Choices choices={choices} answer={quiz!.answer} picked={picked} v={v} onPick={option => {
                  if (!tapped()) return
                  const isRight = bare(option) === bare(quiz!.answer)
                  setPicks(current => ({ ...current, [position]: option })); feel(isRight ? 'right' : 'wrong')
                  answer(isRight, true)
                }} />
                {picked !== null && <Text style={[practice.verdict, { color: right ? colors.green : colors.red }]}>{right ? 'Right' : 'Not quite'}</Text>}
              </View>
              : <FlipCard flipped={flipped} onPress={() => { if (tapped()) { feel('reveal'); setFlipped(value => !value) } }} style={[styles.card, practice.card]}
                accessibilityLabel={flipped ? 'Answer side' : 'Question side'}
                front={<>
                  <CardHead label={form ? stage?.label : 'Word'} />
                  {side(englishFirst, false)}
                </>}
                back={<>
                  <CardHead label={form ? stage?.label : 'Word'} lemma={form ? v(entry.lemma) : undefined} listen={listen} />
                  {side(englishFirst, true)}
                </>} />}
        </Animated.View>
      </SwipeCard>
      {/* Room for the line is kept while there is none, so the card doesn't move when it appears. */}
      <Text style={[practice.hint, { minHeight: 22 }]}>{hint}</Text>
    </ScrollView>
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

// Done, the arrows and where the round is; below, the settings as chips.
function TopBar({ settings, change, progress, canGoBack, onBack, onNext, onDone }: {
  settings: Settings; change: (patch: Partial<Settings>) => void; progress: { at: number; of: number } | null; canGoBack: boolean; onBack: () => void; onNext: () => void; onDone: () => void
}) {
  return <View style={practice.top}>
    <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
      <Pressable accessibilityRole="button" onPress={onDone} hitSlop={10}><Text style={practice.done}>Done</Text></Pressable>
      <View style={[styles.row, { gap: 4, flexWrap: 'nowrap' }]}>
        <Arrow icon="chevron-back" label="Previous card" disabled={!canGoBack} onPress={onBack} />
        <Text style={practice.progress} accessibilityLabel={progress ? `Card ${progress.at} of ${progress.of}` : undefined}>{progress ? `${progress.at} / ${progress.of}` : ''}</Text>
        <Arrow icon="chevron-forward" label="Next card" onPress={onNext} />
      </View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -22, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 22 }}>
      <Pill label={FRONTS[settings.front]} icon="swap-horizontal" onPress={() => change({ front: next(FRONTS, settings.front) })} accessibilityLabel={`${FRONTS[settings.front]}. Change which side shows first`} />
      <Pill label={settings.order === 'shuffle' ? 'Shuffled' : 'Smart order'} icon="shuffle" active={settings.order === 'shuffle'} onPress={() => change({ order: settings.order === 'shuffle' ? 'smart' : 'shuffle' })} />
      <Pill label={INCLUDES[settings.include]} onPress={() => change({ include: next(INCLUDES, settings.include) })} accessibilityLabel={`${INCLUDES[settings.include]}. Change which cards`} />
      <Pill label="Quiz forms" active={settings.quiz} onPress={() => change({ quiz: !settings.quiz })} />
    </ScrollView>
  </View>
}

function Arrow({ icon, label, disabled, onPress }: { icon: 'chevron-back' | 'chevron-forward'; label: string; disabled?: boolean; onPress: () => void }) {
  return <Pressy moment={null} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[practice.arrow, disabled && { opacity: 0.3 }]}>
    <Ionicons name={icon} size={22} color={colors.ink} />
  </Pressy>
}

function CardHead({ label, lemma, listen }: { label?: string; lemma?: string; listen?: string }) {
  return <View style={[styles.row, { justifyContent: 'space-between', alignSelf: 'stretch', flexWrap: 'nowrap', minHeight: 28 }]}>
    <Text style={practice.stage}>{label}{lemma ? <> · <Text style={practice.lemma}>{lemma}</Text></> : null}</Text>
    {!!listen && <ListenButton text={listen} accessibilityLabel="Listen" size={24} />}
  </View>
}

// A word on its own: its dictionary form one side, its meanings the other; the answer side
// shows both, with its part of speech, root and binyan.
function WordSide({ entry, english, answer: answerSide, v }: { entry: VocabEntry; english: boolean; answer: boolean; v: (text: string) => string }) {
  const hebrew = <Text style={practice.word}>{v(entry.lemma)}</Text>
  const meaning = <Text style={practice.meaning}>{entry.gloss}</Text>
  if (!answerSide) return english ? meaning : hebrew
  const grammar = [kindLabel(entry), entry.binyan, entry.root && `root ${entry.root}`].filter(Boolean).join(' · ')
  return <View style={{ gap: 8, alignItems: 'center', alignSelf: 'stretch' }}>
    {english ? <>{meaning}{hebrew}</> : <>{hebrew}{meaning}</>}
    {!!grammar && <Text style={practice.detail}>{grammar}</Text>}
  </View>
}

// What the target word sounds like on its own, as it is in the sentence (עוברים, not לעבור):
// written with the card, else the form itself; a meanings card's form is the dictionary form,
// so then the word as written in the sentence.
const heardOf = (form: FormCard) => form.said || (form.stage === 'meanings' ? form.mark : form.he)

// One form in its sentence: the Hebrew sentence with the form marked, or its English with the
// meaning marked. The answer side shows the Hebrew sentence, what the form means (with the form
// alone to listen to), the form and the translation.
function SentenceSide({ form, english, answer: answerSide, hideMark, v }: { form: FormCard; english: boolean; answer: boolean; hideMark: boolean; v: (text: string) => string }) {
  const hebrew = <Text style={practice.sentence}><MarkedHebrew sentence={v(form.sentence)} mark={form.mark} form={form.he} blank={hideMark} /></Text>
  if (!answerSide) return <>
    {english ? <Text style={practice.english}><Marked text={form.translation} mark={form.enMark} /></Text> : hebrew}
    {hideMark && <Text style={practice.hint}>{form.en}</Text>}
  </>
  const heard = heardOf(form)
  return <View style={{ gap: 8, alignSelf: 'stretch' }}>
    {hebrew}
    <View style={[styles.row, { justifyContent: 'center', gap: 6, flexWrap: 'nowrap' }]}>
      <Text style={[practice.meaning, { flexShrink: 1 }]}>{form.en}</Text>
      {!!heard && <ListenButton text={heard} accessibilityLabel="Listen to the word" size={22} speed={false} />}
    </View>
    <Text style={[practice.detail, { textAlign: 'center' }]}>{v(form.he)}</Text>
    {!!form.translation && <Text style={practice.detail}>{form.translation}</Text>}
  </View>
}

// The sentence with the form marked (every word of an expression, even where others come
// between, lib/marks.ts), or blanked for a quiz (an attached prefix such as ו or ש stays).
function MarkedHebrew({ sentence, mark, form, blank }: { sentence: string; mark: string; form: string; blank: boolean }) {
  const formWords = form.split(/\s+/)
  let k = 0
  return <>{hebrewPieces(sentence, mark).map((piece, i) => {
    if (!piece.marked) return <Text key={i}>{piece.text}</Text>
    const own = formWords[k++] ?? ''
    if (blank) return <Text key={i}>{prefixOf(piece.text, own)}<Text style={practice.blank}>{' '.repeat(6)}</Text></Text>
    return <Text key={i} style={practice.mark}>{piece.text}</Text>
  })}</>
}

// English text with the card's words marked (case-insensitive, in order, possibly apart);
// unmarked if they aren't found. Each word is marked on its own and the spaces between are not:
// iOS draws a marked run that wraps onto the next line of centred text from that line's edge,
// far wider than the words, so no marked run may contain a place where the line can break.
function Marked({ text, mark }: { text: string; mark?: string }) {
  return <>{englishPieces(text, mark).map((piece, i) => (piece.marked ? <Text key={i} style={practice.mark}>{piece.text}</Text> : piece.text))}</>
}

// A checkpoint: recall a whole tense (or an adjective's forms) at once. The question side gives
// the word, what it means and who each form is for; the answer side the forms from its table,
// each to listen to.
function CheckpointSide({ entry, stage, rows, loading, answer: answerSide, v }: {
  entry: VocabEntry; stage: string; rows: Table['groups'][number]['rows']; loading: boolean; answer: boolean; v: (text: string) => string
}) {
  const label = stagesOf(entry).find(item => item.key === stage)?.label ?? stage
  const binyan = entry.binyan || entry.head?.binyan
  const slots = rows.length ? rows.map(row => row.label) : Object.values(stagesOf(entry).find(item => item.key === stage)?.slots ?? {})
  return <View style={{ gap: 10, alignSelf: 'stretch', alignItems: 'center' }}>
    <Text style={practice.eyebrow}>{kindOfEntry(entry) === 'verb' ? 'Conjugation checkpoint' : 'Forms checkpoint'}</Text>
    <Text style={practice.stage}>{label}{binyan ? ` · ${binyan}` : ''}</Text>
    <Text style={practice.meaning}>{firstSense(tableMeaning(entry))}</Text>
    <Text style={practice.word}>{v(entry.lemma)}</Text>
    {!answerSide && <Text style={practice.hint}>Recall the {label.toLowerCase()} forms</Text>}
    <View style={{ alignSelf: 'stretch', gap: 2 }}>
      {answerSide && loading && <ActivityIndicator color={colors.green} />}
      {(answerSide ? rows : slots.map(slot => ({ slot, label: slot, he: '', en: '' }))).map(row => <View key={row.slot} style={practice.checkRow}>
        <Text style={practice.checkLabel}>{row.label}</Text>
        {answerSide && <View style={[styles.row, { gap: 6, flexWrap: 'nowrap' }]}>
          <Text style={practice.checkForm}>{v(row.he)}</Text>
          <ListenButton text={row.he} accessibilityLabel={`Hear ${row.he}`} size={18} speed={false} />
        </View>}
      </View>)}
    </View>
  </View>
}

// Quiz mode: the blank is filled by choosing among the word's own forms.
function Choices({ choices, answer: correct, picked, v, onPick }: { choices: string[]; answer: string; picked: string | null; v: (text: string) => string; onPick: (option: string) => void }) {
  return <View style={{ gap: 8, alignSelf: 'stretch' }}>
    {choices.map(option => {
      const isAnswer = bare(option) === bare(correct)
      const chosen = picked !== null && bare(option) === bare(picked)
      return <Shake key={option} on={chosen && !isAnswer}>
        <Pressy moment={null} accessibilityRole="button" disabled={picked !== null} onPress={() => onPick(option)}
          style={[practice.option, picked !== null && isAnswer && practice.optionRight, chosen && !isAnswer && practice.optionWrong]}>
          <Text style={practice.optionText}>{v(option)}</Text>
        </Pressy>
      </Shake>
    })}
  </View>
}

// Cards written in the background also join the shared saved words.
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
function Summary({ answered, words, unlocked, error, onMore }: { answered: number; words: number; unlocked: string[]; error: string | null; onMore: () => void }) {
  useEffect(() => { feel('complete') }, [])
  return <Page>
    <Text style={styles.title}>{answered ? 'Done' : 'End of the round'}</Text>
    {answered > 0 && <Text style={styles.copy}>{answered} {answered === 1 ? 'card' : 'cards'} from {words} {words === 1 ? 'word' : 'words'}. The tree is tended.</Text>}
    {unlocked.map(line => <View key={line} style={practice.unlocked}>
      <Ionicons name="sparkles-outline" size={18} color={colors.green} /><Text style={[styles.copy, { color: colors.ink, flexShrink: 1 }]}>New for you: {line}</Text>
    </View>)}
    <ErrorNotice message={error} />
    <Button title="Back to your tree" onPress={() => router.dismissTo('/')} />
    <Button secondary title="Another round" onPress={onMore} />
  </Page>
}


const practice = StyleSheet.create({
  top: { gap: 10, paddingHorizontal: 22, paddingTop: 12 },
  done: { fontSize: 16, fontWeight: '600', color: colors.green },
  progress: { fontSize: 14, color: colors.muted, minWidth: 52, textAlign: 'center', fontVariant: ['tabular-nums'] },
  arrow: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  unlocked: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.lime },
  card: { alignItems: 'center', gap: 14, paddingVertical: 18, minHeight: 240, justifyContent: 'center' },
  stage: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5, color: colors.green, textTransform: 'uppercase' },
  lemma: { fontSize: 15, color: colors.ink },
  word: { fontSize: 34, lineHeight: 48, color: colors.ink, writingDirection: 'rtl', textAlign: 'center' },
  sentence: { fontSize: 22, lineHeight: 36, color: colors.ink, writingDirection: 'rtl', textAlign: 'center' },
  mark: { backgroundColor: colors.lime, fontWeight: '600' },
  english: { fontSize: 20, lineHeight: 30, color: colors.ink, textAlign: 'center' },
  blank: { textDecorationLine: 'underline', textDecorationColor: colors.green, color: colors.green },
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

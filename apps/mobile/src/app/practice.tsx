import { useEffect, useRef, useState } from 'react'
import Animated from 'react-native-reanimated'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { stop as stopSpeaking } from '../lib/speech'
import { ListenButton } from '../components/Listen'
import { Button, colors, ErrorNotice, Loading, Page, Pill, Pressy, styles } from '../components/ui'
import { FlipCard, Shake, SwipeCard } from '../components/Motion'
import { CARD_BACK_IN, CARD_IN } from '../lib/motion'
import { feel } from '../lib/feedback'
import { request } from '../lib/api'
import { answer, type Card, cardKey, deckOf, type Include, kindLabel, missingStages, type Order, quizOf, type Result, stagesOf, unlockedStages } from '../lib/forms'
import { bareWord, stripNiqqud } from '../lib/ocr-cleanup'
import { type Front, getPref, noteStudyDay, setPref } from '../lib/prefs'
import { waitOf, type Rating } from '../lib/review'
import { noteActivity } from '../lib/tree'
import type { FormCard, Session, VocabEntry } from '../lib/types'
import { withVowels } from '../lib/vowels'
import { ensureForms } from '../lib/word-forms'
import { useSession } from '../state/session'
import { cachedVocab, putEntry, vocabFor } from '../state/vocab'
import { useVowels } from '../state/vowels'

const RATINGS: { rating: Rating; label: string }[] = [{ rating: 'again', label: 'Again' }, { rating: 'hard', label: 'Hard' }, { rating: 'good', label: 'Got it' }]
const bare = (text: string) => stripNiqqud(bareWord(text))
type Settings = { front: Front; order: Order; include: Include; quiz: boolean }
const FRONTS: Record<Front, string> = { he: 'Hebrew first', en: 'English first', mixed: 'Mixed' }
const INCLUDES: Record<Include, string> = { both: 'Words & sentences', words: 'Words', sentences: 'Sentences' }
const next = <T extends string>(options: Record<T, string>, value: T) => { const keys = Object.keys(options) as T[]; return keys[(keys.indexOf(value) + 1) % keys.length] }

// The one place to study. A deck of every saved word (its dictionary form and meanings) and the
// forms of its open stages, each in its own sentence. Study for as long as you like: tap a card
// to turn it over, swipe it either way to move on (the arrows also go back), grade it if you want (a card left
// ungraded keeps its schedule), and stop with Done. Hebrew or English first, smart or shuffled
// order, which cards and quiz mode are chosen on the screen and remembered. Stages unlock as
// forms become solid (lib/forms.ts); their cards are written in the background.
export default function Practice() {
  const { session } = useSession()
  const insets = useSafeAreaInsets()
  const [showVowels] = useVowels()
  const v = (text: string) => withVowels(text, showVowels)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [deck, setDeck] = useState<Card[] | null>(null)
  const [position, setPosition] = useState(0)
  const [way, setWay] = useState<'next' | 'previous'>('next')
  const [flipped, setFlipped] = useState(false)
  // By position in the deck: the grade given, the card's record before it (so a grade can be
  // changed on going back) and a quiz choice.
  const [grades, setGrades] = useState<Record<number, Rating>>({})
  const [before, setBefore] = useState<Record<number, Result>>({})
  const [picks, setPicks] = useState<Record<number, string>>({})
  const [unlocked, setUnlocked] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The latest copy of each word, so results and unlocks build on each other within a session.
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

  if (!session) return <Page><Text style={styles.copy}>Sign in to study your saved words.</Text></Page>
  if (!deck || !settings) return <Page>{error ? <ErrorNotice message={error} /> : <Loading />}</Page>
  if (!Object.keys(words).length) return <Page>
    <Text style={styles.title}>Nothing to study yet.</Text>
    <Text style={styles.copy}>Save words as you read and they will show up here.</Text>
    <Button title="Back" onPress={() => router.back()} />
  </Page>
  const graded = Object.values(grades)
  if (done) return <Summary grades={graded} words={new Set(Object.keys(grades).map(i => deck[Number(i)].entry.id)).size} unlocked={unlocked} error={error}
    onMore={() => setDone(false)} />

  // Moving through the deck. Past the end, the deck goes round again from the latest copy of
  // each word (its order reflects what was just studied). Every card comes back to its question
  // side, a quiz card to its choices; a grade it was given stays and shows once it is turned.
  // `quiet` when a grade already made its sound. False when there was nowhere to go.
  const go = (step: 1 | -1, quiet = false) => {
    const cards = deck
    const to = position + step
    if (to < 0) return false
    if (to >= cards.length) {
      const again = deckOf(Object.values(words), settings, Date.now(), `${Date.now()}`)
      if (!again.length) return false
      // Don't show the card just studied twice in a row.
      if (again.length > 1 && cardKey(again[0]) === cardKey(cards[position])) again.push(again.shift()!)
      setDeck([...cards, ...again])
    }
    if (!quiet) feel('advance')
    setWay(step === 1 ? 'next' : 'previous'); setPosition(to); setFlipped(false)
    setPicks(current => { const { [to]: _gone, ...rest } = current; return rest })
    return true
  }
  const stopStudying = () => { stopSpeaking(); if (graded.length) setDone(true); else router.back() }

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
  if (!card) return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <TopBar settings={settings} change={change} position={position} canGoBack={false} onBack={() => go(-1)} onNext={() => go(1)} onDone={stopStudying} />
    <View style={[styles.content, { gap: 12 }]}>
      <Text style={styles.copy}>{settings.include === 'sentences' ? 'No sentence cards yet. They are written for each word as you save it.' : 'Nothing to study with these settings.'}</Text>
      <Button title="Study words and sentences" onPress={() => change({ include: 'both' })} />
    </View>
  </View>

  const entry = words[card.entry.id] || card.entry
  const form = card.form ? entry.forms?.find(item => item.key === card.form!.key) || card.form : null
  const record: Result = form || { review: entry.review }
  const stage = form ? stagesOf(entry).find(item => item.key === form.stage) : null
  // Mixed: each card shows one side or the other first, settled per card and position.
  const front: 'he' | 'en' = settings.front === 'mixed' ? ([...`${cardKey(card)}${position}`].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2 ? 'en' : 'he') : settings.front
  const englishFirst = front === 'en' && (!form || !!form.translation)
  // Quiz mode: a word card shown in Hebrew asks for its meaning, shown in English for the word.
  const quiz = settings.quiz ? quizOf(Object.values(words), { entry, form }, !englishFirst, `${cardKey(card)}-${record.review?.reps ?? 0}`) : null
  const choices = quiz?.options ?? null
  const picked = picks[position] ?? null
  const right = !!quiz && picked !== null && bare(picked) === bare(quiz.answer)

  // A grade records the card's result (from its record before this session's grade, so changing
  // a grade replaces it) and moves on; a quiz choice grades without moving on.
  const grade = (rating: Rating, { felt = false, advance = true } = {}) => {
    if (!felt) feel(rating === 'good' ? 'gotIt' : 'graded')
    void noteStudyDay()
    // Only a card's first grade here counts toward the tree; changing it on going back doesn't.
    if (before[position] === undefined) noteActivity('cards')
    const start = before[position] ?? record
    const result = answer(start, rating)
    void request('vocab', { token: session.token, method: 'PATCH', body: form ? { id: entry.id, form: { key: form.key, ...result } } : { id: entry.id, review: result.review } })
      .catch((failure: Error) => setError(`A result wasn't saved. ${failure.message}`))
    const opened = unlockedStages(entry).map(item => item.key)
    const updated: VocabEntry = form ? { ...entry, forms: (entry.forms || []).map(item => (item.key === form.key ? { ...item, ...result } : item)) } : { ...entry, review: result.review }
    setWords(current => ({ ...current, [entry.id]: updated })); putEntry(session, updated)
    // A newly opened stage: note it for the summary and have its cards written for next time.
    const fresh = unlockedStages(updated).filter(item => !opened.includes(item.key))
    if (fresh.length) {
      setUnlocked(current => [...current, ...fresh.map(item => `${v(entry.lemma)}: ${item.label}`)])
      setTimeout(() => feel('unlock'), 250)
      void ensureForms(updated, session.token).then(ready => { share(session, ready); keep(ready) })
    }
    // The deck in front of the learner isn't reordered by a grade: it only sets when the card
    // comes back in a later session (or the next round of this one).
    setBefore(current => ({ ...current, [position]: start })); setGrades(current => ({ ...current, [position]: rating }))
    if (advance) go(1, true)
  }

  const listen = form ? form.sentence : entry.lemma
  const side = (english: boolean, answerSide: boolean) => form
    ? <SentenceSide form={form} english={english} answer={answerSide} hideMark={!!choices && picked === null} v={v} />
    : <WordSide entry={entry} english={english} answer={answerSide} v={v} />

  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <TopBar settings={settings} change={change} position={position} canGoBack={position > 0} onBack={() => go(-1)} onNext={() => go(1)} onDone={stopStudying} />
    <ScrollView contentContainerStyle={[styles.content, { flexGrow: 1, gap: 16, justifyContent: 'center' }]}>
      <ErrorNotice message={error} />
      {/* One swipe card for the whole deck; only what is on it changes (see SwipeCard). No exit
          animation: a swiped card has already left. */}
      <SwipeCard card={position} onSwipe={() => go(1)} onDrag={onDrag}>
        <Animated.View key={position} entering={way === 'next' ? CARD_IN : CARD_BACK_IN}>
          {choices
            ? <View style={[styles.card, practice.card]}>
              <CardHead label={stage?.label} lemma={v(entry.lemma)} listen={picked !== null ? listen : undefined} />
              {side(!form && englishFirst, picked !== null)}
              <Choices choices={choices} answer={quiz!.answer} picked={picked} v={v} onPick={option => {
                if (!tapped()) return
                const isRight = bare(option) === bare(quiz!.answer)
                setPicks(current => ({ ...current, [position]: option })); feel(isRight ? 'right' : 'wrong')
                grade(isRight ? 'good' : 'again', { felt: true, advance: false })
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
    </ScrollView>
    {/* Room for the buttons is kept while there are none, so the card doesn't move when they appear. */}
    <View style={[practice.actions, { paddingBottom: 12 + insets.bottom }, !(choices ? picked !== null : flipped) && { borderTopColor: 'transparent' }]}>
      {choices
        ? (picked !== null ? <Button title="Next" moment={null} onPress={() => go(1)} style={{ flex: 1 }} />
          : null)
        : !flipped ? (settings.quiz ? <Text style={[practice.hint, { flex: 1, paddingVertical: 14 }]}>Not enough options to quiz this card yet, so tap it to turn it over</Text> : null)
          : RATINGS.map(({ rating, label }) => <Button key={rating} moment={null} secondary={grades[position] !== undefined ? grades[position] !== rating : rating !== 'good'}
            title={label} detail={waitOf(before[position]?.review ?? record.review, rating)} onPress={() => grade(rating)} style={{ flex: 1, paddingHorizontal: 8 }} />)}
    </View>
  </View>
}

// Done, the cards studied and the arrows; below, the settings as chips.
function TopBar({ settings, change, position, canGoBack, onBack, onNext, onDone }: {
  settings: Settings; change: (patch: Partial<Settings>) => void; position: number; canGoBack: boolean; onBack: () => void; onNext: () => void; onDone: () => void
}) {
  return <View style={practice.top}>
    <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
      <Pressable accessibilityRole="button" onPress={onDone} hitSlop={10}><Text style={practice.done}>Done</Text></Pressable>
      <View style={[styles.row, { gap: 4, flexWrap: 'nowrap' }]}>
        <Arrow icon="chevron-back" label="Previous card" disabled={!canGoBack} onPress={onBack} />
        <Text style={practice.progress}>{position + 1}</Text>
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

// One form in its sentence: the Hebrew sentence with the form marked, or its English with the
// meaning marked. The answer side shows the Hebrew sentence, the form and what it means.
function SentenceSide({ form, english, answer: answerSide, hideMark, v }: { form: FormCard; english: boolean; answer: boolean; hideMark: boolean; v: (text: string) => string }) {
  const hebrew = <Text style={practice.sentence}><MarkedHebrew sentence={v(form.sentence)} mark={form.mark} form={form.he} blank={hideMark} /></Text>
  if (!answerSide) return <>
    {english ? <Text style={practice.english}><Marked text={form.translation} mark={form.enMark} /></Text> : hebrew}
    {hideMark && <Text style={practice.hint}>{form.en}</Text>}
  </>
  return <View style={{ gap: 8, alignSelf: 'stretch' }}>
    {hebrew}
    <Text style={practice.meaning}>{form.en}</Text>
    <Text style={[practice.detail, { textAlign: 'center' }]}>{v(form.he)}</Text>
    {!!form.translation && <Text style={practice.detail}>{form.translation}</Text>}
  </View>
}

// The sentence with the form marked, or blanked for a quiz (an attached prefix such as ו or ש stays).
function MarkedHebrew({ sentence, mark, form, blank }: { sentence: string; mark: string; form: string; blank: boolean }) {
  const markBare = bare(mark)
  const formBare = bare(form)
  return <>{sentence.split(/(\s+)/).map((token, i) => {
    if (bare(token) !== markBare) return <Text key={i}>{token}</Text>
    if (blank) {
      const prefix = markBare.endsWith(formBare) ? markBare.slice(0, markBare.length - formBare.length) : ''
      return <Text key={i}>{prefix}<Text style={practice.blank}>{' '.repeat(6)}</Text></Text>
    }
    return <Text key={i} style={practice.mark}>{token}</Text>
  })}</>
}

// English text with one phrase marked (case-insensitive); unmarked if the phrase isn't found.
// Each word of the phrase is marked on its own and the spaces between are not: iOS draws a
// marked run that wraps onto the next line of centred text from that line's edge, far wider
// than the words, so no marked run may contain a place where the line can break.
function Marked({ text, mark }: { text: string; mark?: string }) {
  const at = mark ? text.toLowerCase().indexOf(mark.toLowerCase()) : -1
  if (at < 0) return <>{text}</>
  const words = text.slice(at, at + mark!.length).split(/(\s+)/)
  return <>{text.slice(0, at)}{words.map((piece, i) => (/^\s+$/.test(piece) || !piece ? piece : <Text key={i} style={practice.mark}>{piece}</Text>))}{text.slice(at + mark!.length)}</>
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

// After Done: how it went, and which stages opened. A card graded twice (missed, then seen again)
// counts twice, so cards can outnumber words.
// The end of a session: one calm line, any stage that opened, and back to the tree, which shows
// the rest (lib/tree.ts).
function Summary({ grades, words, unlocked, error, onMore }: { grades: Rating[]; words: number; unlocked: string[]; error: string | null; onMore: () => void }) {
  useEffect(() => { feel('complete') }, [])
  return <Page>
    <Text style={styles.title}>Done</Text>
    <Text style={styles.copy}>{grades.length} {grades.length === 1 ? 'card' : 'cards'} from {words} {words === 1 ? 'word' : 'words'}. The tree is tended.</Text>
    {unlocked.map(line => <View key={line} style={practice.unlocked}>
      <Ionicons name="lock-open-outline" size={18} color={colors.green} /><Text style={[styles.copy, { color: colors.ink, flexShrink: 1 }]}>Unlocked {line}</Text>
    </View>)}
    <ErrorNotice message={error} />
    <Button title="Back to your tree" onPress={() => router.dismissTo('/')} />
    <Button secondary title="Keep studying" onPress={onMore} />
  </Page>
}

const practice = StyleSheet.create({
  top: { gap: 10, paddingHorizontal: 22, paddingTop: 12 },
  done: { fontSize: 16, fontWeight: '600', color: colors.green },
  progress: { fontSize: 14, color: colors.muted, minWidth: 28, textAlign: 'center' },
  arrow: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  unlocked: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.lime },
  card: { alignItems: 'center', gap: 14, paddingVertical: 18, minHeight: 240, justifyContent: 'center' },
  stage: { fontSize: 13, color: colors.muted, flexShrink: 1 },
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
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 22, paddingTop: 12, minHeight: 64, backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.line },
})

import { useCallback, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { AccountGate, Button, colors, ErrorNotice, Loading, Page, Pressy, styles, TextButton } from '../../components/ui'
import { request } from '../../lib/api'
import { isolateHebrew } from '../../lib/bidi'
import { textFromDocument } from '../../lib/documents'
import { countsOf } from '../../lib/forms'
import { getPref, setPref } from '../../lib/prefs'
import { type LastRead, minutesFor, parseLastRead, readyStages, studiedDays, weekDots } from '../../lib/today'
import type { TextDoc } from '../../lib/types'
import { withVowels } from '../../lib/vowels'
import { useSession } from '../../state/session'
import { useVocab } from '../../state/vocab'
import { useVowels } from '../../state/vowels'

// The first screen: what to do today. Studying (what's due, about how long, the week's dots and
// any stage that has just opened), the passage being read, opened where it stopped, and the
// camera one tap away. Everything comes from the saved words and this phone's own notes.
export default function Today() {
  const { session, setRecognition } = useSession()
  const { entries, at: now, loaded, error, reload } = useVocab(session)
  const [showVowels] = useVowels()
  const v = (text: string) => withVowels(text, showVowels)
  const [lastRead, setLastRead] = useState<LastRead | null>(null)
  const [recorded, setRecorded] = useState<string[]>([])
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  useFocusEffect(useCallback(() => {
    void getPref('lastRead').then(value => setLastRead(parseLastRead(value)))
    void getPref('studyDays').then(value => setRecorded(value.split(',').filter(Boolean)))
  }, []))
  const counts = useMemo(() => countsOf(entries, now), [entries, now])
  const dots = useMemo(() => weekDots(studiedDays(entries, recorded)), [entries, recorded])
  const ready = useMemo(() => readyStages(entries), [entries])
  const recent = entries.slice(0, 6)

  // The passage comes from the library, so it opens as saved, at the sentence where reading stopped.
  const continueReading = async () => {
    if (!session || !lastRead) return
    setOpening(true); setOpenError(null)
    try {
      const { texts } = await request<{ texts?: TextDoc[] }>('texts', { token: session.token })
      const doc = texts?.find(item => item.id === lastRead.id)
      if (!doc) { setPref('lastRead', ''); setLastRead(null); setOpenError('That passage is no longer in your library.'); return }
      const recognition = textFromDocument(doc)
      const startAt = lastRead.segment < (recognition.segments?.length ?? 0) ? lastRead.segment : undefined
      setRecognition({ ...recognition, startAt })
      router.push('/reader')
    } catch (failure) { setOpenError((failure as Error).message) } finally { setOpening(false) }
  }

  if (!session) return <Page>
    <Text style={styles.eyebrow}>FROM SEEING TO UNDERSTANDING</Text><Text style={styles.title}>Hebrew, in focus.</Text>
    <AccountGate />
    <Button secondary title="Read a page" onPress={() => router.push('/camera')} />
  </Page>

  return <Page onRefresh={reload}>
    <View style={{ gap: 4 }}>
      <Text style={styles.eyebrow}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</Text>
      <Text style={[styles.title, today.greeting]}>{greeting(new Date().getHours())}</Text>
    </View>
    <ErrorNotice message={error} />
    {!loaded ? <Loading /> : <View style={styles.card}>
      {entries.length === 0
        ? <><Text style={styles.heading}>Nothing to study yet</Text><Text style={styles.copy}>Read a page and save the words you want to keep. They come back here to study.</Text></>
        : <>
          <Text style={styles.heading}>{counts.due ? `${counts.due} ${counts.due === 1 ? 'card' : 'cards'} due · about ${minutesFor(counts.due)} min` : 'All caught up'}</Text>
          <Button title={counts.due ? 'Study now' : 'Study ahead'} secondary={!counts.due} onPress={() => router.push('/practice')} />
          {ready.map(item => <Text key={`${item.entry.id}${item.label}`} style={today.ready}>New to learn: <Text style={today.hebrew}>{isolateHebrew(v(item.entry.lemma))}</Text> · {item.label}</Text>)}
        </>}
      <Week dots={dots} />
    </View>}
    {lastRead && <Pressy accessibilityRole="button" accessibilityLabel={`Continue reading ${lastRead.title}`} disabled={opening} onPress={() => void continueReading()} style={[styles.card, { gap: 6, opacity: opening ? 0.6 : 1 }]}>
      <Text style={today.label}>CONTINUE READING</Text>
      <Text style={today.passage} numberOfLines={1}>{lastRead.title}</Text>
      <View style={[styles.row, { gap: 6 }]}>
        <Text style={styles.copy}>Sentence {lastRead.segment + 1} · {new Date(lastRead.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.green} />
      </View>
    </Pressy>}
    <ErrorNotice message={openError} />
    <View style={{ gap: 8 }}>
      <Button title="Read a page" onPress={() => router.push('/camera')} />
      <TextButton title="Or paste Hebrew text" onPress={() => router.push('/compose')} />
    </View>
    {recent.length > 0 && <View style={{ gap: 10 }}>
      <Text style={today.label}>RECENTLY SAVED</Text>
      <View style={[styles.row, { gap: 8 }]}>
        {recent.map(entry => <Pressy key={entry.id} moment="tick" accessibilityRole="button" accessibilityLabel={`${entry.lemma}, ${entry.gloss}`}
          onPress={() => router.push({ pathname: '/word', params: { id: entry.id } })} style={today.chip}>
          <Text style={today.chipText}>{v(entry.lemma)}</Text>
        </Pressy>)}
      </View>
    </View>}
  </Page>
}

// The last seven days as dots: filled for a day studied, today ringed.
function Week({ dots }: { dots: ReturnType<typeof weekDots> }) {
  const studied = dots.filter(dot => dot.studied).length
  return <View accessible accessibilityLabel={`Studied ${studied} of the last 7 days`} style={{ gap: 6 }}>
    <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
      {dots.map(dot => <View key={dot.day} style={{ alignItems: 'center', gap: 4 }}>
        <View style={[today.dot, dot.studied && today.dotOn, dot.today && today.dotToday]} />
        <Text style={[today.letter, dot.today && { color: colors.ink, fontWeight: '700' }]}>{dot.letter}</Text>
      </View>)}
    </View>
  </View>
}

// Hebrew for the time of day.
function greeting(hour: number) {
  if (hour >= 5 && hour < 12) return 'בוקר טוב'
  if (hour >= 12 && hour < 17) return 'צהריים טובים'
  if (hour >= 17 && hour < 22) return 'ערב טוב'
  return 'לילה טוב'
}

const today = StyleSheet.create({
  greeting: { writingDirection: 'rtl', textAlign: 'left' },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  passage: { fontSize: 20, lineHeight: 30, color: colors.ink, writingDirection: 'rtl', textAlign: 'right' },
  ready: { fontSize: 14, color: colors.muted },
  hebrew: { color: colors.ink, fontWeight: '600' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white },
  dotOn: { backgroundColor: colors.green, borderColor: colors.green },
  dotToday: { borderColor: colors.green, borderWidth: 2 },
  letter: { fontSize: 11, color: colors.muted },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  chipText: { fontSize: 18, color: colors.ink },
})

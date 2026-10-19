import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import Animated, { useReducedMotion } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Bonsai, type BonsaiHandle, type BonsaiPart } from '../bonsai/Bonsai'
import { hourNow } from '../bonsai/sky'
import { DraggableSheet } from '../components/Motion'
import { Button, colors, ErrorNotice, Pressy, TextButton } from '../components/ui'
import { request } from '../lib/api'
import { textFromDocument } from '../lib/documents'
import { feel } from '../lib/feedback'
import { freshStages } from '../lib/forms'
import { APPEAR, DISAPPEAR } from '../lib/motion'
import { getPref, setPref } from '../lib/prefs'
import { type LastRead, parseLastRead } from '../lib/today'
import { lastTree, loadTree, rememberTree, SAPLING, takeTended, type Tree, treeLine } from '../lib/tree'
import type { TextDoc } from '../lib/types'
import { useSession } from '../state/session'
import { useVocab } from '../state/vocab'

// Home: the learner's bonsai, and the two things to do here, Read and Study. The tree is the
// whole record of how studying goes (lib/tree.ts): no counts, streaks or badges, only one quiet
// line saying how it is. It opens on the tree last shown and grows into today's, so what was
// just done is seen happening; after studying it also gives one soft breath of wind.
export default function Home() {
  const { session, setRecognition } = useSession()
  const { entries, loaded } = useVocab(session)
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const bonsai = useRef<BonsaiHandle>(null)
  const [tree, setTree] = useState<Tree | null>(null)
  const [focused, setFocused] = useState(true)
  const [visit, setVisit] = useState(0)
  const [hour, setHour] = useState(hourNow)
  const [sway, setSway] = useState(true)
  const [panel, setPanel] = useState(220)
  const [reading, setReading] = useState(false)
  const [lastRead, setLastRead] = useState<LastRead | null>(null)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  // What Mila suggests studying next: a stage it has just brought in. A suggestion, never a count.
  const next = useMemo(() => freshStages(entries, 1)[0], [entries])

  useFocusEffect(useCallback(() => {
    setFocused(true); setVisit(value => value + 1); setHour(hourNow())
    void getPref('lastRead').then(value => setLastRead(parseLastRead(value)))
    void getPref('treeMotion').then(setSway)
    // The light follows the clock while Home is open.
    const clock = setInterval(() => setHour(hourNow()), 5 * 60 * 1000)
    return () => { setFocused(false); clearInterval(clock) }
  }, []))

  // Once per visit, when the saved words are in: the tree last shown at once, then today's from
  // the server. Offline, the last one stays.
  const owner = session?.user.id
  const loadedVisit = useRef('')
  useEffect(() => {
    if (!session) { setTree(SAPLING); return }
    if (!loaded || loadedVisit.current === `${owner}:${visit}`) return
    loadedVisit.current = `${owner}:${visit}`
    const greet = takeTended()
    let live = true
    void (async () => {
      const shown = await lastTree(session)
      if (live && shown) setTree(current => current ?? shown)
      try {
        const fresh = await loadTree(session)
        if (!live) return
        setTree(fresh); rememberTree(session, fresh)
        // After the tree has had a moment to grow into its new state.
        if (greet) setTimeout(() => bonsai.current?.celebrate(), 1200)
      } catch { if (live) setTree(current => current ?? shown ?? SAPLING) }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, loaded, visit])

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
      setReading(false)
      router.push('/reader')
    } catch (failure) { setOpenError((failure as Error).message) } finally { setOpening(false) }
  }
  const go = (path: '/camera' | '/compose') => { setReading(false); router.push(path) }
  const touched = useCallback((part: BonsaiPart) => feel(part === 'foliage' ? 'tick' : 'select'), [])

  const shown = tree ?? SAPLING
  const line = treeLine(shown, entries.length > 0, !!session)
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()

  return <View style={home.page}>
    {tree && <Bonsai ref={bonsai} style={StyleSheet.absoluteFill} growth={tree.growth} overgrowth={tree.overgrowth} vitality={tree.vitality} seed={tree.seed}
      ambient={sway && !reduceMotion} paused={!focused} haptics={false} hour={hour} onTouchPart={touched}
      inset={{ top: insets.top + 70, bottom: panel - 24 }} />}

    <View pointerEvents="box-none" style={[home.top, { paddingTop: insets.top + 10 }]}>
      <View style={{ gap: 2 }}>
        <Text style={home.date}>{date}</Text>
        <Text style={home.greeting}>{greeting(new Date().getHours())}</Text>
      </View>
      <Pressy moment="tick" depth={0.92} accessibilityRole="button" accessibilityLabel="Account and settings" hitSlop={10}
        onPress={() => router.push('/account')} style={home.corner}>
        <Ionicons name="person-circle-outline" size={28} color={colors.ink} />
      </Pressy>
    </View>

    <View style={[home.panel, { paddingBottom: insets.bottom + 6 }]} onLayout={event => setPanel(event.nativeEvent.layout.height)}>
      <Text style={home.line} accessibilityLiveRegion="polite">{line}</Text>
      <ErrorNotice message={openError} />
      <View style={home.actions}>
        <View style={home.action}>
          <Button secondary title="Read" style={home.button} onPress={() => setReading(true)} />
          <TextButton title="Library" onPress={() => router.push('/library')} />
        </View>
        <View style={home.action}>
          {/* Green when Mila has something new to suggest: information, never a badge. */}
          <Button secondary={!next} title="Study" detail={session && next ? `${next.label} · ${next.entry.lemma}` : undefined} style={home.button}
            onPress={() => router.push(session ? '/practice' : '/login')} />
          <TextButton title="Your words" onPress={() => router.push('/vocabulary')} />
        </View>
      </View>
    </View>

    {reading && <ReadSheet lastRead={session ? lastRead : null} opening={opening} onClose={() => setReading(false)}
      onCamera={() => go('/camera')} onPaste={() => go('/compose')} onContinue={() => void continueReading()} />}
  </View>
}

// The ways a new text comes in: a photo of a page, pasted text, or the passage being read.
function ReadSheet({ lastRead, opening, onClose, onCamera, onPaste, onContinue }: {
  lastRead: LastRead | null; opening: boolean; onClose: () => void; onCamera: () => void; onPaste: () => void; onContinue: () => void
}) {
  const insets = useSafeAreaInsets()
  return <View style={StyleSheet.absoluteFill}>
    <Animated.View entering={APPEAR} exiting={DISAPPEAR} style={[StyleSheet.absoluteFill, home.scrim]}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} />
    </Animated.View>
    <DraggableSheet onDismiss={onClose} accessibilityViewIsModal style={[home.sheet, { paddingBottom: insets.bottom + 14 }]}
      handle={<Text style={home.sheetTitle}>Read</Text>}>
      <Option icon="camera-outline" title="Photograph a page" detail="A book, a sign, a letter" onPress={onCamera} />
      <Option icon="clipboard-outline" title="Paste text" detail="Hebrew from anywhere" onPress={onPaste} />
      {lastRead && <Option icon="book-outline" title="Continue reading" detail={lastRead.title} busy={opening} onPress={onContinue} />}
    </DraggableSheet>
  </View>
}

function Option({ icon, title, detail, busy, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; detail: string; busy?: boolean; onPress: () => void }) {
  return <Pressy accessibilityRole="button" accessibilityLabel={`${title}, ${detail}`} disabled={busy} onPress={onPress} depth={0.98}
    style={[home.option, busy && { opacity: 0.6 }]}>
    <View style={home.optionIcon}><Ionicons name={icon} size={22} color={colors.green} /></View>
    <View style={{ flex: 1, gap: 1 }}>
      <Text style={home.optionTitle}>{title}</Text>
      <Text style={home.optionDetail} numberOfLines={1}>{detail}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
  </Pressy>
}

// Hebrew for the time of day.
function greeting(hour: number) {
  if (hour >= 5 && hour < 12) return 'בוקר טוב'
  if (hour >= 12 && hour < 17) return 'צהריים טובים'
  if (hour >= 17 && hour < 22) return 'ערב טוב'
  return 'לילה טוב'
}

const home = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 22 },
  date: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  greeting: { fontSize: 26, lineHeight: 34, fontWeight: '600', color: colors.ink, writingDirection: 'rtl', textAlign: 'left' },
  corner: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 14, gap: 12 },
  line: { fontSize: 16, lineHeight: 23, color: colors.ink, textAlign: 'center', opacity: 0.8 },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1, gap: 0 },
  button: { minHeight: 56 },
  scrim: { backgroundColor: '#2A252038' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 10, paddingHorizontal: 16, gap: 6, backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 1.5, color: colors.muted, textAlign: 'center', paddingBottom: 6, textTransform: 'uppercase' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  optionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lime },
  optionTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  optionDetail: { fontSize: 14, color: colors.muted },
})

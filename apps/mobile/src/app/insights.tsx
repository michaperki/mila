import { useCallback, useState } from 'react'
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { colors, ErrorNotice, Loading, Page, Pill, Pressy, styles, TextButton } from '../components/ui'
import { request } from '../lib/api'
import { sendingState, sendStudyLog } from '../lib/study-log'
import { useSession } from '../state/session'

// Learning Insights, for the developers only (the server answers ADMIN_EMAILS and no one else,
// apps/web/netlify/functions/insights.ts): your own sessions as Mila saw them, what the learner
// model took from each thing you did, a few labelled heuristics (what was observed, what it may
// mean, what could be done, what Study did, what happened after), one word's evidence, and where
// the model's predictions were wrong. Read-only. The server words everything (lib/insights.ts);
// this screen lays it out. One screen: sessions (and model checks), one session (`session`), or one
// word (`word`).
type Late = { count: number; receivedAt: number; missed: number[] }
type Summary = { id: string; kind: 'study' | 'reading'; title: string; start: number; end: number; activeMs: number; endedBy: string; ended: string; counts: Record<string, number>; parts: number; late: Late | null }
type WordRef = { id?: string; lemma: string }
type Insight = { rule: string; label: string; observation: string; interpretation: string; opportunity?: string; decision?: string; acted?: boolean; outcome?: string; words?: WordRef[] }
type Row = { at: number; gapMs?: number; icon: string; text: string; detail?: string[]; words?: WordRef[]; model?: string[]; flags?: string[]; insight?: Insight }
type Estimate = { p: number; low: number; high: number; evidence: number }
type EvidenceLine = { text: string; at: number; dated: boolean; side: string | null; weight: number; knew: boolean; kind: string }
type Prediction = { answer: string; at: number; key: string; wordId: string; lemma: string; channel: string; knew: boolean; p: number; low: number; high: number; cardSoFar: number; cardAnswers: number; evidence: EvidenceLine[] }
type Trace = {
  version: string; word: { id?: string; lemma: string; gloss?: string; partOfSpeech?: string; saved: boolean }
  knowledge: { recognition: Estimate; production: Estimate; prior: { recognition: number; production: number }; band: string; answers: number; evidence: (EvidenceLine & { channel: string; sessions: string[] })[] } | null
  importance: { rankText: string; saves: number; lookedUpAgain: number; readTimes: number; readTexts: number; themes: string[]; register?: string; level?: string }
  scheduling: { cards: { key: string; label: string; state: string; results: boolean[]; last: number | null }[]; known: string[]; lastShown: { at: number; why: string | null } | null } | null
  surprises: Prediction[]; related: { id: string; lemma: string; why: string }[]
}
type Calibration = { channel: string; range: string; n: number; predicted: number; actual: number; card: number }
type Checks = { version: string; days: number; answers: number; unpredicted: number; right: number; expected: number; rate: number; loss: { model: number; card: number; base: number }; calibration: Calibration[]; surprises: Prediction[]; data: { label: string; value: number; of?: number }[] }

const ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  play: 'play-outline', card: 'albums-outline', flip: 'sync-outline', hold: 'hand-left-outline', lookup: 'search-outline', right: 'checkmark-circle-outline', wrong: 'close-circle-outline',
  save: 'bookmark-outline', unsave: 'bookmark', book: 'book-outline', sentence: 'reader-outline', scroll: 'swap-vertical-outline', stop: 'stop-outline', insight: 'bulb-outline', model: 'analytics-outline',
}
const CHANNELS: Record<string, string> = { production: 'Producing, English first', recognition: 'Recognizing, Hebrew first or fill in the blank', either: 'Side not recorded, before 14/11' }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const two = (n: number) => String(n).padStart(2, '0')
const clock = (at: number, seconds = false) => { const d = new Date(at); return `${two(d.getHours())}:${two(d.getMinutes())}${seconds ? `:${two(d.getSeconds())}` : ''}` }
const date = (at: number) => { const d = new Date(at); return `${DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}` }
const when = (at: number) => `${date(at)}, ${clock(at)}`
const length = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`)
const pct = (p: number) => `${Math.round(p * 100)}%`
// An older result's time wasn't kept: only the latest day it can have been, so its order is uncertain.
const whenOf = (line: { at: number; dated: boolean }) => (line.dated ? when(line.at) : `date only, no time: by ${date(line.at)}; order uncertain`)
const small = { fontSize: 13, lineHeight: 19, color: colors.muted }
const open = (params: Record<string, string>) => router.push({ pathname: '/insights', params })

export default function Insights() {
  const { session: id, word } = useLocalSearchParams<{ session?: string; word?: string }>()
  const title = <Stack.Screen options={{ title: id ? 'Session' : word ? 'Word' : 'Learning Insights' }} />
  return <>{title}{id ? <SessionView id={id} /> : word ? <WordView id={word} /> : <Home />}</>
}

// What a screen asks the server for, asked again on each visit and on a pull.
function useInsights<T>(path: string) {
  const { session } = useSession()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!session) return
    // What is waiting on the phone first, so the newest events are in what comes back.
    await sendStudyLog(session.user.id, session.token)
    try { setData(await request<T>(path, { token: session.token, timeoutMs: 30000 })); setError(null) }
    catch (failure) { setError((failure as Error).message) }
  }, [session, path])
  useFocusEffect(useCallback(() => { void load() }, [load]))
  return { data, error, load }
}

function Home() {
  const [tab, setTab] = useState<'sessions' | 'checks'>('sessions')
  return <>
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 22, paddingTop: 12, backgroundColor: colors.paper }}>
      <Pill label="Sessions" active={tab === 'sessions'} onPress={() => setTab('sessions')} />
      <Pill label="Model checks" active={tab === 'checks'} onPress={() => setTab('checks')} />
    </View>
    {tab === 'sessions' ? <Sessions /> : <ModelChecks />}
  </>
}

// A late arrival, said once per session: red only when a Study session started without it (its
// choice of new words and the cards written then read lookups and answers from the server).
function LateNote({ late, short }: { late: Late; short?: boolean }) {
  const affected = late.missed.length > 0
  const studies = late.missed.map(at => clock(at)).join(', ')
  return <Text style={[small, affected && { color: colors.red }]}>{short
    ? affected ? `Arrived after Study ${studies} had already started without it` : `${late.count} events arrived late; nothing was decided without them`
    : affected
      ? `${late.count} events reached the server at ${when(late.receivedAt)}, after Study ${studies} had already started without them: its choice of new words and any cards written then didn’t know about these lookups and answers.`
      : `${late.count} events reached the server late, at ${when(late.receivedAt)}. No Study session started before they arrived, so nothing was decided without them.`}</Text>
}

// A session's time spent: only while something happened (gaps of over 2 minutes count as 2) and
// never while Mila was in the background.
const brief = (item: Summary) => item.activeMs < 30_000 && !item.counts.answers && !item.counts.lookups && !item.counts.saves && !item.counts.sentences
function Sessions() {
  const { session } = useSession()
  const { data, error, load } = useInsights<{ version: string; sessions: Summary[]; events: number; lastEventAt: number | null }>('insights')
  const [all, setAll] = useState(false)
  // What this phone hasn't sent yet, read after each load (useInsights sends first).
  const phone = data && session ? sendingState(session.user.id) : null
  if (!data) return <Page>{error ? <ErrorNotice message={error} /> : <Loading />}</Page>
  const shown = all ? data.sessions : data.sessions.filter(item => !brief(item))
  const hidden = data.sessions.length - shown.length
  return <Page onRefresh={load}>
    <ErrorNotice message={error} />
    {!!phone && (phone.waiting > 0 || phone.lastError) && <Text style={[small, { color: colors.red }]}>{phone.waiting} events still on this phone, not yet on the server.{phone.lastError ? ` The last upload failed: ${phone.lastError.message}` : ''}</Text>}
    <Text style={small}>The last 30 days as Mila recorded them: what you did, what the learner model took from it, and what Study did. Hints are English words you held on a card for their Hebrew. Model {data.version}; {data.events} events, the latest {data.lastEventAt ? when(data.lastEventAt) : 'none'}.</Text>
    {shown.map(item => <Pressy key={item.id} moment="tick" accessibilityRole="button" onPress={() => open({ session: item.id })} style={[styles.card, { gap: 6, padding: 16 }]}>
      <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.ink, flexShrink: 1 }} numberOfLines={1}>{item.kind === 'study' ? 'Study' : `Reading · ${item.title}`}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </View>
      <Text style={small}>{when(item.start)} · {length(item.activeMs)} active</Text>
      <Text style={small}>{item.ended}</Text>
      <Text style={[small, { color: colors.ink }]}>{item.kind === 'study'
        ? [`${item.counts.cards} cards shown`, `${item.counts.answers} answered, ${item.counts.right} right`, item.counts.hints && `${item.counts.hints} ${item.counts.hints === 1 ? 'hint' : 'hints'} asked`, item.counts.lookups && `${item.counts.lookups} looked up`, item.counts.saves && `${item.counts.saves} saved`].filter(Boolean).join(' · ')
        : [`${item.counts.sentences} sentences read`, `${item.counts.lookups} looked up`, `${item.counts.saves} saved`].join(' · ')}</Text>
      {item.late && <LateNote late={item.late} short />}
    </Pressy>)}
    {hidden > 0 && <TextButton title={`Show ${hidden} brief sessions, opened with nothing done`} onPress={() => setAll(true)} />}
    {!data.sessions.length && <Text style={styles.copy}>Nothing recorded in the last 30 days.</Text>}
  </Page>
}

function SessionView({ id }: { id: string }) {
  const { data, error, load } = useInsights<{ version: string; summary: Summary; rows: Row[] }>(`insights?session=${encodeURIComponent(id)}`)
  if (!data) return <Page>{error ? <ErrorNotice message={error} /> : <Loading />}</Page>
  const { summary } = data
  return <Page onRefresh={load}>
    <ErrorNotice message={error} />
    <View style={{ gap: 4 }}>
      <Text style={styles.heading}>{summary.kind === 'study' ? 'Study' : summary.title}</Text>
      <Text style={small}>{when(summary.start)}–{clock(summary.end)} · {length(summary.activeMs)} active · model {data.version}</Text>
      <Text style={small}>{summary.ended}</Text>
      {summary.late && <LateNote late={summary.late} />}
    </View>
    <View style={{ gap: 14 }}>{data.rows.map((row, i) => <RowView key={i} row={row} />)}</View>
  </Page>
}

function RowView({ row }: { row: Row }) {
  return <View style={{ flexDirection: 'row', gap: 10 }}>
    <View style={{ width: 22, alignItems: 'center', paddingTop: 2 }}><Ionicons name={ICONS[row.icon] ?? 'ellipse-outline'} size={18} color={row.icon === 'wrong' ? colors.red : colors.green} /></View>
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={[small, { fontSize: 11 }]}>{clock(row.at, true)}{row.gapMs !== undefined ? `  +${length(row.gapMs)}` : ''}</Text>
      <Text style={{ fontSize: 15, lineHeight: 21, color: colors.ink, fontWeight: row.icon === 'card' || row.icon === 'insight' ? '600' : '400' }}>{row.text}</Text>
      {row.detail?.map((line, i) => <Text key={i} style={small}>{line}</Text>)}
      {row.model?.map((line, i) => <Text key={i} style={[small, { color: line.startsWith('Counts') ? colors.green : colors.muted }]}>{line}</Text>)}
      {row.flags?.map((line, i) => <Text key={i} style={[small, { color: colors.red }]}>⚑ {line}</Text>)}
      {!!row.words?.length && <Words words={row.words} />}
      {row.insight && <InsightCard insight={row.insight} />}
    </View>
  </View>
}

function Words({ words }: { words: WordRef[] }) {
  const linked = words.filter(item => item.id)
  if (!linked.length) return null
  return <View style={[styles.row, { gap: 6 }]}>{linked.slice(0, 12).map(item => <Pill key={item.id} label={item.lemma} onPress={() => open({ word: item.id! })} />)}</View>
}

// Observation → interpretation → opportunity → decision → outcome, as far as each goes.
function InsightCard({ insight }: { insight: Insight }) {
  const stages: [string, string | undefined][] = [['Observed', insight.observation], ['Interpretation', insight.interpretation], ['Opportunity', insight.opportunity], ['Decision', insight.decision], ['Outcome', insight.outcome]]
  return <View style={{ marginTop: 4, padding: 12, gap: 6, borderRadius: 14, backgroundColor: colors.lime }}>
    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.green }}>{insight.label}{insight.acted === false ? ' · not acted on' : ''}</Text>
    {stages.filter(([, text]) => text).map(([label, text]) => <Text key={label} style={{ fontSize: 13, lineHeight: 19, color: colors.ink }}><Text style={{ fontWeight: '700' }}>{label}: </Text>{text}</Text>)}
    <Text style={[small, { fontSize: 11 }]}>Heuristic “{insight.rule}”</Text>
    {!!insight.words?.length && <Words words={insight.words} />}
  </View>
}

function EstimateLine({ label, estimate, prior }: { label: string; estimate: Estimate; prior: number }) {
  return <View style={{ gap: 4 }}>
    <Text style={{ fontSize: 15, color: colors.ink }}><Text style={{ fontWeight: '600' }}>{label}: {pct(estimate.p)}</Text> · likely {pct(estimate.low)} to {pct(estimate.high)}</Text>
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.line }}>
      <View style={{ position: 'absolute', left: `${estimate.low * 100}%`, width: `${Math.max(1, (estimate.high - estimate.low) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: colors.lime }} />
      <View style={{ position: 'absolute', left: `${estimate.p * 100}%`, width: 3, marginLeft: -1, height: 8, backgroundColor: colors.green }} />
    </View>
    <Text style={small}>{estimate.evidence ? `${estimate.evidence} answers’ worth of evidence, on top of a starting assumption of ${pct(prior)}` : `No evidence: only the starting assumption, ${pct(prior)}, from how common the word is`}</Text>
  </View>
}

// Evidence lines: the side shown first is said once above them when some don't record it.
function EvidenceList({ lines }: { lines: (EvidenceLine & { sessions?: string[] })[] }) {
  const unsided = lines.filter(line => !line.side && (line.kind === 'answer' || line.kind === 'result')).length
  return <View style={{ gap: 8 }}>
    {unsided > 0 && <Text style={small}>{unsided} of these {unsided === 1 ? 'answer doesn’t' : 'answers don’t'} record which side was shown first.</Text>}
    {lines.map((line, i) => <View key={i} style={{ gap: 2 }}>
      <Text style={{ fontSize: 14, lineHeight: 20, color: line.weight ? colors.ink : colors.muted }}>{line.text}{line.side ? `, ${line.side}` : ''}</Text>
      <Text style={small}>{whenOf(line)} · {line.weight ? `${line.knew ? 'for' : 'against'}, weight ${line.weight}` : 'noted, not counted'}</Text>
      {line.sessions?.map(session => <TextButton key={session} title="Open the session" color={colors.green} onPress={() => open({ session })} />)}
    </View>)}
  </View>
}

function WordView({ id }: { id: string }) {
  const { data, error, load } = useInsights<Trace>(`insights?word=${encodeURIComponent(id)}`)
  if (!data) return <Page>{error ? <ErrorNotice message={error} /> : <Loading />}</Page>
  const { word, knowledge, importance, scheduling } = data
  return <Page onRefresh={load}>
    <ErrorNotice message={error} />
    <View style={{ gap: 4 }}>
      <Text style={[styles.hebrew, { textAlign: 'left', writingDirection: 'auto' }]}>{word.lemma}</Text>
      <Text style={small}>{[word.gloss, word.partOfSpeech, word.saved ? 'saved' : 'not saved'].filter(Boolean).join(' · ')}</Text>
    </View>
    <View style={styles.card}>
      <Text style={styles.heading}>What Mila thinks you know</Text>
      {knowledge ? <>
        <EstimateLine label="Recognizing it, Hebrew first" estimate={knowledge.recognition} prior={knowledge.prior.recognition} />
        <EstimateLine label="Producing it, English first" estimate={knowledge.production} prior={knowledge.prior.production} />
        <Text style={small}>{knowledge.answers} answers · {knowledge.band}</Text>
        <Text style={[styles.label, { marginBottom: 0 }]}>Evidence, newest first</Text>
        <EvidenceList lines={knowledge.evidence} />
      </> : <Text style={styles.copy}>No evidence or estimate for this word.</Text>}
    </View>
    <View style={styles.card}>
      <Text style={styles.heading}>How important it seems</Text>
      <Text style={styles.copy}>{importance.rankText}{importance.themes.length ? ` · ${importance.themes.join(', ')}` : ''}{importance.register ? ` · ${importance.register}` : ''}</Text>
      <Text style={styles.copy}>Saved from {importance.saves} {importance.saves === 1 ? 'sentence' : 'sentences'} · looked up again {importance.lookedUpAgain} times · met {importance.readTimes} times in what you’ve read, in {importance.readTexts} passages</Text>
      <Text style={small}>Separate from what you know: how often the word comes up, in Hebrew and in your reading.</Text>
    </View>
    {scheduling && <View style={styles.card}>
      <Text style={styles.heading}>When Study brings it</Text>
      {scheduling.cards.map(card => <Text key={card.key} style={styles.copy}>{card.label}: {card.state}{card.results.length ? ` · ${card.results.map(knew => (knew ? '✓' : '✗')).join(' ')}` : ''}{card.last ? ` · ${when(card.last)}` : ''}</Text>)}
      {scheduling.known.length > 0 && <Text style={styles.copy}>Marked known: {scheduling.known.join(', ')}</Text>}
      <Text style={small}>{scheduling.lastShown ? `Last shown ${when(scheduling.lastShown.at)}: ${scheduling.lastShown.why ?? 'reason not recorded'}` : 'Not shown in Study yet'}. Study’s own rules decide this from the last answers on each card, not the estimates above.</Text>
    </View>}
    {data.surprises.length > 0 && <View style={styles.card}>
      <Text style={styles.heading}>Where the model was wrong</Text>
      {data.surprises.map(item => <Surprise key={item.answer} item={item} />)}
    </View>}
    {data.related.length > 0 && <View style={styles.card}>
      <Text style={styles.heading}>Related words</Text>
      <Text style={small}>Shown for context; their evidence isn’t shared.</Text>
      {data.related.map(item => <Pressy key={item.id} moment="tick" onPress={() => open({ word: item.id })}><Text style={styles.copy}>{item.lemma} · {item.why}</Text></Pressy>)}
    </View>}
  </Page>
}

const history = (item: Prediction) => (item.cardAnswers ? `${pct(item.cardSoFar)} from ${item.cardAnswers} ${item.cardAnswers === 1 ? 'answer' : 'answers'}` : 'no answers yet, 50% by default')
function Surprise({ item, link }: { item: Prediction; link?: boolean }) {
  const body = <View style={{ gap: 4 }}>
    <Text style={{ fontSize: 15, color: colors.ink }}><Text style={{ fontWeight: '600' }}>{item.lemma}</Text> · {item.channel === 'either' ? 'side not recorded' : item.channel} · {when(item.at)}</Text>
    <Text style={small}>Expected {pct(item.p)}, {item.knew ? 'knew it' : 'missed it'}. Card history: {history(item)}.</Text>
    {item.evidence.length ? <EvidenceList lines={item.evidence} /> : <Text style={small}>Only the starting assumption, from how common the word is.</Text>}
  </View>
  return link ? <Pressy moment="tick" accessibilityRole="button" onPress={() => open({ word: item.wordId })}>{body}</Pressy> : body
}

function ModelChecks() {
  const { data, error, load } = useInsights<Checks>('insights?checks=1')
  if (!data) return <Page>{error ? <ErrorNotice message={error} /> : <Loading />}</Page>
  const rows: [string, number][] = [['Learner model', data.loss.model], ['The card’s own history', data.loss.card], [`Always ${pct(data.rate)}, the overall rate`, data.loss.base]]
  const best = Math.min(...rows.map(([, value]) => value))
  const channels = [...new Set(data.calibration.map(item => item.channel))]
  const cell = { fontSize: 13, color: colors.ink, width: 52, textAlign: 'right' as const }
  return <Page onRefresh={load}>
    <ErrorNotice message={error} />
    <View style={styles.card}>
      <Text style={styles.heading}>Predictions, last {data.days} days</Text>
      <Text style={styles.copy}>Each answer predicted again from only what Mila knew just before it ({data.version}). {data.answers} answers, {data.right} right, {pct(data.rate)}; the model expected {pct(data.expected)} on average.</Text>
      <Text style={styles.label}>Log loss, lower is better</Text>
      {rows.map(([label, value]) => <View key={label} style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
        <Text style={[styles.copy, { flex: 1, fontSize: 15, color: value === best ? colors.green : colors.muted }]}>{label}</Text>
        <Text style={[styles.copy, { fontSize: 15, color: value === best ? colors.green : colors.ink, fontWeight: value === best ? '700' : '400' }]}>{value.toFixed(3)}</Text>
      </View>)}
      <Text style={small}>The overall rate is taken from these same answers, so it has a small head start.</Text>
      {data.unpredicted > 0 && <Text style={small}>{data.unpredicted} answers still being worked out: pull to refresh.</Text>}
    </View>
    <View style={styles.card}>
      <Text style={styles.heading}>Predicted and actual</Text>
      <Text style={small}>Answers grouped by what the model predicted: how many were right, and what card history said.</Text>
      {channels.map(channel => <View key={channel} style={{ gap: 4 }}>
        <Text style={[styles.label, { marginBottom: 0 }]}>{CHANNELS[channel] ?? channel}</Text>
        <View style={{ flexDirection: 'row' }}>
          <Text style={[small, { flex: 1 }]}>Predicted</Text>
          {['Answers', 'Model', 'Right', 'Card'].map(label => <Text key={label} style={[small, { width: 52, textAlign: 'right' }]}>{label}</Text>)}
        </View>
        {data.calibration.filter(item => item.channel === channel).map(item => <View key={item.range} style={{ flexDirection: 'row' }}>
          <Text style={[cell, { flex: 1, textAlign: 'left' }]}>{item.range}</Text>
          <Text style={cell}>{item.n}</Text>
          <Text style={cell}>{pct(item.predicted)}</Text>
          <Text style={[cell, { fontWeight: '700', color: Math.abs(item.actual - item.predicted) > 0.15 && item.n >= 5 ? colors.red : colors.ink }]}>{pct(item.actual)}</Text>
          <Text style={cell}>{pct(item.card)}</Text>
        </View>)}
      </View>)}
      <Text style={small}>Red: off by more than 15 points, in a group of 5 or more answers.</Text>
    </View>
    <View style={styles.card}>
      <Text style={styles.heading}>Confident and wrong ({data.surprises.length})</Text>
      <Text style={small}>Answers the model put at 75% or more and you missed, or at 25% or less and you knew. Tap one for the word’s evidence.</Text>
      {data.surprises.map(item => <Surprise key={item.answer} item={item} link />)}
    </View>
    <View style={styles.card}>
      <Text style={styles.heading}>How sure the data is</Text>
      {data.data.map(item => <View key={item.label} style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
        <Text style={[styles.copy, { flex: 1, fontSize: 14, lineHeight: 20 }]}>{item.label}</Text>
        <Text style={[styles.copy, { color: colors.ink }]}>{item.value}{item.of !== undefined ? ` of ${item.of}` : ''}</Text>
      </View>)}
    </View>
  </Page>
}

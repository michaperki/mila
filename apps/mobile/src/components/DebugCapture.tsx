import { useEffect, useState } from 'react'
import { Platform, Switch, Text, View } from 'react-native'
import { Button, colors, ErrorNotice, styles } from './ui'
import { describeVersion } from '../lib/app-info'
import { captureNow, onCaptureChange, startCapture, stopCapture } from '../lib/trace'
import type { Session } from '../lib/types'

// Account → Debug capture, for the developers only (the server answers ADMIN_EMAILS and no one
// else): start a capture, use Reader or Study as usual, and open it on a laptop at /debug.html.
// "Exact AI prompts" also keeps each request to the model as it was sent; without it a capture is
// metadata only (lib/trace.ts).
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
export function DebugCapture({ session }: { session: Session }) {
  const [now, setNow] = useState(captureNow())
  const [prompts, setPrompts] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => onCaptureChange(() => setNow(captureNow())), [])
  const run = (work: () => Promise<unknown>) => {
    setBusy(true); setError(null)
    void work().catch((failure: Error) => setError(failure.message)).finally(() => { setBusy(false); setNow(captureNow()) })
  }
  return <View style={styles.card}>
    <Text style={styles.heading}>Debug capture</Text>
    <Text style={styles.copy}>Records what Mila does behind the scenes while you use it: each screen state, tap, request, database step and AI call, with timings. Open it on a laptop at mila-hebrew.netlify.app/debug.html. Only you see this, as a developer.</Text>
    <ErrorNotice message={error} />
    {now ? <>
      <Text style={[styles.copy, { color: colors.ink }]}>Capturing since {clock(now.startedAt)} · {now.id}{now.prompts ? ' · with exact AI prompts' : ''}</Text>
      <Text style={[styles.copy, { fontSize: 13 }]}>{now.sent} sent{now.waiting ? `, ${now.waiting} waiting` : ''}. It stops by itself after two hours.</Text>
      <Button title="Stop capture" busy={busy} onPress={() => run(() => stopCapture(session.token))} />
    </> : <>
      <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap', gap: 12 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.heading, { fontSize: 16 }]}>Exact AI prompts</Text>
          <Text style={[styles.copy, { fontSize: 13 }]}>Also keep each request to the AI as it was sent, including your words and sentences. Off: names, timings and sizes only.</Text>
        </View>
        <Switch value={prompts} onValueChange={setPrompts} trackColor={{ true: colors.green }} accessibilityLabel="Exact AI prompts" />
      </View>
      <Button title="Start capture" busy={busy} onPress={() => run(() => startCapture(session.token, prompts, `${Platform.OS} · ${describeVersion()}`))} />
    </>}
  </View>
}

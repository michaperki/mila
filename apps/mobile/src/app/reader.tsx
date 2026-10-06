import { useCallback, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import * as Crypto from 'expo-crypto'
import * as Speech from 'expo-speech'
import { Button, colors, ErrorNotice, Page, styles } from '../components/ui'
import { request } from '../lib/api'
import { documentFromRecognition } from '../lib/documents'
import { translate } from '../lib/recognition'
import { useSession } from '../state/session'
export default function Reader() {
  const { recognition, session } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [word, setWord] = useState<string | null>(null)
  const [gloss, setGloss] = useState('')
  const [wordBusy, setWordBusy] = useState(false)
  const [wordSaved, setWordSaved] = useState(false)
  const selection = useRef(0)
  useFocusEffect(useCallback(() => () => { selection.current++; void Speech.stop() }, []))
  const docId = useRef(Crypto.randomUUID())
  if (!recognition) return <Page><Text style={styles.title}>Find something to read.</Text><Button title="Open camera" onPress={() => router.replace('/')} /></Page>
  const save = async () => {
    if (!session) { router.push('/login'); return }
    if (busy) return
    setBusy(true); setError(null)
    try { const doc = documentFromRecognition(recognition, docId.current); await request('texts', { token: session.token, body: { ...doc, textId: doc.id } }); setSaved(true) }
    catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }
  const selectWord = async (surface: string) => {
    const chosen = surface.replace(/^[\s.,!?;:״"()]+|[\s.,!?;:״"()]+$/g, '')
    if (!chosen) return
    const version = ++selection.current
    setWord(chosen); setGloss(''); setWordSaved(false); setWordBusy(true); setError(null)
    try { const value = await translate(chosen); if (selection.current === version) setGloss(value) }
    catch (failure) { if (selection.current === version) setError((failure as Error).message) }
    finally { if (selection.current === version) setWordBusy(false) }
  }
  const saveWord = async () => {
    if (!session) { router.push('/login'); return }
    if (!word || !gloss || busy) return
    setBusy(true); setError(null)
    try {
      await request('vocab', { token: session.token, body: { id: `native-${encodeURIComponent(word)}`, lemma: word, gloss, createdAt: Date.now(), frequency: 1 } })
      setWordSaved(true)
    } catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }
  return <Page><Text style={styles.eyebrow}>TAKE A CLOSER LOOK</Text><Text style={styles.title}>Read. Notice. Remember.</Text>
    <View style={styles.card}><Text style={styles.copy}>Tap a Hebrew word to explore it.</Text><View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 5 }}>
      {recognition.text.split(/\s+/).filter(Boolean).map((surface, i) => <Pressable key={`${i}-${surface}`} accessibilityRole="button" accessibilityLabel={`Translate ${surface}`} onPress={() => void selectWord(surface)} style={{ borderRadius: 8, paddingHorizontal: 4, backgroundColor: word === surface ? colors.lime : 'transparent' }}><Text style={styles.hebrew}>{surface}</Text></Pressable>)}
    </View></View>
    <View style={styles.card}><Text style={styles.eyebrow}>ENGLISH</Text><Text selectable style={[styles.copy, { color: colors.ink }]}>{recognition.translation || 'This saved passage has no translation.'}</Text></View>
    {word && <View style={styles.card}><Text style={styles.hebrew}>{word}</Text><Text style={styles.copy}>{wordBusy ? 'Looking up this word…' : gloss}</Text><Text style={[styles.copy, { fontSize: 13 }]}>Word translation may differ from its meaning in the sentence.</Text><Button secondary title={wordSaved ? 'Saved to vocabulary' : 'Save word'} disabled={wordBusy || !gloss || wordSaved || busy} onPress={() => void saveWord()} /></View>}
    <ErrorNotice message={error} /><Button title={saved ? 'Saved to library' : 'Save passage'} disabled={saved} busy={busy} onPress={() => void save()} />
    <Button secondary title="Listen in Hebrew" onPress={() => { void Speech.stop(); Speech.speak(recognition.text, { language: 'he-IL', rate: 0.8 }) }} />
  </Page>
}

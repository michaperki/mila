import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import { router, useFocusEffect } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { AccountGate, Button, colors, ErrorNotice, Page, styles } from '../../components/ui'
import { FeedbackButton } from '../../components/Feedback'
import { useSession } from '../../state/session'
import { recognizeImage } from '../../lib/recognition'
import { createLiveSession, skip } from '../../lib/live-session'
import { getPref, setPref } from '../../lib/prefs'
import type { Recognition } from '../../lib/types'

export default function Camera() {
  const { session, setRecognition } = useSession()
  const [permission, askPermission] = useCameraPermissions()
  const camera = useRef<CameraView>(null)
  const [focused, setFocused] = useState(false)
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  const [cameraReady, setCameraReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const locked = useRef(false)
  const [live, setLive] = useState(false)
  const [result, setResult] = useState<Recognition | null>(null)
  const [message, setMessage] = useState('Point at a short Hebrew passage.')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState(false)
  const liveSession = useRef<{ stop: () => void } | null>(null)
  const userStopped = useRef(false)
  const requestController = useRef<AbortController | null>(null)
  const cancel = useCallback(() => {
    liveSession.current?.stop(); liveSession.current = null
    requestController.current?.abort()
    setLive(false); setBusy(false); setResult(null); setCameraReady(false)
  }, [])
  useFocusEffect(useCallback(() => {
    setFocused(true)
    return () => { setFocused(false); cancel() }
  }, [cancel]))
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setForeground(state === 'active')
      if (state !== 'active') cancel()
    })
    return () => subscription.remove()
  }, [cancel])
  const present = (value: Recognition) => {
    setResult(value.text ? value : null)
    setMessage(value.text ? 'Translation of the last sampled image.' : 'No text found. Move closer and hold steady.')
  }
  const sample = async (signal: AbortSignal) => {
    if (!camera.current || !session || locked.current) throw new Error('Camera is not ready yet.')
    locked.current = true; setBusy(true); setResult(null); setMessage('Reading Hebrew…')
    try {
      const picture = await camera.current.takePictureAsync({ quality: 0.65, shutterSound: false })
      if (signal.aborted) throw new Error('Canceled')
      if (!picture) throw new Error('The camera could not capture this passage. Try again.')
      return await recognizeImage(picture.uri, picture.width, picture.height, session.token, signal)
    } finally { locked.current = false; if (!signal.aborted) setBusy(false) }
  }
  const capture = async () => {
    if (locked.current || !session) return
    const controller = new AbortController(); requestController.current = controller
    setError(null); setCapturing(true)
    try {
      const value = await sample(controller.signal)
      if (controller.signal.aborted) return
      present(value)
      if (value.text) { setRecognition(value); router.push('/reader') }
    } catch (failure) { if (!controller.signal.aborted) setError((failure as Error).message) }
    finally { setCapturing(false) }
  }
  const startLive = () => {
    if (live || locked.current) return
    setError(null); setResult(null); setLive(true)
    liveSession.current = createLiveSession({
      // A manual capture holds the same camera lock; skip this tick rather than
      // failing the whole live session when the two collide.
      sample: signal => (locked.current ? Promise.reject(skip) : sample(signal)),
      onResult: present,
      onError: failure => setError(failure.message),
      onStop: () => {
        setLive(false); setBusy(false)
        setMessage(userStopped.current ? 'Point at a short Hebrew passage.' : 'Live preview paused to save battery. Tap Live to resume.')
        userStopped.current = false
      },
    })
  }
  const toggleLive = () => {
    // The choice is remembered: live preview only auto-starts for people who turned it on.
    if (live) { userStopped.current = true; liveSession.current?.stop(); setPref('livePreview', false) }
    else { setPref('livePreview', true); startLive() }
  }
  useEffect(() => {
    // Fires only when the camera transitions to ready, not on every render —
    // startLive's own `live`/`locked` guards cover re-entry, and re-running this
    // on unrelated re-renders would silently restart a session the budget below
    // (or the user) had deliberately stopped.
    if (cameraReady) void getPref('livePreview').then(on => { if (on) startLive() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraReady])
  const importPhoto = async () => {
    if (live) { userStopped.current = true; liveSession.current?.stop() }
    if (locked.current || !session) return
    setError(null)
    try {
      const selected = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 })
      if (selected.canceled) return
      const controller = new AbortController(); requestController.current = controller
      const image = selected.assets[0]
      locked.current = true; setBusy(true); setResult(null)
      try {
        const value = await recognizeImage(image.uri, image.width, image.height, session.token, controller.signal)
        if (controller.signal.aborted) return
        present(value)
        if (value.text) { setRecognition(value); router.push('/reader') }
      } finally { locked.current = false; if (!controller.signal.aborted) setBusy(false) }
    } catch (failure) { if (!requestController.current?.signal.aborted) setError((failure as Error).message) }
  }

  if (!session) return <Page>
    <Text style={styles.eyebrow}>FROM SEEING TO UNDERSTANDING</Text><Text style={styles.title}>Hebrew, in focus.</Text>
    <AccountGate />
  </Page>

  if (!permission?.granted) return <Page>
    <Text style={styles.eyebrow}>FROM SEEING TO UNDERSTANDING</Text><Text style={styles.title}>Hebrew, in focus.</Text>
    <View style={styles.card}><Text style={styles.heading}>Look at the world in Hebrew</Text><Text style={styles.copy}>Allow camera access to point at text. You can also choose a photo.</Text><Button title={permission?.canAskAgain === false ? 'Open camera settings' : 'Enable camera'} onPress={() => { void (permission?.canAskAgain === false ? Linking.openSettings() : askPermission()) }} /></View>
    <Button secondary title="Choose a photo" onPress={() => void importPhoto()} />
    <Button secondary title="Paste Hebrew text" onPress={() => router.push('/compose')} />
  </Page>

  // Full-bleed viewfinder: the shutter and live-preview controls float over the
  // camera feed so they stay reachable without scrolling the page out of frame.
  return <View style={cameraStyles.page}>
    {focused && foreground && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setCameraReady(true)} onMountError={() => { setCameraReady(false); setError('The camera could not start. Try reopening this screen.') }} />}
    <View pointerEvents="none" style={cameraStyles.guide} />

    <Pressable accessibilityRole="switch" accessibilityLabel="Live preview" accessibilityState={{ checked: live }} disabled={!cameraReady || (!live && busy)} onPress={toggleLive} style={[cameraStyles.livePill, live && cameraStyles.livePillOn]}>
      <View style={[cameraStyles.liveDot, live && { backgroundColor: colors.lime }]} />
      <Text style={cameraStyles.livePillText}>{live ? 'Live on' : 'Live off'}</Text>
    </Pressable>
    <View style={cameraStyles.topRight}>
      <FeedbackButton variant="overlay" screen="camera" context={() => ({ message, error, live, result: result && { raw: result.raw, segments: result.segments } })} />
      <Pressable accessibilityRole="button" accessibilityLabel="About camera translation" onPress={() => setInfo(value => !value)} style={cameraStyles.infoButton}>
        <Ionicons name="information-circle-outline" size={22} color={colors.white} />
      </Pressable>
    </View>
    {info && <View style={cameraStyles.infoCard}>
      <Text style={cameraStyles.infoText}>Photos you translate are sent to Google for recognition and are not stored by Mila. Live preview is off until you turn it on. It reads up to 6 images over 30 seconds, then pauses to save battery.</Text>
      <Button secondary title="Got it" onPress={() => setInfo(false)} />
    </View>}

    <View style={cameraStyles.bottomBar}>
      <ErrorNotice message={error} />
      <View style={[styles.row, { gap: 8, flexWrap: 'nowrap' }]}>
        {busy && <ActivityIndicator size="small" color={colors.white} />}
        <Text accessibilityLiveRegion="polite" numberOfLines={2} style={[cameraStyles.message, { flex: 1 }]}>{message}</Text>
      </View>
      {result && <View style={cameraStyles.resultCard}>
        <Text style={cameraStyles.hebrewCompact} numberOfLines={2}>{result.text}</Text>
        <Text style={cameraStyles.translationCompact} numberOfLines={2}>{result.translation}</Text>
        <Button title="Read this passage" onPress={() => { userStopped.current = true; liveSession.current?.stop(); setRecognition(result); router.push('/reader') }} />
      </View>}
      <View style={cameraStyles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose a photo" disabled={busy && !live} onPress={() => void importPhoto()} style={cameraStyles.sideButton}>
          <Ionicons name="images-outline" size={24} color={colors.white} /><Text style={cameraStyles.sideLabel}>Photo</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Capture" accessibilityState={{ disabled: !cameraReady || capturing, busy: capturing }} disabled={!cameraReady || capturing} onPress={() => void capture()} style={({ pressed }) => [cameraStyles.shutter, (!cameraReady || pressed) && { opacity: 0.6 }]}>
          {capturing ? <ActivityIndicator color={colors.green} /> : <View style={cameraStyles.shutterInner} />}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Paste Hebrew text" onPress={() => router.push('/compose')} style={cameraStyles.sideButton}>
          <Ionicons name="clipboard-outline" size={24} color={colors.white} /><Text style={cameraStyles.sideLabel}>Paste</Text>
        </Pressable>
      </View>
    </View>
  </View>
}
const cameraStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#142621' },
  guide: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, margin: 16, borderWidth: 1, borderColor: '#FFFFFF66', borderRadius: 16 },
  livePill: { position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#00000066' },
  livePillOn: { backgroundColor: '#145C4BDD' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF88' },
  livePillText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  topRight: { position: 'absolute', top: 16, right: 16, flexDirection: 'row', gap: 10 },
  infoButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center' },
  infoCard: { position: 'absolute', top: 60, right: 16, left: 16, backgroundColor: colors.white, borderRadius: 16, padding: 16, gap: 12 },
  infoText: { fontSize: 14, lineHeight: 21, color: colors.muted },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 20, gap: 12, backgroundColor: '#0E1E1AB3', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.white },
  sideButton: { width: 64, alignItems: 'center', gap: 4, paddingVertical: 6 },
  sideLabel: { color: colors.white, fontSize: 12, fontWeight: '600' },
  message: { color: colors.white, fontSize: 14, lineHeight: 20 },
  resultCard: { padding: 14, borderRadius: 16, backgroundColor: colors.white, gap: 8 },
  hebrewCompact: { fontSize: 20, lineHeight: 28, textAlign: 'right', writingDirection: 'rtl', color: colors.ink },
  translationCompact: { fontSize: 14, lineHeight: 20, color: colors.muted },
})

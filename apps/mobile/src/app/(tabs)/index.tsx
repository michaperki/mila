import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Linking, StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import { router, useFocusEffect } from 'expo-router'
import { AccountGate, Button, colors, ErrorNotice, Page, styles } from '../../components/ui'
import { useSession } from '../../state/session'
import { recognizeImage } from '../../lib/recognition'
import { createLiveSession } from '../../lib/live-session'
import type { Recognition } from '../../lib/types'

export default function Camera() {
  const { session, setRecognition } = useSession()
  const [permission, askPermission] = useCameraPermissions()
  const camera = useRef<CameraView>(null)
  const [focused, setFocused] = useState(false)
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  const [cameraReady, setCameraReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const [live, setLive] = useState(false)
  const [result, setResult] = useState<Recognition | null>(null)
  const [message, setMessage] = useState('Point at a short Hebrew passage.')
  const [error, setError] = useState<string | null>(null)
  const liveSession = useRef<{ stop: () => void } | null>(null)
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
    setError(null)
    try {
      const value = await sample(controller.signal)
      if (controller.signal.aborted) return
      present(value)
      if (value.text) { setRecognition(value); router.push('/reader') }
    } catch (failure) { if (!controller.signal.aborted) setError((failure as Error).message) }
  }
  const startLive = () => {
    if (live || locked.current) return
    setError(null); setResult(null); setLive(true)
    liveSession.current = createLiveSession({ sample, onResult: present,
      onError: failure => setError(failure.message),
      onStop: () => { setLive(false); setBusy(false); setMessage('Preview stopped. Tap Read this passage or start again.') },
    })
  }
  const importPhoto = async () => {
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
  return <Page>
    <Text style={styles.eyebrow}>FROM SEEING TO UNDERSTANDING</Text><Text style={styles.title}>Hebrew, in focus.</Text>
    {!session ? <AccountGate /> : <>
      {permission?.granted ? <View style={cameraStyles.frame}>
        {focused && foreground && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setCameraReady(true)} onMountError={() => { setCameraReady(false); setError('The camera could not start. Try reopening this screen.') }} />}
        <View pointerEvents="none" style={cameraStyles.guide}><Text style={cameraStyles.guideText}>HEBREW → ENGLISH</Text></View>
      </View> : <View style={styles.card}><Text style={styles.heading}>Look at the world in Hebrew</Text><Text style={styles.copy}>Allow camera access to point at text. You can also choose a photo.</Text><Button title={permission?.canAskAgain === false ? 'Open camera settings' : 'Enable camera'} onPress={() => { void (permission?.canAskAgain === false ? Linking.openSettings() : askPermission()) }} /></View>}
      <Text style={styles.copy}>Photos you translate are sent to Google for recognition. Live preview samples up to 6 images over 30 seconds.</Text>
      <ErrorNotice message={error} />
      <View style={styles.row}><Button title={live ? 'Stop preview' : 'Live preview · beta'} secondary disabled={!cameraReady || (!live && busy)} onPress={() => { if (live) liveSession.current?.stop(); else startLive() }} style={{ flex: 1 }} /><Button title="Capture" disabled={!cameraReady || live} busy={busy && !live} onPress={() => void capture()} style={{ flex: 1 }} /></View>
      <Text accessibilityLiveRegion="polite" style={styles.copy}>{message}</Text>
      {result && <View style={styles.card}><Text style={styles.eyebrow}>LAST SCAN · {new Date(result.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</Text><Text style={styles.hebrew} numberOfLines={4}>{result.text}</Text><Text style={styles.copy}>{result.translation}</Text><Button title="Read this passage" onPress={() => { liveSession.current?.stop(); setRecognition(result); router.push('/reader') }} /></View>}
      <Button secondary title="Choose a photo" disabled={busy || live} onPress={() => void importPhoto()} />
    </>}
    <Button secondary title="Paste Hebrew text" disabled={busy || live} onPress={() => router.push('/compose')} />
  </Page>
}
const cameraStyles = StyleSheet.create({ frame: { height: 290, borderRadius: 24, overflow: 'hidden', backgroundColor: '#142621' }, guide: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, margin: 24, borderWidth: 1, borderColor: '#FFFFFF88', borderRadius: 14, justifyContent: 'flex-end', padding: 12 }, guideText: { alignSelf: 'flex-start', color: colors.white, fontSize: 11, letterSpacing: 2, fontWeight: '700', backgroundColor: '#14262199', padding: 8, borderRadius: 8 } })

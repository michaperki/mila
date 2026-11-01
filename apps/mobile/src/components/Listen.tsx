import { useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { colors, Pressy } from './ui'
import { feel } from '../lib/feedback'
import { setRate, setVoice, speak, stop, useSpeech, type Voice, VOICES } from '../lib/speech'
import { nextRate, rateLabel } from '../lib/speech-text'
import { useSession } from '../state/session'

// Play/stop for Hebrew read aloud, with the speed chip beside it (1× → ½× → ¼×, one setting
// for the whole app). `text` may be a list of sentences, read in order. A long press offers the
// two voices: choosing one makes it the voice everywhere (as in Account) and reads the text in it
// at once. The voice in use is the small letter at the speaker's corner.
export function ListenButton({ text, accessibilityLabel, size = 22, speed = true }: { text: string | string[]; accessibilityLabel: string; size?: number; speed?: boolean }) {
  const { session } = useSession()
  const { playing, loading, rate, voice } = useSpeech()
  const key = Array.isArray(text) ? text.join(' ') : text
  const on = playing === key
  const press = () => { void speak(text, session?.token, key) }
  const button = useRef<View>(null)
  // Where the button is on screen while the voices are offered.
  const [offer, setOffer] = useState<{ x: number; y: number; height: number } | null>(null)
  const offerVoices = () => {
    // Only the recorded voices can be chosen; signed out, the phone's own voice reads.
    if (!session) return
    feel('select')
    button.current?.measureInWindow((x, y, _width, height) => setOffer({ x, y, height }))
  }
  const choose = (chosen: Voice) => {
    setOffer(null)
    setVoice(chosen)
    stop()
    void speak(text, session?.token, key)
  }
  const icon = on ? 'stop-circle-outline' : 'volume-medium-outline'
  return <>
    <Pressable ref={button} accessibilityRole="button" accessibilityLabel={on ? 'Stop' : accessibilityLabel}
      accessibilityHint={session ? `Reads in ${VOICES.find(item => item.id === voice)?.name}; long press to choose the voice` : undefined}
      onPress={press} onLongPress={offerVoices} delayLongPress={350} hitSlop={10}
      style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      {on && loading ? <ActivityIndicator size="small" color={colors.green} /> : <Ionicons name={icon} size={size} color={colors.green} />}
      {session && !(on && loading) && <Text style={listen.badge} accessibilityElementsHidden importantForAccessibility="no">{voice === 'charon' ? 'C' : 'S'}</Text>}
    </Pressable>
    {speed && <Pressy moment="tick" depth={0.94} accessibilityRole="button" accessibilityLabel={`Speed ${rate === 1 ? 'normal' : rate === 0.5 ? 'half' : 'quarter'}. Change`} onPress={() => setRate(nextRate(rate))} hitSlop={8}
      style={{ minWidth: 34, height: 26, paddingHorizontal: 6, borderRadius: 13, borderWidth: 1, borderColor: rate === 1 ? colors.line : colors.green, backgroundColor: rate === 1 ? colors.white : colors.lime, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.green, fontVariant: ['tabular-nums'] }}>{rateLabel(rate)}</Text>
    </Pressy>}
    {offer && <VoiceChoice at={offer} voice={voice} onChoose={choose} onClose={() => setOffer(null)} />}
  </>
}

// The two voices in a small card by the button, above it if there is room, the one in use ticked.
function VoiceChoice({ at, voice, onChoose, onClose }: { at: { x: number; y: number; height: number }; voice: Voice; onChoose: (voice: Voice) => void; onClose: () => void }) {
  const { width, height } = useWindowDimensions()
  const cardWidth = 220, cardHeight = 116
  const left = Math.min(Math.max(12, at.x - cardWidth / 2), width - cardWidth - 12)
  const top = at.y - cardHeight - 8 > 40 ? at.y - cardHeight - 8 : Math.min(at.y + at.height + 8, height - cardHeight - 12)
  return <Modal transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} />
    <View style={[listen.card, { left, top, width: cardWidth }]} accessibilityViewIsModal>
      {VOICES.map(item => <Pressy key={item.id} moment="select" accessibilityRole="radio" accessibilityState={{ checked: item.id === voice }} accessibilityLabel={`${item.name}, ${item.detail}`}
        onPress={() => onChoose(item.id)} style={[listen.option, item.id === voice && { backgroundColor: colors.lime }]}>
        <View style={{ flex: 1 }}>
          <Text style={listen.name}>{item.name}</Text>
          <Text style={listen.detail}>{item.detail}</Text>
        </View>
        {item.id === voice && <Ionicons name="checkmark" size={18} color={colors.green} />}
      </Pressy>)}
    </View>
  </Modal>
}

const listen = StyleSheet.create({
  badge: { position: 'absolute', right: -3, bottom: -3, fontSize: 9, fontWeight: '800', color: colors.green, opacity: 0.7 },
  card: { position: 'absolute', padding: 6, gap: 4, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  detail: { fontSize: 12, color: colors.muted },
})

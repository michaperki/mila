import { ActivityIndicator, Pressable, Text } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { colors, Pill, Pressy } from './ui'
import { speak, setRate, useSpeech } from '../lib/speech'
import { nextRate, rateLabel } from '../lib/speech-text'
import { useSession } from '../state/session'

// Play/stop for Hebrew read aloud, with the speed chip beside it (1× → ½× → ¼×, one setting
// for the whole app). `text` may be a list of sentences, read in order. `pill` is the labelled
// form used in the reader's toolbar.
export function ListenButton({ text, accessibilityLabel, size = 22, pill, speed = true }: { text: string | string[]; accessibilityLabel: string; size?: number; pill?: boolean; speed?: boolean }) {
  const { session } = useSession()
  const { playing, loading, rate } = useSpeech()
  const key = Array.isArray(text) ? text.join(' ') : text
  const on = playing === key
  const press = () => { void speak(text, session?.token, key) }
  const icon = on ? 'stop-circle-outline' : 'volume-medium-outline'
  return <>
    {pill
      ? <Pill label={on ? 'Stop' : 'Listen'} icon={on && loading ? undefined : icon} leading={on && loading ? <ActivityIndicator size="small" color={colors.green} /> : undefined}
        active={on} onPress={press} accessibilityLabel={on ? 'Stop listening' : accessibilityLabel} />
      : <Pressable accessibilityRole="button" accessibilityLabel={on ? 'Stop' : accessibilityLabel} onPress={press} hitSlop={10}
        style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
        {on && loading ? <ActivityIndicator size="small" color={colors.green} /> : <Ionicons name={icon} size={size} color={colors.green} />}
      </Pressable>}
    {speed && <Pressy moment="tick" depth={0.94} accessibilityRole="button" accessibilityLabel={`Speed ${rate === 1 ? 'normal' : rate === 0.5 ? 'half' : 'quarter'}. Change`} onPress={() => setRate(nextRate(rate))} hitSlop={8}
      style={{ minWidth: 34, height: 26, paddingHorizontal: 6, borderRadius: 13, borderWidth: 1, borderColor: rate === 1 ? colors.line : colors.green, backgroundColor: rate === 1 ? colors.white : colors.lime, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.green, fontVariant: ['tabular-nums'] }}>{rateLabel(rate)}</Text>
    </Pressy>}
  </>
}

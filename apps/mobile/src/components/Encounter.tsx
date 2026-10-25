import { type ReactNode, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from './ui'
import { isolateHebrew } from '../lib/bidi'
import { hebrewPieces } from '../lib/marks'
import type { Encounter } from '../lib/types'
import { withVowels } from '../lib/vowels'
import { useHebrew } from '../state/script'

// One place a saved word was met: the form on the page and what it meant there, then the
// sentence with the word marked (every word of an expression, even apart). A card shows the
// short excerpt; tapping shows the whole sentence.
export function EncounterView({ encounter, showVowels, footer }: { encounter: Encounter; showVowels: boolean; footer?: ReactNode }) {
  const he = useHebrew()
  const [whole, setWhole] = useState(false)
  const v = (text: string) => withVowels(text, showVowels)
  const short = !!encounter.excerpt && !whole
  const sentence = v((short ? encounter.excerpt : encounter.context) || '')
  const translation = short ? encounter.excerptTranslation : encounter.contextTranslation
  return <View style={encounterStyles.box}>
    <Text style={encounterStyles.line}>
      Met as <Text style={encounterStyles.hebrew}>{isolateHebrew(v(encounter.vocalized || encounter.surface))}</Text>
      {encounter.form ? ` · ${encounter.form}` : ''}{encounter.meaning ? ` · “${isolateHebrew(v(encounter.meaning))}”` : ''}
    </Text>
    <Pressable disabled={!encounter.excerpt} accessibilityRole={encounter.excerpt ? 'button' : undefined}
      accessibilityHint={encounter.excerpt ? (whole ? 'Shows the short excerpt' : 'Shows the whole sentence') : undefined}
      onPress={() => setWhole(value => !value)} style={{ gap: 4 }}>
      <Text style={[encounterStyles.sentence, he]}>{short ? '… ' : ''}{hebrewPieces(sentence, encounter.mark || encounter.surface).map((piece, i) =>
        <Text key={i} style={piece.marked ? encounterStyles.mark : undefined}>{piece.text}</Text>)}{short ? ' …' : ''}</Text>
      {!!translation && <Text style={encounterStyles.line}>{translation}</Text>}
    </Pressable>
    {footer}
  </View>
}

const encounterStyles = StyleSheet.create({
  box: { gap: 6, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  line: { fontSize: 14, lineHeight: 21, color: colors.muted, writingDirection: 'ltr', textAlign: 'left' },
  hebrew: { fontSize: 16, color: colors.ink },
  sentence: { fontSize: 19, lineHeight: 30, color: colors.ink, writingDirection: 'rtl', textAlign: 'right' },
  mark: { backgroundColor: colors.lime, fontWeight: '600' },
})

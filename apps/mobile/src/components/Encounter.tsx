import { type ReactNode, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from './ui'
import { isolateHebrew } from '../lib/bidi'
import { bareWord, stripNiqqud } from '../lib/ocr-cleanup'
import type { Encounter } from '../lib/types'
import { withVowels } from '../lib/vowels'

// One place a saved word was met: the form on the page and what it meant there, then the
// sentence with the word marked. A card shows the short excerpt; tapping shows the whole sentence.
export function EncounterView({ encounter, showVowels, footer }: { encounter: Encounter; showVowels: boolean; footer?: ReactNode }) {
  const [whole, setWhole] = useState(false)
  const v = (text: string) => withVowels(text, showVowels)
  const target = new Set(encounter.surface.split(/\s+/).map(token => stripNiqqud(bareWord(token))))
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
      <Text style={encounterStyles.sentence}>{short ? '… ' : ''}{sentence.split(/(\s+)/).map((token, i) =>
        <Text key={i} style={target.has(stripNiqqud(bareWord(token))) ? encounterStyles.mark : undefined}>{token}</Text>)}{short ? ' …' : ''}</Text>
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

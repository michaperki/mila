import { StyleSheet, Text, View } from 'react-native'
import { colors } from './ui'
import type { Construction } from '../lib/types'

// The constructions a word is used in, as small chips under it (בְּ־  אַחֲרֵי), in the order Hebrew
// reads, the most common on the right. Each chip stays on one line; chips wrap only when the row
// is full. `meanings` puts what the word means in each beneath it ("contemplate", "question"),
// for an answer side or the word's page; an optional preposition's chip has a dashed outline.
// Nothing is drawn for a word without constructions. `size` is the chips' font size, about half
// the word's above them; `align` 'start' sets them at the left, as in the reader's panel.
export function Constructions({ items, v, size = 19, meanings = false, align = 'center' }: {
  items: Construction[]; v: (text: string) => string; size?: number; meanings?: boolean; align?: 'center' | 'start'
}) {
  if (!items.length) return null
  return <View style={[box.row, { justifyContent: align === 'center' ? 'center' : 'flex-end' }]}>
    {items.map(item => <View key={item.pattern} accessible accessibilityLabel={`${item.chip}: ${item.meaning}`} style={box.item}>
      <View style={[box.chip, item.preposition === 'optional' && box.optional]}>
        <Text style={[box.text, { fontSize: size, lineHeight: Math.round(size * 1.45) }]} numberOfLines={1}>{v(item.chip)}</Text>
      </View>
      {meanings && <Text style={box.meaning} numberOfLines={2}>{item.short || item.meaning}</Text>}
    </View>)}
  </View>
}

const box = StyleSheet.create({
  // Right to left, so the first (most common) chip is on the right.
  row: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8, alignSelf: 'stretch' },
  item: { alignItems: 'center', gap: 2, maxWidth: 150 },
  chip: { paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.lime, borderWidth: 1, borderColor: colors.lime },
  optional: { backgroundColor: 'transparent', borderColor: colors.green, borderStyle: 'dashed' },
  text: { color: colors.green, fontWeight: '600', writingDirection: 'rtl', textAlign: 'center' },
  meaning: { fontSize: 12, lineHeight: 16, color: colors.muted, textAlign: 'center' },
})

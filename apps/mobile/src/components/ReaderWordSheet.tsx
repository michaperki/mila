import { useRef } from 'react'
import { ActivityIndicator, type LayoutChangeEvent, Pressable, ScrollView, type StyleProp, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from '../lib/nav'
import { ListenButton } from './Listen'
import { Button, colors, ErrorNotice, Pill, styles, TextButton } from './ui'
import { DraggableSheet } from './Motion'
import { Constructions } from './Constructions'
import { drawer, Section, UnitBox, WordFacts, type WordLookup } from './WordDrawer'
import { APPEAR } from '../lib/motion'
import { isolateHebrew } from '../lib/bidi'
import { stripNiqqud } from '../lib/ocr-cleanup'
import { plainSpelling } from '../lib/spelling'
import { useOffer } from '../lib/usage'
import { constructionsOf, patternLabel, tapKey } from '../lib/words'
import { useHebrew } from '../state/script'

// The reader's word sheet (2026-11-27): tap a word, hear it, see what it means in this sentence,
// and go on reading. Compact, it is the word, its meaning here, Listen, Save and Details, and keeps
// one size whatever arrives and whichever word is tapped next: the meaning has its place from the
// first frame (quietly empty for a short wait) and stays as first shown. Everything else (grammar,
// constructions, other senses, the expression a word belongs to, and the wait for them) is under
// Details, which asks for the word's explanation when opened; Save asks for it too, and saves the
// expression the word leads into if it does, saying so. Study keeps its own drawer (WordDrawer).
// `reading`: the word vowelled as said in this sentence, from the sentence's quick meanings.
export function ReaderWordSheet({ lookup, v, reading, style, onLayout, onClose, onPickWord }: {
  lookup: WordLookup; v: (text: string) => string; reading?: string; style?: StyleProp<ViewStyle>; onLayout?: (event: LayoutChangeEvent) => void
  onClose: () => void; onPickWord?: (offset: number) => void
}) {
  const he = useHebrew()
  const { height: screenHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const scroller = useRef<ScrollView>(null)
  const { tap, analysis, gloss, busy, isPhrase, phrase, isPattern, fillsPattern, leadPhrase, phraseIsWord, inYourWords, wordSaved, phraseSaved, saving, unsaving, details, meaningShown } = lookup
  // What Save keeps: the expression the word leads into, once the explanation says there is one.
  const unit = analysis && leadPhrase ? phrase : null
  const mainSaved = unit ? phraseSaved : wordSaved
  const drawerPick = useOffer('reader drawer', tap, [
    'close', 'listen', 'details', !isPhrase || unit ? (mainSaved ? 'undo save' : 'save') : null,
    details && !!inYourWords && 'in your words', details && leadPhrase && !phraseIsWord && !isPhrase && 'save just the word', details && fillsPattern && 'save the pattern',
    isPhrase && !!analysis && !phrase && !!onPickWord && 'pick a word', lookup.firstSave && (wordSaved || phraseSaved) && !saving.size && 'study now',
  ])
  if (!tap) return null
  const closing = () => { drawerPick('close'); onClose() }
  const sentence = tap.sentence
  const said = reading || analysis?.vocalized || tap.text
  const maxHeight = Math.min(screenHeight * 0.82, screenHeight - insets.top - 56)
  const toggleDetails = () => {
    if (!details) { drawerPick('details'); if (!analysis && !busy) void lookup.explain('details') }
    lookup.setDetails(value => !value)
  }
  // The expression as Save names it: its pattern (נָטוּל + …) or dictionary form.
  const unitName = unit ? isolateHebrew(v((isPattern && unit.pattern && patternLabel(unit.pattern)) || unit.lemma || unit.text)) : ''
  const kind = isPattern ? 'Pattern' : 'Expression'
  const saveTitle = mainSaved ? (unit ? `${kind} saved ✓` : 'Saved ✓')
    : inYourWords ? 'Add this example' : unit ? `Save ${kind.toLowerCase()}` : 'Save'
  const saveDetail = unit ? `${unitName}${mainSaved ? ' · tap to undo' : ''}` : mainSaved ? 'Tap to undo' : undefined
  // Words dragged across are saved only as the unit the explanation finds them to make.
  const canSave = !isPhrase || !!unit
  const onSave = () => {
    drawerPick(mainSaved ? 'undo save' : 'save')
    if (mainSaved) lookup.unsave(!!unit)
    else void lookup.save(unit ? true : 'main')
  }
  // How the word was read: its pieces, its form and the dictionary form it comes from.
  const readingLine = !isPhrase && analysis ? [
    analysis.parts.length > 1 ? analysis.parts.map(part => part.text).join(' + ') : '',
    analysis.form,
    analysis.lemma && stripNiqqud(analysis.lemma) !== stripNiqqud(analysis.vocalized || analysis.word) ? `from ${analysis.lemma}` : '',
  ].filter(Boolean).join(' · ') : ''
  // The explanation's meaning here, when it says more than the meaning shown (which stays).
  const same = (a: string, b: string) => a.trim().toLowerCase().replace(/[.,;]/g, '') === b.trim().toLowerCase().replace(/[.,;]/g, '')
  const fuller = analysis?.meaning && meaningShown && !same(analysis.meaning, meaningShown) ? analysis.meaning : ''

  return <DraggableSheet onDismiss={closing} style={[drawer.sheet, style, { maxHeight }]} accessibilityViewIsModal onLayout={onLayout}
    handle={<View style={drawer.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closing} hitSlop={10}><Ionicons name="close" size={22} color={colors.muted} /></Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
        <ListenButton text={said} accessibilityLabel={isPhrase ? 'Hear this phrase' : 'Hear this word'} speed={false} onListen={() => drawerPick('listen')} />
        <Text style={[drawer.word, he]} numberOfLines={1}>{v(said)}</Text>
      </View>
    </View>}>
    {/* The meaning's place, two lines, there before the meaning is: a short wait stays quiet. */}
    <View style={sheet.meaning}>
      {meaningShown
        ? <Animated.Text key={tap.text + sentence} entering={APPEAR} numberOfLines={2} style={[drawer.meaning, { flexShrink: 1 }]}>{isolateHebrew(v(meaningShown))}</Animated.Text>
        : !busy && lookup.error ? <Text numberOfLines={2} style={sheet.quiet}>No meaning just now. Details may have more.</Text> : null}
    </View>
    {details && <View style={{ flexShrink: 1 }}>
      <ScrollView ref={scroller} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10, paddingBottom: 4 }} alwaysBounceVertical={false}>
        {busy && !analysis ? <View style={[styles.row, { gap: 8 }]}><ActivityIndicator color={colors.green} /><Text style={styles.copy}>Explaining it in this sentence…</Text></View>
          : !analysis ? <Text style={sheet.quiet}>{gloss && !meaningShown ? gloss : 'The full explanation is unavailable just now.'}</Text>
          : <Animated.View entering={APPEAR} style={{ gap: 12 }}>
            {!!fuller && <Text style={drawer.fact}>In this sentence: <Text style={{ color: colors.ink }}>{isolateHebrew(v(fuller))}</Text></Text>}
            {!!readingLine && <Text style={drawer.reading}>{isolateHebrew(v(readingLine))}</Text>}
            {!!phrase && <UnitBox lookup={lookup} v={v} />}
            {leadPhrase && !phraseIsWord && !isPhrase && <TextButton title={unsaving.has(tapKey(tap.text, sentence)) ? 'Undoing…' : wordSaved ? `${isolateHebrew(tap.text)} saved on its own ✓ · Undo` : `Save just ${isolateHebrew(tap.text)}`}
              onPress={() => { drawerPick('save just the word', { value: wordSaved ? 'undo' : 'save' }); if (wordSaved) lookup.unsave(); else void lookup.save() }} />}
            {fillsPattern && <TextButton title={unsaving.has(tapKey(phrase!.text, sentence)) ? 'Undoing…' : phraseSaved ? 'Pattern saved ✓ · Undo' : `Save the pattern ${isolateHebrew(plainSpelling(phrase!.pattern!))}`}
              onPress={() => { drawerPick('save the pattern', { value: phraseSaved ? 'undo' : 'save' }); if (phraseSaved) lookup.unsave(true); else void lookup.save(true) }} />}
            {!isPhrase && !leadPhrase && constructionsOf(analysis).length > 0 && <Constructions items={constructionsOf(analysis)} v={v} size={15} meanings align="start" />}
            {!isPhrase && !!analysis.readAs && stripNiqqud(analysis.readAs) !== tap.text && <Text style={drawer.fact}>The photo text reads <Text style={[drawer.factHebrew, he]}>{isolateHebrew(tap.text)}</Text>; this is probably <Text style={[drawer.factHebrew, he]}>{isolateHebrew(v(analysis.readAs))}</Text>.</Text>}
            {analysis.parts.length > 1 && <Section label="Breakdown"><View style={drawer.parts}>
              {analysis.parts.map((part, i) => <View key={i} style={drawer.part}><Text style={[drawer.partHebrew, he]}>{v(part.text)}</Text><Text style={drawer.partMeaning}>{isolateHebrew(v(part.meaning))}</Text></View>)}
            </View></Section>}
            <WordFacts analysis={analysis} gloss={meaningShown || gloss} v={v} />
            {!!inYourWords && <Pressable accessibilityRole="link" onPress={() => { drawerPick('in your words'); router.push({ pathname: '/word', params: { id: inYourWords.id } }) }} hitSlop={6} style={[styles.row, { gap: 4 }]}>
              <Ionicons name="bookmark" size={14} color={colors.green} />
              <Text style={drawer.saved}>In your words · <Text style={[drawer.factHebrew, he]}>{isolateHebrew(v(inYourWords.lemma))}</Text></Text>
              <Ionicons name="chevron-forward" size={14} color={colors.green} />
            </Pressable>}
          </Animated.View>}
      </ScrollView>
    </View>}
    {!!lookup.error && (!!meaningShown || details) && <ErrorNotice message={lookup.error} />}
    {/* Details and Save, always both, always the same size. */}
    <View style={[styles.row, { flexWrap: 'nowrap', gap: 10 }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={toggleDetails} style={sheet.details} hitSlop={6}>
        <Text style={drawer.toggleLabel}>{details ? 'Less' : 'Details'}</Text><Ionicons name={details ? 'chevron-down' : 'chevron-up'} size={16} color={colors.green} />
      </Pressable>
      <Button secondary={mainSaved || !canSave} title={saveTitle} detail={saveDetail} disabled={!canSave}
        busy={unsaving.has(tapKey(unit ? unit.text : tap.text, sentence))} moment={mainSaved ? null : undefined} onPress={onSave} style={sheet.save} />
    </View>
    {/* Words dragged across that aren't one phrase are not saved as written: one of them can be. */}
    {isPhrase && !!analysis && !phrase && !!onPickWord && <View style={{ gap: 6 }}>
      <Text style={drawer.label}>Not one phrase · tap a word to save it</Text>
      <View style={[styles.row, { flexDirection: 'row-reverse', gap: 6 }]}>
        {tap.text.split(/\s+/).map((word, i) => <Pill key={i} label={v(word)} accessibilityLabel={`Open ${word}`} onPress={() => { drawerPick('pick a word'); onPickWord(i) }} />)}
      </View>
    </View>}
    {lookup.firstSave && (wordSaved || phraseSaved) && !saving.size && <TextButton title="Your first word is saved · Study it now" color={colors.green} onPress={() => { drawerPick('study now'); onClose(); router.push('/practice') }} />}
  </DraggableSheet>
}

const sheet = StyleSheet.create({
  meaning: { minHeight: 52, justifyContent: 'center' },
  quiet: { fontSize: 14, lineHeight: 20, color: colors.muted },
  details: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, height: 54, minWidth: 84 },
  save: { flex: 1, height: 54, minHeight: 54, paddingVertical: 0 },
})

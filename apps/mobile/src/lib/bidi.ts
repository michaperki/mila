// The word sheet's explanations are English with Hebrew mixed in, often from the model.
// iOS picks a paragraph's direction from its first letter and lets punctuation next to
// Hebrew attach to it, so "…means חיים." can render as ".חיים means…". Wrapping each
// Hebrew run in a right-to-left isolate (RLI … PDI) keeps it in place inside LTR text.
const HEBREW = '֐-׿יִ-ﭏ'
const RUN = new RegExp(`[${HEBREW}]+(?:[\\s־'"׳״-]+[${HEBREW}]+)*`, 'g')
const RLI = '⁧'
const PDI = '⁩'

export const isolateHebrew = (text: string) => text.replace(RUN, run => `${RLI}${run}${PDI}`)

// Dictionary senses minus the ones that just repeat the meaning shown above them.
export function otherSenses(senses: string, meaning: string) {
  const key = (value: string) => value.toLowerCase().replace(/^(to|a|an|the)\s+/, '').replace(/[^\p{L}\p{N} ]/gu, '').trim()
  const shown = key(meaning)
  return senses.split(/[,;]/).map(sense => sense.trim()).filter(sense => sense && key(sense) !== shown).join(', ')
}

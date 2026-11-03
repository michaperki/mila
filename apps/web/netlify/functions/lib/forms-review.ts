import { type Ask, cardsOf, type Entry, type Generated, schema as writerSchema, SYSTEM as WRITER, slotsOf, type WrittenForm } from './forms-writer.ts'

// A second reading of cards just written (lib/forms-writer.ts), by a native editor: each card is
// passed or rewritten (keeping its slot), and a rewrite goes through the writer's own checks.
// Not part of writing yet: scripts/eval-forms.mjs measures what it adds before it is.
const card = (writerSchema.properties.forms.items as { properties: Record<string, unknown> }).properties
export const schema = {
  type: 'object', additionalProperties: false, required: ['cards'],
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['card', 'verdict', 'problems', 'fixed'],
        properties: {
          card: { type: 'integer' },
          verdict: { type: 'string', enum: ['ok', 'fix'] },
          problems: { type: 'array', items: { type: 'string' }, description: 'What is wrong, briefly; empty when ok.' },
          fixed: {
            type: 'object', additionalProperties: false, description: 'With "fix", the whole card rewritten; with "ok", the card as it is.',
            required: ['form', 'english', 'agreesWith', 'sentence', 'inSentence', 'said', 'translation', 'inTranslation', 'cues'],
            properties: Object.fromEntries(Object.entries(card).filter(([key]) => key !== 'slot')),
          },
        },
      },
    },
  },
} as const

export const SYSTEM = `You are a native Israeli Hebrew editor checking practice cards before a learner sees them. They were written to the instructions below. For each card check, in order:
1. The Hebrew is correct: every word agrees (gender and number of subjects, adjectives and verbs, including nouns whose gender doesn't follow their ending), construct forms, prepositions, spelling.
2. It is what an Israeli would really say or write in that situation, and the register suits the word (a literary word in a context where it is used).
3. The card's word is used in a sense it really has in Hebrew, not one only its English gloss suggests, and the sentence shows that sense.
4. The translation says what the Hebrew says, naturally.
5. The cues follow the Who rules: every person whose gender (or, for "you", number) the Hebrew depends on and the English leaves open has one, after the right word, and there is no cue the English makes unnecessary.
When all five hold, the verdict is "ok": standard Hebrew that Israelis use is fine even if other phrasings exist, so don't rewrite for taste. Otherwise "fix": rewrite the card, keeping its tested form (the same slot and form) and fixing only what is wrong; when only the cues are wrong, change only the cues. If the tested form or sense itself can't be used naturally, write a new sentence where it can.

The instructions the cards were written to:

${WRITER}`

export async function reviewForms(entry: Entry, stage: string, forms: WrittenForm[], ask: Ask): Promise<{ forms: WrittenForm[]; fixed: { key: string; problems: string[] }[] }> {
  if (!forms.length) return { forms, fixed: [] }
  const prompt = [`Word: ${entry.lemma} (${entry.partOfSpeech || 'word'}) — ${entry.gloss}`, `Stage: ${stage}`, 'Cards:',
    ...forms.map((form, i) => `${i + 1}. slot ${form.slot}: ${form.he} "${form.en}"\n   Hebrew: ${form.sentence}\n   English: ${form.translation}\n   Marked: ${form.mark} / ${form.enMark}\n   Cues: ${form.cues.length ? form.cues.map(cue => `${cue.cue} after "${cue.after}"`).join(', ') : 'none'}`)].join('\n')
  const reply = await ask({ system: SYSTEM, prompt, schema })
  const text = reply.content.flatMap(block => (block.type === 'text' && block.text ? [block.text] : [])).join('')
  const verdicts = (JSON.parse(text) as { cards: { card: number; verdict: string; problems: string[]; fixed: Omit<Generated, 'slot'> }[] }).cards
  const slots = slotsOf(entry, stage)
  const fixed: { key: string; problems: string[] }[] = []
  const reviewed = forms.map((form, i) => {
    const verdict = verdicts.find(item => item.card === i + 1)
    if (verdict?.verdict !== 'fix') return form
    // A rewrite that fails the writer's checks leaves the card as it was.
    const [rewritten] = cardsOf([{ ...verdict.fixed, slot: form.slot }], stage, slots.filter(item => item.slot === form.slot)).forms
    if (!rewritten) return form
    fixed.push({ key: form.key, problems: verdict.problems })
    return rewritten
  })
  return { forms: reviewed, fixed }
}

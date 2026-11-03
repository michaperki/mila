import { CUE_RULES } from './cues.ts'
import { type Ask, cardsOf, type Cue, type Entry, type Generated, schema as writerSchema, SYSTEM as WRITER, slotsOf, type WrittenForm } from './forms-writer.ts'

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
  // Cards of a stage no longer written ("infinitive" on older words) are checked by their own slots.
  const slots = slotsOf(entry, stage) ?? forms.map(form => ({ slot: form.slot, means: form.slot }))
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

// The narrower check for form cards: only who the people in each sentence are (the cue rules),
// the sentence and its English left as they are. Its answer replaces the card's cues.
const cueSchema = {
  type: 'object', additionalProperties: false, required: ['cards'],
  properties: { cards: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['card', 'cues'], properties: { card: { type: 'integer' }, cues: card.cues } } } },
} as const
const CUE_CHECK = `You check the gender cues on Hebrew practice cards: the emoji shown in a card's English after a word, saying who that person is where the English doesn't and the Hebrew depends on it. For each card give the cues it should have by these rules (the Hebrew sentence and its English stay as they are), keeping its cues when they are right.

${CUE_RULES}`
export async function checkCues(entry: Entry, stage: string, forms: WrittenForm[], ask: Ask): Promise<{ forms: WrittenForm[]; fixed: { key: string; problems: string[] }[] }> {
  if (!forms.length) return { forms, fixed: [] }
  const prompt = [`Word: ${entry.lemma} — ${entry.gloss}`, 'Cards:',
    ...forms.map((form, i) => `${i + 1}. Hebrew: ${form.sentence}\n   English: ${form.translation}\n   Cues: ${form.cues.length ? form.cues.map(cue => `${cue.cue} after "${cue.after}"`).join(', ') : 'none'}`)].join('\n')
  const reply = await ask({ system: CUE_CHECK, prompt, schema: cueSchema })
  const text = reply.content.flatMap(block => (block.type === 'text' && block.text ? [block.text] : [])).join('')
  const answers = (JSON.parse(text) as { cards: { card: number; cues: Cue[] }[] }).cards
  // Cards of a stage no longer written ("infinitive" on older words) are checked by their own slots.
  const slots = slotsOf(entry, stage) ?? forms.map(form => ({ slot: form.slot, means: form.slot }))
  const same = (a: Cue[], b: Cue[]) => JSON.stringify(a) === JSON.stringify(b)
  const fixed: { key: string; problems: string[] }[] = []
  const checked = forms.map((form, i) => {
    const answer = answers.find(item => item.card === i + 1)
    if (!answer) return form
    // Through the writer's own handling of cues (only cues in use, their words in the English).
    const [recued] = cardsOf([{ slot: form.slot, form: form.he, english: form.en, sentence: form.sentence, inSentence: form.mark.split(' '), said: form.said ?? '', translation: form.translation, inTranslation: form.enMark.split(' '), cues: answer.cues }], stage, slots.filter(item => item.slot === form.slot)).forms
    if (!recued || same(recued.cues, form.cues)) return form
    fixed.push({ key: form.key, problems: [`cues ${form.cues.map(cue => cue.cue).join(' ') || 'none'} → ${recued.cues.map(cue => cue.cue).join(' ') || 'none'}`] })
    return { ...form, cue: recued.cue, ...(recued.cueAfter ? { cueAfter: recued.cueAfter } : { cueAfter: undefined }), cues: recued.cues }
  })
  return { forms: checked, fixed }
}

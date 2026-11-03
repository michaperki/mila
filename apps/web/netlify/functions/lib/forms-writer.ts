import { CUE_RULES, CUES, isCue } from './cues.ts'

// Writes one stage of a saved word's practice cards (word-forms.ts stores them), each with its
// own short example sentence. "meanings" is every word's first stage: one card per distinct
// common meaning, using the dictionary form. Later stages are forms (the past tense of לִפְתֹּחַ …).
// An expression (לַעֲבֹר דֶּרֶךְ, לְהַעֲמִיד פָּנִים) has the stages of the word in it that inflects,
// and every card uses the whole expression. The stage/slot lists mirror apps/mobile/src/lib/forms.ts.
//
// The Hebrew comes first: the model writes the sentence an Israeli would say, deciding before it
// what the form agrees with, then translates it; the English follows the Hebrew rather than
// shaping it. The code checks what it can without reading Hebrew: that what a form agrees with
// has the slot's gender and number (a form whose subject doesn't match is written once more), and
// that each cue's word is in the translation. Kept apart from the handler, with the model call
// passed in, so scripts/eval-forms.mjs can run it as the app does.
type Slot = { slot: string; means: string }
const MEANINGS: Slot[] = [1, 2, 3].map(n => ({ slot: `sense${n}`, means: `meaning ${n}` }))
const VERB: Record<string, Slot[]> = {
  meanings: MEANINGS,
  present: [
    { slot: 'm.sg', means: 'masculine singular' }, { slot: 'f.sg', means: 'feminine singular' },
    { slot: 'm.pl', means: 'masculine plural' }, { slot: 'f.pl', means: 'feminine plural' },
  ],
  past: [
    { slot: '1sg', means: 'I' }, { slot: '2sg.m', means: 'you (masculine singular)' }, { slot: '2sg.f', means: 'you (feminine singular)' },
    { slot: '3sg.m', means: 'he' }, { slot: '3sg.f', means: 'she' }, { slot: '1pl', means: 'we' },
    { slot: '2pl.m', means: 'you (masculine plural)' }, { slot: '2pl.f', means: 'you (feminine plural)' }, { slot: '3pl', means: 'they' },
  ],
  future: [
    { slot: '1sg', means: 'I' }, { slot: '2sg.m', means: 'you (masculine singular)' }, { slot: '2sg.f', means: 'you (feminine singular)' },
    { slot: '3sg.m', means: 'he' }, { slot: '3sg.f', means: 'she' }, { slot: '1pl', means: 'we' },
    { slot: '2pl', means: 'you (plural, the everyday form)' }, { slot: '3pl', means: 'they (the everyday form)' },
  ],
  imperative: [
    { slot: 'm.sg', means: 'to one man' }, { slot: 'f.sg', means: 'to one woman' }, { slot: 'pl', means: 'to several people' },
  ],
  noun: [{ slot: 'noun', means: 'the verbal noun (שם פעולה) of this verb' }],
}
export const STAGES: Record<string, Record<string, Slot[]>> = {
  verb: VERB,
  adjective: {
    meanings: MEANINGS,
    inflected: [{ slot: 'f.sg', means: 'feminine singular' }, { slot: 'm.pl', means: 'masculine plural' }, { slot: 'f.pl', means: 'feminine plural' }],
  },
  noun: {
    meanings: MEANINGS,
    plural: [{ slot: 'pl', means: 'plural' }],
  },
  other: { meanings: MEANINGS },
}

export type Entry = {
  lemma: string; gloss: string; partOfSpeech?: string; binyan?: string; head?: { lemma: string; partOfSpeech?: string; binyan?: string }; pattern?: string; feminine?: string
  constructions?: { pattern: string; meaning: string }[]
  // Saved before constructions: the prepositions alone.
  governs?: { preposition: string; meaning: string }[]
  forms?: { stage: string; slot?: string; en?: string; sentence: string }[]; encounters?: { surface: string; context: string }[]
}
// A card as stored on the word (apps/mobile/src/lib/types.ts FormCard). `cues`: who each person
// in the sentence is, where the English doesn't say and the Hebrew depends on it, each shown
// after its word; `cue`/`cueAfter` repeat the first, for versions of the app that show one.
export type Cue = { cue: string; after: string }
export type WrittenForm = {
  key: string; stage: string; slot: string; he: string; en: string; sentence: string; mark: string; said?: string
  translation: string; enMark: string; cue: string; cueAfter?: string; cues: Cue[]
}

export const kindOf = (partOfSpeech?: string) =>
  partOfSpeech === 'verb' || partOfSpeech === 'adjective' || partOfSpeech === 'noun' ? partOfSpeech : 'other'
// An expression is learned as the kind of word that inflects in it.
export const kindOfEntry = (entry: Pick<Entry, 'partOfSpeech' | 'head'>) => kindOf(entry.partOfSpeech === 'expression' ? entry.head?.partOfSpeech : entry.partOfSpeech)
export const slotsOf = (entry: Entry, stage: string) => STAGES[kindOfEntry(entry)][stage]
// The meaning every form is written in: the word's first meaning card if it has one, else the
// first sense of its gloss.
const mainMeaning = (entry: Entry) =>
  entry.forms?.find(form => form.stage === 'meanings' && form.slot === 'sense1')?.en || entry.gloss.split(/[,;]/)[0].trim()

const GENDERS = ['masculine', 'feminine', 'none'] as const
const NUMBERS = ['singular', 'plural', 'none'] as const
export const schema = {
  type: 'object', additionalProperties: false, required: ['forms'],
  properties: {
    forms: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['slot', 'form', 'english', 'agreesWith', 'sentence', 'inSentence', 'said', 'translation', 'inTranslation', 'cues'],
        properties: {
          slot: { type: 'string' },
          form: { type: 'string', description: 'The form, fully vocalized.' },
          english: { type: 'string', description: 'Short English for this form alone, e.g. "they opened", "to open", "open! (to one woman)", "beautiful (f. pl.)".' },
          agreesWith: {
            type: 'object', additionalProperties: false, required: ['word', 'gender', 'number'],
            description: 'Decided before the sentence: what the form agrees with in it (its subject, the noun it describes, or for "you" and commands whoever is addressed), with that word\'s grammatical gender and number, which must be the form\'s own. All "none" when the form agrees with nothing (an infinitive, a noun, an adverb, a preposition).',
            properties: {
              word: { type: 'string', description: 'The Hebrew word (with its article) as it will be in the sentence, or "" when none.' },
              gender: { type: 'string', enum: [...GENDERS] },
              number: { type: 'string', enum: [...NUMBERS] },
            },
          },
          sentence: { type: 'string', description: 'The Hebrew sentence (5 to 12 words, no niqqud) that uses exactly this form, as an Israeli would say or write it.' },
          inSentence: { type: 'array', items: { type: 'string' }, description: 'Each word of the sentence that is this form, copied exactly as written there with any attached prefix (e.g. ["ושפתחנו"]), in order. For an expression, every word of the expression, even where other words come between them (e.g. ["מעמיד", "פנים"] in "הוא מעמיד את עצמו פנים").' },
          said: { type: 'string', description: 'The same words as inSentence, fully vocalized as pronounced in this sentence, separated by spaces (e.g. "עוֹבְרִים דֶּרֶךְ").' },
          translation: { type: 'string', description: 'A faithful, natural English translation of the Hebrew sentence.' },
          inTranslation: { type: 'array', items: { type: 'string' }, description: 'The words of the translation that render this form, each copied exactly from it, in order.' },
          cues: {
            type: 'array', description: 'One per person the translation leaves open and the Hebrew depends on (see Who), in the order they appear; empty when there is none.',
            items: {
              type: 'object', additionalProperties: false, required: ['cue', 'after'],
              properties: {
                cue: { type: 'string', enum: CUES.filter(Boolean) },
                after: { type: 'string', description: 'The word of the translation naming that person, copied exactly from it ("secretary", "you", "I"), the first time they are mentioned; the cue is shown right after it.' },
              },
            },
          },
        },
      },
    },
  },
} as const

export const SYSTEM = `You write practice material for an English-speaking learner of modern Hebrew who is learning one word, meaning by meaning and form by form. Each card is one Hebrew sentence written for the card, never a sentence copied from the learner's reading, with its English translation. On some cards the learner sees the English and says the whole sentence in Hebrew, so the Hebrew should be what an Israeli would really say, and the English should give the learner what they need to say it.

Writing each sentence:
- Hebrew first. Picture a situation where an Israeli would actually use this word, in this sense and form, and write the sentence as they would say or write it there. For an everyday word that is everyday spoken Hebrew. A formal, literary or technical word goes where it is really used (a news report, an official notice, a book, a workplace, a lecture), in that register; never force it into a casual scene it would not appear in.
- Use Hebrew's own ways of saying things, not English structure in Hebrew words: a verb clause where English has a noun phrase ("regrets selling the house" is מתחרט שמכר את הבית, not על המכירה של הבית), construct forms where Israelis use them (רשימת האורחים), the prepositions the word really takes, a subject pronoun only where Hebrew uses one, family words as Israelis use them (אבא, סבתא, with no ה).
- The sense is the Hebrew word's, not its English gloss's. Use the word with the subjects, objects and situations Hebrew uses it with. A gloss covers different ground from the Hebrew word: זוכה is winning a prize or a lottery, a game is won with מנצח; לחדול is literary, so not for workers stopping at five. Never build a sentence on what the English gloss could also mean.
- Agreement: before writing the sentence, decide what the form agrees with (agreesWith) and make its gender and number the form's own. A noun's gender is not always what its ending suggests: רכבת, רגליים, ידיים, ארץ are feminine; ירקות, גרביים, חלון, זיכרון, לילה are masculine. Everything else in the sentence agrees too.
- Then translate: faithful, natural English that says what the Hebrew says. The translation follows the Hebrew; it need not use the card's "english" label, and inTranslation marks whichever of its words render the form.
- Vary the sentences: who acts (you, I, we, people, things, institutions, not mostly family members or names like Dana), the setting, and the sentence shape.

Meanings: when asked for the word's meanings, give one card per genuinely distinct sense a learner meets in modern Hebrew, most common first. Only senses the word really has in use today: never a sense that only an English gloss suggests. Most words have one; give at most three. Senses that are close or shade into each other are one card whose "english" lists them, most common first ("to assume, to estimate, to imagine"; "to bloom, to flourish"). Make a separate card only for a sense a learner would not guess from the others, such as a different domain or a colloquial or idiomatic use, and say so briefly in "english" ("to vanish, to take off (slang)"; "to cease (literary)"). Each card uses the dictionary form itself (verbs: the infinitive; adjectives: the masculine singular), never another form of it, in that sense, in a sentence that shows that sense clearly: choose a frame where the dictionary form is natural (after רוצה, צריך, אפשר, אמור, עלול, מתחיל or כדי; an adjective with a masculine singular noun), rather than a frame that needs another form or one where the dictionary form sounds forced; "english" is that sense in 1 to 6 words (verbs as "to …"). Include the sense the learner met the word in, unless they met it inside an expression (למען in למען האמת, ראש in בראש קטן): what the expression means is not a sense of the word, so leave it out, and never write a card "(in …)".

Forms: for each requested form, give the correct standard modern Hebrew form and a sentence that uses exactly that form. Leave out a form that is not in real use (for example a verbal noun the verb doesn't have) rather than inventing one. The forms are one word, not different meanings: every form's "english" uses the main meaning you are given, changing only for person, tense, number and gender ("he guesses", "they guessed", "guess! (to one woman)"), never to a synonym, and each sentence uses the word in that meaning. A feminine form needs a subject that is feminine: a woman, or a thing whose noun is feminine; not an animal unless the English says it is female ("our dog had her puppies").

Expressions: a sense that only exists together with particular other words (a verb with its fixed preposition or object, an idiom: לעבור דרך "to go through", להעמיד פנים "to pretend") belongs to that expression, not to the word on its own. When writing a single word, leave such senses out. When the word you are given is itself an expression, every card is the whole expression: its meanings are the expression's, every form inflects the words of it that inflect and keeps the rest ("עברנו דרך", "תעמידי פנים"), and inSentence lists every one of its words in the sentence.

Constructions: when you are told the constructions the word is used in (לְהַזְכִּיר לְמִישֶׁהוּ אֶת מַשֶּׁהוּ "to remind someone of something", לְהִרְהֵר בְּמַשֶּׁהוּ "to contemplate something"), write every sentence in the construction that fits its sense, wherever the word has a complement, so the learner sees the word as it is used; spread them across the cards. On meanings cards, a sense that comes with a construction of its own (להזכיר לְ "to remind" and להזכיר אֶת "to mention") is its own card in that construction, and constructions that share a sense make no extra cards.

Patterns: when the word is learned as a pattern (נָטוּל + [שֵׁם עֶצֶם], "free of [noun]"), every card uses the pattern, with a different everyday word in its open place each time (נטול סוכר, נטולת דאגות, נטולי שומן), so the pattern is what is learned and not one example of it. "english" is the pattern's meaning with that card's word in its open place, marked for the form as usual ("free of sugar (f.)"), and inSentence and inTranslation list only the pattern's own words, not the word in its open place.

${CUE_RULES}

Sentences must differ from each other and from the sentences already used for this word. Keep the rest of each sentence to common vocabulary, so the target word is the only hard part and its meaning is clear from the sentence.`

// What a slot says about gender and number ("2sg.f": feminine singular; "pl": plural; "1sg":
// singular, either gender), for checking what the form agrees with.
export function slotAgreement(slot: string) {
  const parts = slot.split('.')
  const gender = parts.includes('m') || /\.m$/.test(slot) ? 'masculine' : parts.includes('f') || /\.f$/.test(slot) ? 'feminine' : null
  const number = /sg/.test(slot) ? 'singular' : /pl/.test(slot) ? 'plural' : null
  return { gender, number }
}
// Stages whose forms agree with something; meanings, a noun's plural and the verbal noun don't.
const AGREEING = new Set(['present', 'past', 'future', 'imperative', 'inflected'])
type Agreement = { word: string; gender: string; number: string }
// Why a form doesn't agree with what it says it agrees with, or null.
export function disagreement(stage: string, slot: string, agrees: Agreement | undefined) {
  if (!AGREEING.has(stage) || !agrees) return null
  const want = slotAgreement(slot)
  if (want.gender && agrees.gender !== 'none' && agrees.gender !== want.gender) return `${agrees.word} is ${agrees.gender}, the form ${want.gender}`
  if (want.number && agrees.number !== 'none' && agrees.number !== want.number) return `${agrees.word} is ${agrees.number}, the form ${want.number}`
  return null
}

export function promptFor(entry: Entry, stage: string, slots: Slot[], retry: { slot: string; why: string }[] = []) {
  const used = (entry.forms || []).map(form => form.sentence).slice(-30)
  const met = (entry.encounters || []).slice(-5).map(item => `${item.surface} in: ${item.context}`)
  const expression = entry.partOfSpeech === 'expression'
  const constructions = entry.constructions?.length ? entry.constructions
    : (entry.governs || []).map(item => ({ pattern: `${entry.lemma} ${item.preposition}`, meaning: item.meaning }))
  const binyan = entry.binyan || entry.head?.binyan
  return [
    expression
      ? `Expression: ${entry.lemma} — ${entry.gloss}. It inflects as the ${entry.head?.partOfSpeech || 'word'} ${entry.head?.lemma || ''}${binyan ? ` (${binyan})` : ''}; every card uses the whole expression.`
      : `Word: ${entry.lemma} (${entry.partOfSpeech || 'word'}${binyan ? `, ${binyan}` : ''}) — ${entry.gloss}`,
    // A noun for a person with both forms is learned as both (מזכיר / מזכירה).
    ...(entry.feminine ? [`It is a noun for a person, masculine ${entry.lemma} and feminine ${entry.feminine}, both learned: use one or the other in each sentence, as fits who it is about, mixing them across the cards, and give each card's form as the one in its sentence.`] : []),
    ...(entry.pattern ? [`Learned as the pattern ${entry.pattern} — ${entry.gloss}.`] : []),
    ...(constructions.length ? ['Constructions it is used in:', ...constructions.map(item => `- ${item.pattern} "${item.meaning}"`)] : []),
    ...(stage === 'meanings'
      ? ['Write its meanings, one card each, using slots "sense1", "sense2", "sense3" in order (only as many as it has).']
      : [`Main meaning, the same for every form: ${mainMeaning(entry)}`, `Forms to write (${stage}):`, ...slots.map(item => `- slot "${item.slot}": ${item.means}`)]),
    ...(retry.length ? ['These were written before with a subject that does not agree with the form; write them again with one that does:', ...retry.map(item => `- slot "${item.slot}": ${item.why}`)] : []),
    ...(used.length ? ['Sentences already used for this word (do not repeat or imitate):', ...used.map(item => `- ${item}`)] : []),
    ...(met.length ? ['Where the learner met this word (for its meaning only; do not reuse these sentences):', ...met.map(item => `- ${item}`)] : []),
  ].join('\n')
}

export type Generated = {
  slot: string; form: string; english: string; agreesWith?: Agreement; sentence: string; inSentence: string[]; said: string; translation: string; inTranslation: string[]
  cues?: { cue: string; after: string }[]; cue?: string; cueAfter?: string
}
// The model's answer as cards. A cue whose word isn't in the translation is kept without it (it
// is then shown first); one not in use is dropped; the same person isn't cued twice.
export function cardsOf(generated: Generated[], stage: string, slots: Slot[]) {
  // A sense that is really an expression's ("(in למען האמת) to tell the truth") is not the word's.
  const ofExpression = (english: string) => /\((in|as in) [^)]*[א-ת]/i.test(english)
  const forms: WrittenForm[] = []
  const rejected: { slot: string; why: string }[] = []
  for (const { slot } of slots) {
    const item = generated.find(candidate => candidate.slot === slot && candidate.form?.trim() && candidate.sentence?.trim() && !(stage === 'meanings' && ofExpression(candidate.english)))
    if (!item) continue
    const why = disagreement(stage, slot, item.agreesWith)
    if (why) { rejected.push({ slot, why }); continue }
    const translation = item.translation.trim()
    // The marks are kept as the words in order, space-separated (apps/mobile/src/lib/marks.ts).
    const words = (list: string[]) => list.map(word => word.trim()).filter(Boolean).join(' ')
    const listed = item.cues ?? (item.cue ? [{ cue: item.cue, after: item.cueAfter ?? '' }] : [])
    const cues: Cue[] = []
    for (const { cue, after } of listed) {
      if (!isCue(cue) || !cue) continue
      const word = after?.trim() && translation.includes(after.trim()) ? after.trim() : ''
      if (!cues.some(other => other.after === word && (word || other.cue === cue))) cues.push({ cue, after: word })
    }
    forms.push({
      key: `${stage}:${slot}`, stage, slot, he: item.form.trim(), en: item.english.trim(), sentence: item.sentence.trim(),
      mark: words(item.inSentence), ...(item.said?.trim() ? { said: item.said.trim() } : {}), translation, enMark: words(item.inTranslation),
      // Kept even when empty: the card was written knowing whether its English says who.
      cue: cues[0]?.cue ?? '', ...(cues[0]?.after ? { cueAfter: cues[0].after } : {}), cues,
    })
  }
  return { forms, rejected }
}

// The model call, as the Anthropic SDK's beta.messages.create (or a stand-in) answers it.
export type Reply = { content: { type: string; text?: string }[]; stop_reason: string | null; model?: string; usage?: { input_tokens: number; output_tokens: number } }
export type Ask = (params: { system: string; prompt: string; schema: unknown }) => Promise<Reply>
export class Unwritable extends Error {}
const textOf = (reply: Reply) => reply.content.flatMap(block => (block.type === 'text' && block.text ? [block.text] : [])).join('')

// Writes a stage: the requested slots, then once more any whose subject didn't agree.
export async function writeForms(entry: Entry, stage: string, ask: Ask): Promise<WrittenForm[]> {
  const slots = slotsOf(entry, stage)
  const once = async (wanted: Slot[], retry?: { slot: string; why: string }[]) => {
    const reply = await ask({ system: SYSTEM, prompt: promptFor(entry, stage, wanted, retry), schema })
    if (reply.stop_reason === 'refusal' || reply.stop_reason === 'max_tokens') throw new Unwritable('These forms could not be written.')
    return cardsOf((JSON.parse(textOf(reply)) as { forms: Generated[] }).forms, stage, wanted)
  }
  const first = await once(slots)
  let forms = first.forms
  if (first.rejected.length) {
    const again = slots.filter(item => first.rejected.some(rejected => rejected.slot === item.slot))
    const second = await once(again, first.rejected).catch(() => null)
    if (second) forms = slots.flatMap(item => [...forms, ...second.forms].filter(form => form.slot === item.slot).slice(0, 1))
  }
  if (!forms.length) throw new Unwritable('These forms could not be written.')
  return forms
}

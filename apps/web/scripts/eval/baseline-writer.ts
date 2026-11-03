// The card writer as it was before the Hebrew-first prompt (commit 39607e1: its prompt, schema
// and parsing, unchanged), kept only so scripts/eval-forms.mjs can compare the two on the same
// words. Generated from git; not used by the app.
const CUES = ['', '👨', '👩', '👦', '👧', '👨👨', '👩👩', '👨👩', '👦👦', '👧👧', '👦👧'] as const
const isCue = (value: unknown): value is (typeof CUES)[number] => typeof value === 'string' && (CUES as readonly string[]).includes(value)

const CUE_RULES = `Who: the learner sees the English translation and must produce the Hebrew, and English often doesn't say what the Hebrew form depends on. Set "cue" only when the translation alone leaves open the gender (or, for "you", the number) of the person or people this card's form agrees with, and the form would be written differently otherwise. The cue says who that is: one man 👨, one woman 👩, a boy 👦, a girl 👧; a group is two faces: men 👨👨, women 👩👩, a mixed group or one whose genders aren't known 👨👩 (both take the masculine plural); children 👦👦, 👧👧, 👦👧 the same way. Use the children's faces for children, the adults' for adults.
- Needs a cue: "you were tired" (👨, 👩, 👨👨, 👩👩 or 👨👩 as the form is), "I am tired" when the form is the present or an adjective, which agree with the speaker, "we are considering it" in the present, and people whose word doesn't say: the teacher, the student, my friend, the doctor, the neighbor, the child, the kids, the passengers, the neighbors.
- No cue when anything in the translation already says it: he, she, they with a gendered noun, a name (Dana, Yossi), a gendered word (my sister, the boys, Grandma, the waitress, a few men), or a pronoun or possessive later in the sentence for the same person ("The teacher clears his throat", "The teacher is yawning because she didn't sleep").
- The form is what the learner must produce, so only a form that changes with who it is for can need a cue: a verb, an adjective or participle, or a noun for a person that has a masculine and a feminine (teacher, secretary). A word that never changes for a person gets no cue even when the sentence has an "I" or "you" in it: a noun for a thing (a remote, the helm, a signal, a court, a group), an adverb, a preposition or conjunction (of course, otherwise, after all, facing), a fixed expression that doesn't inflect, an infinitive.
- No cue when the form is the same whoever it is for (past "I slept", "we went", "they went", the infinitive, a noun's plural), or when the form agrees with something other than a person.
- Never for things, whose gender is grammar the learner is expected to know: "the table is big" has no cue, nor "the box has six sides".
- Only the person or people this card's form agrees with count, not anyone else in the sentence.
- "cueAfter" is the word of the translation the cue is about, copied exactly: the person ("secretary" in "The doctor's secretary booked me an appointment", "teacher", "kids") or the pronoun ("you", "I", "we"). The cue is shown right after it.`

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
const STAGES: Record<string, Record<string, Slot[]>> = {
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
// The meaning every form is written in: the word's first meaning card if it has one, else the
// first sense of its gloss.
const mainMeaning = (entry: Entry) =>
  entry.forms?.find(form => form.stage === 'meanings' && form.slot === 'sense1')?.en || entry.gloss.split(/[,;]/)[0].trim()
const kindOf = (partOfSpeech?: string) =>
  partOfSpeech === 'verb' || partOfSpeech === 'adjective' || partOfSpeech === 'noun' ? partOfSpeech : 'other'
// An expression is learned as the kind of word that inflects in it.
const kindOfEntry = (entry: Pick<Entry, 'partOfSpeech' | 'head'>) => kindOf(entry.partOfSpeech === 'expression' ? entry.head?.partOfSpeech : entry.partOfSpeech)

const schema = {
  type: 'object', additionalProperties: false, required: ['forms'],
  properties: {
    forms: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['slot', 'form', 'english', 'sentence', 'inSentence', 'said', 'translation', 'inTranslation', 'cue', 'cueAfter'],
        properties: {
          slot: { type: 'string' },
          form: { type: 'string', description: 'The form, fully vocalized.' },
          english: { type: 'string', description: 'Short English for this form alone, e.g. "they opened", "to open", "open! (to one woman)", "beautiful (f. pl.)".' },
          sentence: { type: 'string', description: 'A short, natural, everyday Hebrew sentence (5 to 12 words, no niqqud) that uses exactly this form.' },
          inSentence: { type: 'array', items: { type: 'string' }, description: 'Each word of the sentence that is this form, copied exactly as written there with any attached prefix (e.g. ["ושפתחנו"]), in order. For an expression, every word of the expression, even where other words come between them (e.g. ["מעמיד", "פנים"] in "הוא מעמיד את עצמו פנים").' },
          said: { type: 'string', description: 'The same words as inSentence, fully vocalized as pronounced in this sentence, separated by spaces (e.g. "עוֹבְרִים דֶּרֶךְ").' },
          translation: { type: 'string', description: 'Natural English translation of the sentence.' },
          inTranslation: { type: 'array', items: { type: 'string' }, description: 'The words of the translation that render this form, each copied exactly from it, in order.' },
          cue: { type: 'string', enum: [...CUES], description: 'Who the form is for, only when the translation leaves it open and the form depends on it (see Who); otherwise empty.' },
          cueAfter: { type: 'string', description: 'With a cue: the word of the translation it is about, copied exactly from it ("secretary", "you", "I"); the cue is shown right after it. Otherwise empty.' },
        },
      },
    },
  },
} as const

const SYSTEM = `You write practice material for an English-speaking learner of modern Hebrew who is learning one word, meaning by meaning and form by form. Each card is one sentence written for the card, never a sentence copied from the learner's reading.

Meanings: when asked for the word's meanings, give one card per genuinely distinct sense a learner meets in everyday modern Hebrew, most common first. Most words have one; give at most three. Senses that are close or shade into each other are one card whose "english" lists them, most common first ("to assume, to estimate, to imagine"; "to bloom, to flourish"). Make a separate card only for a sense a learner would not guess from the others, such as a different domain or a colloquial or idiomatic use, and say so briefly in "english" ("to vanish, to take off (slang)"). Each card uses the dictionary form (verbs: the infinitive) in that sense, in a sentence that shows that sense clearly; "english" is that sense in 1 to 6 words (verbs as "to …"). Include the sense the learner met the word in, unless they met it inside an expression (למען in למען האמת, ראש in בראש קטן): what the expression means is not a sense of the word, so leave it out, and never write a card "(in …)".

Forms: for each requested form, give the correct standard modern Hebrew form and a sentence that uses exactly that form. Leave out a form that is not in real use (for example a verbal noun the verb doesn't have) rather than inventing one. The forms are one word, not different meanings: every form's "english" uses the main meaning you are given, changing only for person, tense, number and gender ("he guesses", "they guessed", "guess! (to one woman)"), never to a synonym, and each sentence uses the word in that meaning, rendered with that same English word in its translation.

Expressions: a sense that only exists together with particular other words (a verb with its fixed preposition or object, an idiom: לעבור דרך "to go through", להעמיד פנים "to pretend") belongs to that expression, not to the word on its own. When writing a single word, leave such senses out. When the word you are given is itself an expression, every card is the whole expression: its meanings are the expression's, every form inflects the words of it that inflect and keeps the rest ("עברנו דרך", "תעמידי פנים"), and inSentence lists every one of its words in the sentence.

Constructions: when you are told the constructions the word is used in (לְהַזְכִּיר לְמִישֶׁהוּ אֶת מַשֶּׁהוּ "to remind someone of something", לְהִרְהֵר בְּמַשֶּׁהוּ "to contemplate something"), write every sentence in the construction that fits its sense, wherever the word has a complement, so the learner sees the word as it is used; spread them across the cards. On meanings cards, a sense that comes with a construction of its own (להזכיר לְ "to remind" and להזכיר אֶת "to mention") is its own card in that construction, and constructions that share a sense make no extra cards.

Patterns: when the word is learned as a pattern (נָטוּל + [שֵׁם עֶצֶם], "free of [noun]"), every card uses the pattern, with a different everyday word in its open place each time (נטול סוכר, נטולת דאגות, נטולי שומן), so the pattern is what is learned and not one example of it. "english" is the pattern's meaning with that card's word in its open place, marked for the form as usual ("free of sugar (f.)"), and inSentence and inTranslation list only the pattern's own words, not the word in its open place.

${CUE_RULES}

Sentences must differ from each other and from the sentences already used for this word: vary who acts, the setting, the objects and the sentence shape, so no two read as the same sentence with the person changed. Keep the rest of each sentence simple, common vocabulary, so the target word is the only hard part and its meaning is clear from the sentence.`


type Generated = { slot: string; form: string; english: string; sentence: string; inSentence: string[]; said: string; translation: string; inTranslation: string[]; cue?: string; cueAfter?: string }
type Entry = {
  lemma: string; gloss: string; partOfSpeech?: string; binyan?: string; head?: { lemma: string; partOfSpeech?: string; binyan?: string }; pattern?: string; feminine?: string
  constructions?: { pattern: string; meaning: string }[]
  // Saved before constructions: the prepositions alone.
  governs?: { preposition: string; meaning: string }[]
  forms?: { stage: string; slot?: string; en?: string; sentence: string }[]; encounters?: { surface: string; context: string }[]
}


type Reply = { content: { type: string; text?: string }[]; stop_reason: string | null }
export async function baselineForms(entry: Entry, stage: string, ask: (params: { system: string; prompt: string; schema: unknown }) => Promise<Reply>) {
  const slots = STAGES[kindOfEntry(entry)][stage]
    const used = (entry.forms || []).map(form => form.sentence).slice(-30)
    const met = (entry.encounters || []).slice(-5).map(item => `${item.surface} in: ${item.context}`)
    const expression = entry.partOfSpeech === 'expression'
    const constructions = entry.constructions?.length ? entry.constructions
      : (entry.governs || []).map(item => ({ pattern: `${entry.lemma} ${item.preposition}`, meaning: item.meaning }))
    const binyan = entry.binyan || entry.head?.binyan
    const prompt = [
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
      ...(used.length ? ['Sentences already used for this word (do not repeat or imitate):', ...used.map(item => `- ${item}`)] : []),
      ...(met.length ? ['Where the learner met this word (for its meaning only; do not reuse these sentences):', ...met.map(item => `- ${item}`)] : []),
    ].join('\n')

    const response = await ask({ system: SYSTEM, prompt, schema })
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') throw new Error('These forms could not be written.')
    const text = response.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')
    const generated = (JSON.parse(text) as { forms: Generated[] }).forms
    // A sense that is really an expression's ("(in למען האמת) to tell the truth") is not the word's.
    const ofExpression = (english: string) => /\((in|as in) [^)]*[\u05D0-\u05EA]/i.test(english)
    const order = slots.map(item => item.slot)
    const forms = order.flatMap(slot => {
      const item = generated.find(candidate => candidate.slot === slot && candidate.form.trim() && candidate.sentence.trim() && !(stage === 'meanings' && ofExpression(candidate.english)))
      // The marks are kept as the words in order, space-separated (apps/mobile/src/lib/marks.ts).
      const words = (list: string[]) => list.map(word => word.trim()).filter(Boolean).join(' ')
      return item ? [{
        key: `${stage}:${slot}`, stage, slot, he: item.form.trim(), en: item.english.trim(), sentence: item.sentence.trim(),
        mark: words(item.inSentence), ...(item.said.trim() ? { said: item.said.trim() } : {}), translation: item.translation.trim(), enMark: words(item.inTranslation),
        // Kept even when empty: the card was written knowing whether its English says who.
        cue: isCue(item.cue) ? item.cue : '',
        ...(isCue(item.cue) && item.cue && item.cueAfter?.trim() && item.translation.includes(item.cueAfter.trim()) ? { cueAfter: item.cueAfter.trim() } : {}),
      }] : []
    })
    return forms
}

// Who a card's form is for, shown beside its English when the English doesn't say and the Hebrew
// depends on it: a man, a woman, a boy, a girl, men, women, several people (a mixed or unknown
// group). Written with each card (word-forms.ts) and, for cards written before, by
// scripts/backfill-cues.mjs; shown by apps/mobile (lib/forms.ts cueOf). It resolves what the
// English leaves open, never what the learner should know: a thing's gender has no cue.
export const CUES = ['', '👨', '👩', '👦', '👧', '👬', '👭', '👥'] as const
export const isCue = (value: unknown): value is (typeof CUES)[number] => typeof value === 'string' && (CUES as readonly string[]).includes(value)

export const CUE_RULES = `Who: the learner sees the English translation and must produce the Hebrew, and English often doesn't say what the Hebrew form depends on. Set "cue" only when the translation alone leaves open the gender (or, for "you", the number) of the person or people this card's form agrees with, and the form would be written differently otherwise. The cue says who that is: one man 👨, one woman 👩, a boy 👦, a girl 👧, several men 👬, several women 👭, a mixed or unspecified group 👥 (which takes the masculine plural). Use 👦 or 👧 for a child, 👨 or 👩 for an adult.
- Needs a cue: "you were tired" (👨, 👩, 👬, 👭 or 👥 as the form is), "I am tired" when the form is the present or an adjective, which agree with the speaker, "we are considering it" in the present, and people whose word doesn't say: the teacher, the student, my friend, the doctor, the neighbor, the child, the kids, the passengers, the neighbors.
- No cue when anything in the translation already says it: he, she, they with a gendered noun, a name (Dana, Yossi), a gendered word (my sister, the boys, Grandma, the waitress, a few men), or a pronoun or possessive later in the sentence for the same person ("The teacher clears his throat", "The teacher is yawning because she didn't sleep").
- The form is what the learner must produce, so only a form that changes with who it is for can need a cue: a verb, an adjective or participle, or a noun for a person that has a masculine and a feminine (teacher, secretary). A word that never changes for a person gets no cue even when the sentence has an "I" or "you" in it: a noun for a thing (a remote, the helm, a signal, a court, a group), an adverb, a preposition or conjunction (of course, otherwise, after all, facing), a fixed expression that doesn't inflect, an infinitive.
- No cue when the form is the same whoever it is for (past "I slept", "we went", "they went", the infinitive, a noun's plural), or when the form agrees with something other than a person.
- Never for things, whose gender is grammar the learner is expected to know: "the table is big" has no cue, nor "the box has six sides".
- Only the person or people this card's form agrees with count, not anyone else in the sentence.`

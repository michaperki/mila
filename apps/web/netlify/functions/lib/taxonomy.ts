// How saved words are organised (VOCAB-2): a few broad themes, a register and a level. Themes are
// for finding and spacing what is studied, not a dictionary's classes: a word takes one to three,
// the main one first, or none when nothing fits well, and its part of speech already says what
// kind of word it is (a verb, an expression, a pattern like "liable to [verb]"). Themes are
// topics a learner would browse by, so a verb or an abstract word belongs where its meaning does
// (to whisper: speech; to cope: doing; pride: feelings), and grammar holds the words and
// constructions that only work inside a sentence.
//
// v1 (2026-11-16) revises draft-1 against the 477 saved words (mostly from a novel): general
// verbs of doing and happening (to cause, to manage, to succeed) had nowhere to go, so `doing`;
// seeing, light and colour are one of the novel's biggest groups (to stare, gleaming, dim,
// golden), so `senses`; where things are (beside, inside, corner, in all directions) is `place`;
// and `structure` became `grammar`. Nothing was classified under draft-1.
//
// Entries keep which version classified them (`taxonomy`). A revision gets a new version, and the
// classify export then offers again the words classified under an older one, so the list can
// change without a migration. Ids are kept, never renamed, once anything is classified with them.
export const TAXONOMY_VERSION = 'v1'

export const CATEGORIES = {
  people: { label: 'People', about: 'people, roles and relationships (secretary, gentlemen, hunter, expert, passersby)' },
  body: { label: 'Body and health', about: 'the body, faces, gestures and health (finger, lip, shoulder, to nod, to yawn, medicine)' },
  feelings: { label: 'Feelings', about: 'feelings and moods (fear, pride, upset, to be ashamed, to despair, relief)' },
  character: { label: 'Character', about: 'character, behaviour and how people treat each other (decent, foolishness, to pretend, to scold, to deceive, to persuade)' },
  mind: { label: 'Mind', about: 'thinking, knowing and deciding (to guess, to ponder, to wonder, imagination, convinced, to change one\'s mind)' },
  senses: { label: 'Seeing and light', about: 'looking, seeing, light and colour (to stare, to glance, to notice, gleaming, dim, flicker, golden)' },
  speech: { label: 'Speech and sounds', about: 'speaking and sounds (to whisper, to mumble, to gossip, roar, crackle, to ring)' },
  movement: { label: 'Movement', about: 'moving the body and things (to leap, to pull, to sink, to swoop, to lay down, to sit down)' },
  doing: { label: 'Doing', about: 'acting, trying, causing and happening in general (to cause, to manage, to try hard, to cope, to succeed, to happen)' },
  appearance: { label: 'Clothes and looks', about: 'clothes and how people and things look (robe, necktie, belt, tiny, spotted, crooked)' },
  home: { label: 'Home', about: 'home, food and everyday things (bedroom, cup, frying pan, lamp, blanket, bread roll)' },
  town: { label: 'Town and work', about: 'town, work, news and getting around (parking lot, to drive, newspaper, shipment, cash register)' },
  nature: { label: 'Nature', about: 'nature, animals and weather (owl, forest, rain, star, sunrise, thicket)' },
  place: { label: 'Place', about: 'where things are: position, direction and space (beside, inside, nearby, corner, in all directions, throughout)' },
  time: { label: 'Time', about: 'time, order and pace (midnight, suddenly, to be early, immediately, routine, finally)' },
  magic: { label: 'Magic and stories', about: 'magic and storytelling (magic, legend, You-Know-Who, mysterious)' },
  grammar: { label: 'Grammar', about: 'words and patterns that hold sentences together: connectives, quantities, prefixes and constructions (except, after all, most, but, un-[adjective], liable to [verb], half [X] half [Y])' },
} as const
export type Category = keyof typeof CATEGORIES
export const CATEGORY_IDS = Object.keys(CATEGORIES) as Category[]

export const REGISTERS = {
  everyday: 'what people say and write every day',
  formal: 'news, official or careful writing',
  literary: 'mostly in books and storytelling',
  informal: 'casual or slang',
  technical: 'a field\'s own vocabulary',
} as const
export type Register = keyof typeof REGISTERS

// Level is worked out from frequency rank where there is one (lib/frequency.ts, levelOf); set by
// an import only for words frequency can't place (expressions, rare spellings).
export const LEVELS = ['core', 'common', 'uncommon', 'rare'] as const
export type Level = typeof LEVELS[number]
export const levelOf = (rank?: number): Level | undefined =>
  (!rank ? undefined : rank <= 1000 ? 'core' : rank <= 3000 ? 'common' : rank <= 10000 ? 'uncommon' : 'rare')

// Themes and register as a model or an import gives them, kept only where they are the
// taxonomy's own: at most three known themes, in order, without repeats. No theme at all is an
// answer too (nothing fits well), kept so the word isn't offered for classifying again.
export function organisationOf(value: { categories?: unknown; register?: unknown } | undefined) {
  if (!value || !Array.isArray(value.categories)) return undefined
  const categories = [...new Set(value.categories.filter((item): item is Category => typeof item === 'string' && item in CATEGORIES))].slice(0, 3)
  const register = typeof value.register === 'string' && value.register in REGISTERS ? value.register as Register : undefined
  return { categories, ...(register ? { register } : {}), taxonomy: TAXONOMY_VERSION }
}

// A short guide to the themes and registers, for a model's instructions.
export const taxonomyGuide = () => [
  `Themes: ${CATEGORY_IDS.map(id => `${id} (${CATEGORIES[id].about})`).join('; ')}.`,
  `Registers: ${Object.entries(REGISTERS).map(([id, about]) => `${id} (${about})`).join('; ')}.`,
].join('\n')

// How saved words are organised (VOCAB-2): a few broad themes, a register and, where frequency
// can't say, a level. A DRAFT for Mike's review (2026-11-15), drawn from the words actually saved
// (mostly from reading a novel: feelings, looking and noticing, speech and sounds, movement, people,
// the house, weather and nature, time, magic, and the small words that hold sentences together).
// Themes are for organising and spacing what is studied, not a dictionary's classes: a word takes
// one to three, or none when nothing fits well, and a word's part of speech already says what kind
// of word it is. Entries keep which version classified them (`taxonomy`), so a revised list can
// reclassify without a migration.
export const TAXONOMY_VERSION = 'draft-1'

export const CATEGORIES = {
  people: 'People, roles and relationships (secretary, gentlemen, hunter, family)',
  body: 'The body, faces and gestures (finger, lip, shoulder, to nod, to blink)',
  appearance: 'Clothes and how people and things look (robe, necktie, gleaming, spotted, tiny)',
  feelings: 'Feelings and moods (fear, pride, upset, to be ashamed, to despair)',
  character: 'Character and behaviour (decent, foolishness, to behave, to pretend, to interfere)',
  mind: 'Thinking, knowing and perceiving (to notice, to guess, to stare, imagination, convinced)',
  speech: 'Speaking and sounds (to whisper, to mumble, to gossip, roar, crackle, to ring)',
  movement: 'Movement and physical actions (to leap, to pull, to sink, to swoop, to lay down)',
  home: 'Home and everyday things (bedroom, cup, frying pan, lamp, blanket, drill)',
  town: 'Town, work and getting around (parking lot, to drive, steering wheel, newspaper, shipment)',
  nature: 'Nature, animals and weather (owl, forest, rain, star, sunrise, thicket)',
  time: 'Time and how things happen (midnight, suddenly, to be early, occurrence, routine)',
  magic: 'Magic and storytelling (magic, legend, You-Know-Who, mysterious)',
  structure: 'Words that hold sentences together: connectives, prepositions, quantities (except, after all, otherwise, most, dozen)',
} as const
export type Category = keyof typeof CATEGORIES

export const REGISTERS = {
  everyday: 'what people say and write every day',
  formal: 'news, official or careful writing',
  literary: 'mostly in books and storytelling',
  informal: 'casual or slang',
  technical: 'a field\'s own vocabulary',
} as const
export type Register = keyof typeof REGISTERS

// Level is worked out from frequency rank where there is one (lib/frequency.ts, levelOf); set by
// hand or by enrichment only for words frequency can't place (expressions, rare spellings).
export const LEVELS = ['core', 'common', 'uncommon', 'rare'] as const
export type Level = typeof LEVELS[number]
export const levelOf = (rank?: number): Level | undefined =>
  (!rank ? undefined : rank <= 1000 ? 'core' : rank <= 3000 ? 'common' : rank <= 10000 ? 'uncommon' : 'rare')

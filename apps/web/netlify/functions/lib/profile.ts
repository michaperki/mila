import { plainWord, rankOf } from './frequency.ts'
import { cardsOfEntry, lemmaKeyOf, parseCardKey, savedFormMatcher, type LearnerEntry, type LearnerEvent, type Results } from './learner.ts'

// What the card writer is told about the learner, and what the words of a written card are to them.
// It is built from what the learner's own practice and reading show, not from the learner model's
// estimates, which predict answers worse than a card's own history does (docs/learner-model.md):
// - steady: practised, and its word or meaning cards recalled as Study counts it (the last two
//   answers right, one of them unprimed), or marked known; and not looked up since.
// - learning: practised, not steady yet.
// - shaky: looked up in the last weeks and not steady: a saved word looked up again after it was
//   steady, or a word looked up and never saved, however common (שלהם, אוויר).
// - ahead: saved from reading, not studied yet.
// Each is evidence of a kind, not a verdict: a steady word can slip, and most of the everyday Hebrew
// the learner knows is in none of them. Which way round a word was answered (`recognized`: right
// from the Hebrew, `said`: right from the English) is kept where answers say, unprimed answers only.
export const PROFILE_VERSION = 'profile-v1'
// The writer told about the learner (word-forms.ts), and which words it writes: half of them,
// chosen by the word so all of a word's stages come from one writer; 'off' none, 'all' every word.
export const PERSONAL_WRITER = 'personal-v1'
const halfOf = (id: string) => [...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7) % 2 === 0
export const isPersonal = (id: string, mode = process.env.PERSONALIZED_CARDS ?? 'split') => mode === 'all' || (mode !== 'off' && halfOf(id))
export type Place = 'steady' | 'learning' | 'shaky' | 'ahead'
export type ProfileWord = {
  key: string; lemma: string; gloss?: string; rank?: number; place: Place; lastAt: number
  recognized?: boolean; said?: boolean; met?: number; id?: string
}
export type Profile = { version: string; words: Map<string, ProfileWord> }
export type ProfileEntry = LearnerEntry & { known?: string[] }

const DAY = 86_400_000
const SHAKY_DAYS = 45
// One lookup of one of the most common words says little (it may have been for the phrase around
// it: אם in ואם); looked up twice, it is a word to be careful with (שלהם).
const VERY_COMMON = 300
// Study's own rule (apps/mobile/src/lib/forms.ts cardState): the last two answers right, at least
// one of them not primed.
const familiar = ({ results = [], primed = [] }: Results) => {
  const from = results.length - 2
  return results.length >= 2 && results.slice(-2).every(Boolean) && results.slice(-2).some((_, i) => !primed[from + i])
}
const missedLast = ({ results = [] }: Results) => results.length > 0 && !results[results.length - 1]

export function learnerProfile(entries: ProfileEntry[], events: LearnerEvent[], now = Date.now()): Profile {
  const words = new Map<string, ProfileWord>()
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const keyOf = (entry: LearnerEntry) => lemmaKeyOf(entry.lemmaPlain || entry.lemma)
  const answeredAt = new Map<string, number>()
  for (const entry of entries) {
    // Selections saved as written before phrases were normalized aren't words to write with.
    if (entry.partOfSpeech === 'phrase') continue
    const cards = cardsOfEntry(entry)
    const practised = cards.some(card => card.results.results?.length)
    const wordCards = cards.filter(card => card.card.kind === 'word' || card.card.stage === 'meanings')
    const marked = !!entry.known?.some(stage => stage === 'word' || stage === 'meanings')
    const steady = marked || (wordCards.some(card => familiar(card.results)) && !wordCards.some(card => missedLast(card.results)))
    const last = Math.max(0, ...cards.map(card => card.results.last ?? 0))
    answeredAt.set(entry.id, last)
    words.set(keyOf(entry), {
      key: keyOf(entry), id: entry.id, lemma: entry.lemmaPlain || plainWord(entry.lemma), gloss: entry.gloss, place: steady ? 'steady' : practised ? 'learning' : 'ahead',
      lastAt: practised ? last : Number(entry.createdAt) || 0, met: entry.encounters?.length ?? 0,
      rank: rankOf(entry.lemmaPlain || entry.lemma, ...(entry.encounters || []).map(met => met.surface)),
    })
  }
  const wordOfId = (id: string) => { const entry = byId.get(id); return entry ? words.get(keyOf(entry)) : undefined }
  // Answers by which side came first, in order, so the latest decides.
  for (const event of [...events].sort((a, b) => a.at - b.at)) {
    if (event.type !== 'answer' || event.primed || typeof event.key !== 'string' || (event.front !== 'he' && event.front !== 'en')) continue
    const word = wordOfId(parseCardKey(event.key).wordId)
    if (word) word[event.front === 'he' ? 'recognized' : 'said'] = !!event.knew
  }
  // Lookups: a reader lookup's dictionary form comes with its explanation, a card's with the card.
  const lemmaOf = new Map<string, string>()
  for (const event of events) if (event.type === 'explained' && typeof event.of === 'string' && typeof event.lemma === 'string') lemmaOf.set(event.of, event.lemma)
  const matcher = savedFormMatcher(entries, { strict: false })
  // The places each word was looked up in: the same word tapped twice in one place is one lookup.
  const looked = new Map<string, Set<string>>()
  for (const event of events) {
    if (event.type !== 'lookup' || event.phrase || typeof event.word !== 'string' || now - event.at > SHAKY_DAYS * DAY) continue
    const lemma = (typeof event.lemma === 'string' && event.lemma) || lemmaOf.get(String(event.id)) || ''
    const key = lemma ? lemmaKeyOf(lemma) : matcher(event.word)[0] ?? lemmaKeyOf(event.word)
    const saved = words.get(key)
    if (saved) {
      // Looked up again after it was steady: it has slipped. Otherwise it is where it was.
      if (saved.place === 'steady' && event.at > (answeredAt.get(saved.id ?? '') ?? 0)) Object.assign(saved, { place: 'shaky', lastAt: event.at })
      continue
    }
    if (!key || key.includes(' ')) continue
    const places = looked.get(key) ?? new Set<string>()
    looked.set(key, places.add(`${event.key ?? event.text}:${event.segment ?? ''}:${event.place}`))
    const rank = rankOf(lemma, event.word)
    if (rank && rank <= VERY_COMMON && places.size < 2) continue
    const seen = words.get(key)
    words.set(key, { key, lemma: plainWord(lemma || event.word), place: 'shaky', lastAt: Math.max(event.at, seen?.lastAt ?? 0), rank })
  }
  return { version: PROFILE_VERSION, words }
}

// What a card's words are to the learner, for each word it glosses (every word but the card's
// own): its place in the profile, or else how common it is.
export type Support = Place | 'common' | 'uncommon' | 'rare'
export const COMMON_RANK = 3000
const UNCOMMON_RANK = 10000
// How common is by the dictionary form or the word as written (הארץ is common, ארץ less so). A
// saved word not studied yet that is among the most common is counted as common: it was saved for
// a use of it, not because the word was new.
export function supportOf(lemma: string, profile: Profile, written?: string): Support {
  const word = profile.words.get(lemmaKeyOf(lemma))
  const rank = rankOf(lemma, written)
  if (word && !(word.place === 'ahead' && rank && rank <= VERY_COMMON * 3)) return word.place
  return rank && rank <= COMMON_RANK ? 'common' : rank && rank <= UNCOMMON_RANK ? 'uncommon' : 'rare'
}
export function supportOfCard(glosses: { i?: number; lemma: string }[] | undefined, profile: Profile, sentence = '') {
  const words = sentence.split(/\s+/).filter(Boolean)
  const counts: Partial<Record<Support, number>> = {}
  for (const gloss of glosses || []) {
    if (!gloss.lemma?.trim()) continue
    const place = supportOf(gloss.lemma, profile, gloss.i === undefined ? undefined : words[gloss.i])
    counts[place] = (counts[place] ?? 0) + 1
  }
  return counts
}

// The learner as the writer is told: the words of each kind it can rely on or bring in, most recent
// first, and what is known about the word being written. `stretch`: whether a card may bring in one
// word the learner hasn't studied. It goes in the request, after the word's own details, so the
// system prompt stays the same for every learner.
const LIMITS = { steady: 60, learning: 20, shaky: 30, ahead: 15 }
export function profileBlock(profile: Profile, entry: Pick<LearnerEntry, 'lemma' | 'lemmaPlain'>, stage: string, { stretch = true } = {}) {
  const target = lemmaKeyOf(entry.lemmaPlain || entry.lemma)
  const of = (place: Place) => [...profile.words.values()].filter(word => word.place === place && word.key !== target)
  const recent = (list: ProfileWord[]) => list.sort((a, b) => b.lastAt - a.lastAt)
  const said = (word: ProfileWord) => (word.said ? `${word.lemma}+` : word.lemma)
  const steady = recent(of('steady')).slice(0, LIMITS.steady)
  const learning = recent(of('learning')).slice(0, LIMITS.learning)
  const shaky = recent(of('shaky')).slice(0, LIMITS.shaky)
  // Words to bring in are the useful ones: met again in reading, then the more common, but not the
  // most common (על, בין, saved for a use of them, not as new words).
  const ahead = of('ahead').filter(word => (word.met ?? 0) > 1 || (word.rank && word.rank > VERY_COMMON * 3 && word.rank <= 8000))
    .sort((a, b) => Number((b.met ?? 0) > 1) - Number((a.met ?? 0) > 1) || (a.rank ?? 1e9) - (b.rank ?? 1e9)).slice(0, LIMITS.ahead)
  const word = profile.words.get(target)
  const about = !word || word.place === 'ahead'
    ? `They saved it from their reading${(word?.met ?? 0) > 1 ? `, where they have met it ${word!.met} times,` : ''} and haven't studied it yet${stage === 'meanings' ? ': these are their first cards for it' : ''}.`
    : word.place === 'steady' ? `They have studied it and recall it reliably${word.said ? ', and have said it from the English' : word.recognized ? ', but have not yet said it from the English' : ''}.`
    : word.place === 'shaky' ? 'They had learned it, but have looked it up again since.'
    : `They are learning it${word.recognized && !word.said ? ': they recognize it, but have not yet said it from the English' : ''}.`
  const list = (words: ProfileWord[], gloss = false) => words.map(item => (gloss && item.gloss ? `${said(item)} "${item.gloss.split(/[,;]/)[0].trim()}"` : said(item))).join(', ')
  return [
    '',
    'About this learner, from their own practice and reading. It is incomplete: much everyday Hebrew they know is not listed, and a listed word can still slip. A + marks a word they have also said from the English.',
    `- This word: ${about}`,
    ...(steady.length ? [`- Words they recall reliably: ${list(steady)}`] : []),
    ...(learning.length ? [`- Words they are learning now: ${list(learning)}`] : []),
    ...(shaky.length ? [`- Words they looked up recently and can't rely on yet: ${list(shaky)}`] : []),
    ...(stretch && ahead.length ? [`- Words they saved from their reading and haven't studied yet: ${list(ahead, true)}`] : []),
    '',
    'Writing for this learner. The card is there to teach this word in this use; let that decide each sentence:',
    '- Keep what surrounds the word within what they can follow: words they recall, and everyday Hebrew. Then the word and its use are what the card asks of them. Don\'t lean on a word they can\'t rely on yet to carry the meaning of a sentence.',
    '- Some cards are shown in English and they say the whole sentence in Hebrew, so a word around the target that they could not say makes the card about the wrong thing.',
    '- Where it fits naturally, a card can bring back a word they are learning now, so they meet it again in a new sentence.',
    ...(stretch && ahead.length ? ['- At most one of these cards may also bring in one of the words they saved from their reading and haven\'t studied, where it fits naturally, so they meet it in a new sentence before they study it. Only those words: no other new or rare words come in this way, and never more than one per card. It is glossed on the card, so it costs them a tap.'] : []),
    '- These are ways to make a card useful, not a template. Not every card needs one, the lists are not words to use up, and the cards should be as natural and as varied as they would be without them: vary the people, settings and shapes, and don\'t bring the same listed words back from card to card. Keep each sentence as short as its use allows; bringing a word back is no reason to make it longer. A sentence an Israeli would really say always beats one that uses more listed words.',
  ].join('\n')
}

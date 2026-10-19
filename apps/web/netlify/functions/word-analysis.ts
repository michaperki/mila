import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { recordCacheHit, recordClaude } from './lib/ai-usage'
import { cachedAnswer, rememberAnswer } from './lib/ai-cache'

// Explains one tapped Hebrew word *in its sentence*: contextual meaning, prefix/suffix
// breakdown, lemma, root, binyan. Word-by-word machine translation can't do this
// (בחשבון in "מבחן בחשבון" is "in math", not "in the calculator").
export type WordAnalysis = {
  word: string
  vocalized: string
  meaning: string
  parts: { text: string; meaning: string }[]
  lemma: string
  lemmaPlain: string
  lemmaMeaning: string
  root: string
  partOfSpeech: string
  gender: string
  binyan: string
  form: string
  note: string
  readAs: string
  phrase: { text: string; meaning: string; textMeaning: string; kind: string; pattern: string; words: string[]; lemma: string; lemmaPlain: string; head: string; headPlain: string; partOfSpeech: string; binyan: string }
  excerpt: { text: string; meaning: string }
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['word', 'vocalized', 'meaning', 'parts', 'lemma', 'lemmaPlain', 'lemmaMeaning', 'root', 'partOfSpeech', 'gender', 'binyan', 'form', 'note', 'readAs', 'phrase', 'excerpt'],
  properties: {
    word: { type: 'string', description: 'The word exactly as given.' },
    vocalized: { type: 'string', description: 'The word with full niqqud as read in this sentence.' },
    meaning: { type: 'string', description: 'Short English meaning of this word in this sentence, including prefixes (e.g. "in math"). Read the word inside the construction it is part of: ראיתי in "ראיתי את עצמי כותב" is "I could see (myself)", not just "I saw". This is the main answer; other fields should not repeat it.' },
    parts: {
      type: 'array',
      description: 'Morphological pieces in reading order: attached prefixes (ו, ה, ב, כ, ל, מ, ש), the stem, any pronoun suffix. One item if the word has no affixes.',
      items: {
        type: 'object', additionalProperties: false, required: ['text', 'meaning'],
        properties: {
          text: { type: 'string' },
          meaning: { type: 'string', description: 'One to three English words: a prefix or suffix\'s function ("and", "the", "in", "my"), or the stem\'s basic meaning.' },
        },
      },
    },
    lemma: { type: 'string', description: 'Dictionary form, vocalized: verbs always as the infinitive with ל (לְהַדְבִּיק for הִדְבִּיק, never a past-tense form); adjectives masculine singular (יָפֶה for יָפוֹת); nouns singular without prefixes or possessive suffixes, unless the word only exists in the plural. A word that is a dictionary entry in its own right, such as an adverb or fixed expression written as one word (לְמַעֲשֶׂה, בְּעֶצֶם, לְפָחוֹת), is its own lemma; do not reduce it to the noun it came from. partOfSpeech, lemmaMeaning and root describe this lemma.' },
    lemmaPlain: { type: 'string', description: 'The same lemma without niqqud, in standard full spelling (כתיב מלא) as an Israeli newspaper prints it: לכתוב, not לכתב; it identifies the word, so always spell the same lemma the same way.' },
    lemmaMeaning: { type: 'string', description: 'The lemma\'s common English senses on its own, comma-separated, most common first; at most five. Verbs as "to …" ("to stick, to attach"). Leave out senses that only exist together with other words (those belong to the expression in "phrase"): להעמיד is "to stand (something) up, to set up", never "to pretend", which is להעמיד פנים.' },
    root: { type: 'string', description: 'Root letters joined with ־ (e.g. ח־ש־ב), or empty if none applies.' },
    partOfSpeech: { type: 'string', description: 'noun, verb, adjective, adverb, preposition, pronoun, number, name, or phrase.' },
    gender: { type: 'string', description: 'Nouns only: the lemma\'s grammatical gender, "masculine" or "feminine" (also for nouns whose form misleads, like שֻׁלְחָן masculine or עִיר feminine); otherwise empty.' },
    binyan: { type: 'string', description: 'Verbs only: binyan in Latin letters (pa\'al, nif\'al, pi\'el, pu\'al, hif\'il, huf\'al, hitpa\'el); otherwise empty.' },
    form: { type: 'string', description: 'Concise grammatical form, e.g. "past, 1st person singular" or "masculine singular, construct"; empty if trivial.' },
    note: { type: 'string', description: 'Only if it matters for understanding this sentence (an idiom, register, an irregular form): one short sentence that adds something no other field says. Do not restate the meaning, breakdown, lemma or grammar, and do not describe forms or vowel patterns that are not in the sentence. Usually empty.' },
    readAs: { type: 'string', description: 'If the tapped text is an OCR misreading (e.g. a dropped first letter), the word you believe is printed, without niqqud; otherwise empty. Analyze that word.' },
    phrase: {
      type: 'object', additionalProperties: false, required: ['text', 'meaning', 'textMeaning', 'kind', 'pattern', 'words', 'lemma', 'lemmaPlain', 'head', 'headPlain', 'partOfSpeech', 'binyan'],
      description: 'If the word belongs to a multi-word unit in this sentence that a learner has to learn as a unit, that unit; otherwise every field empty. A unit is an idiom or fixed expression, a multi-word name, a verb with the preposition or object it always takes (עוברים דרך, מעמיד פנים), a construct chain (סמיכות) only if it has a meaning of its own (בית ספר, עורך דין; not one whose meaning just adds up its words, like מבחן בחשבון or ספר המורה), or a pattern: a word that is used with an open place any word of a kind can fill (נטול ינשופים is נטול + a noun, as in נטול סוכר, נטולת דאגות).',
      properties: {
        text: { type: 'string', description: 'The stretch of the sentence from the unit\'s first word to its last, exactly as written.' },
        kind: { type: 'string', description: '"pattern" if the unit has an open place that other words fill in other sentences (נטול ינשופים: נטול + a noun); "fixed" if every word of it belongs to it (להעמיד פנים, בית ספר).' },
        pattern: { type: 'string', description: 'For a pattern: its fixed words in dictionary form, vocalized, with the open place as a bracketed Hebrew name of what fills it: נָטוּל + [שֵׁם עֶצֶם]. Otherwise empty.' },
        meaning: { type: 'string', description: 'The unit\'s English meaning as a dictionary gives it (verb expressions as "to …": "to go through", "to pretend"); for a pattern, with its open place in brackets ("free of [noun]").' },
        textMeaning: { type: 'string', description: 'What the unit means as written in this sentence, briefly ("owl-free", "we went through").' },
        words: { type: 'array', items: { type: 'string' }, description: 'Only the unit\'s own words, each exactly as written in the sentence (with prefixes), in order, leaving out any words that come between them: ["מעמיד", "פנים"] in "מעמיד את עצמו פנים". For a pattern, only its fixed words, not the word in its open place: ["נטול"] in "נטול ינשופים".' },
        lemma: { type: 'string', description: 'The unit\'s dictionary form, vocalized, with its inflecting word in dictionary form: לַעֲבֹר דֶּרֶךְ for עוברים דרך, לְהַעֲמִיד פָּנִים for מעמידה פנים. For a pattern, its fixed words only: נָטוּל for נטולת דאגות.' },
        lemmaPlain: { type: 'string', description: 'The same without niqqud, in standard full spelling (כתיב מלא): לעבור דרך, נטול.' },
        head: { type: 'string', description: 'The dictionary form, vocalized, of the word in the unit that inflects (לַעֲבֹר), or empty if none does.' },
        headPlain: { type: 'string', description: 'The same without niqqud, in full spelling (לעבור), or empty.' },
        partOfSpeech: { type: 'string', description: 'What the whole unit inflects as: verb, noun or adjective, or "other" if it is fixed.' },
        binyan: { type: 'string', description: 'If the inflecting word is a verb: its binyan in Latin letters; otherwise empty.' },
      },
    },
    excerpt: {
      type: 'object', additionalProperties: false, required: ['text', 'meaning'],
      description: 'For a flashcard: the shortest stretch of the sentence, copied exactly and containing the word, that still shows what the word means here (usually its clause, about 4 to 10 words), and a natural English translation of that stretch. Never cut a phrase the word depends on. Both empty if the sentence is already that short.',
      properties: { text: { type: 'string' }, meaning: { type: 'string' } },
    },
  },
} as const

const SYSTEM = `You are a Hebrew tutor inside a reading app for English-speaking learners. The learner tapped one word in a sentence they photographed. Analyze that word as it is used in that sentence. Text comes from OCR and may have recognition errors or missing niqqud. If the tapped word is misread, say what you read it as in readAs and analyze that word. Grammar claims must be ones you are certain of; leave a field empty rather than guess. Keep every English field short and write it in plain English; quote a Hebrew word only when the point is about that word, and never translate the same thing twice across fields. If the tapped text is not Hebrew, return it unchanged with your best short meaning and empty grammar fields.

The learner may select several words instead of one. Then explain them as one unit: "meaning" is what the words mean together here; "parts" lists each word (with its prefixes) and its meaning here; "lemma" and "lemmaMeaning" are the expression's dictionary form and senses only if it is a fixed expression, otherwise empty; root, binyan and form apply only if one word carries the meaning, otherwise empty; "partOfSpeech" is "phrase"; "phrase" and "readAs" are empty; "excerpt" is as for one word. If the words don't form a unit, still give their combined meaning and say so in "note".`

// The cache name for this prompt and schema: bump the version when either changes.
const CACHE_KIND = 'word-analysis-v5'
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
const cache = new Map<string, WordAnalysis>()
let client: Anthropic | null = null

export const handler: Handler = async (event) => {
  const requestId = randomUUID()
  if (event.httpMethod !== 'POST') return reply(405, { message: 'Use POST.' })
  try {
    const auth = verifyAuth(event)
    let payload: { word?: unknown; sentence?: unknown }
    try { payload = JSON.parse(event.body || '{}') } catch { return reply(400, { message: 'Invalid word request.' }) }
    const word = typeof payload.word === 'string' ? payload.word.trim() : ''
    const sentence = typeof payload.sentence === 'string' ? payload.sentence.trim() : ''
    // One tapped word, or a phrase of up to eight words dragged across in the reader.
    const words = word.split(/\s+/).length
    if (!word || word.length > 120 || words > 8 || sentence.length > 600) return reply(400, { message: 'Choose a word or a short phrase to explain.' })
    if (!process.env.ANTHROPIC_API_KEY) return reply(503, { message: 'Word explanations are not configured yet.', code: 'ANALYSIS_CONFIG', requestId })

    // The same word in the same sentence is only ever asked once: this instance's memory,
    // then the shared cache, then the model.
    const key = `${word}\u0000${sentence}`
    const started = Date.now()
    const cached = cache.get(key) ?? await cachedAnswer<WordAnalysis>(CACHE_KIND, key)
    if (cached) {
      await recordCacheHit(auth.userId, 'word', Date.now() - started)
      return reply(200, cached)
    }

    client ??= new Anthropic()
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      // A tap should feel instant; this is a short, well-specified lookup.
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // The instructions and schema are the same on every call; caching them makes a tap
      // cheaper and a little faster.
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Sentence: ${sentence || word}\n${words > 1 ? 'Selected words' : 'Tapped word'}: ${word}` }],
    }, { timeout: 15000, maxRetries: 1 })
    await recordClaude(auth.userId, 'word', response, Date.now() - started)

    if (response.stop_reason === 'refusal') return reply(422, { message: 'This word could not be explained.', code: 'ANALYSIS_REFUSED', requestId })
    const text = response.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')
    const analysis = JSON.parse(text) as WordAnalysis
    if (cache.size >= 500) cache.delete(cache.keys().next().value!)
    cache.set(key, analysis)
    await rememberAnswer(CACHE_KIND, key, analysis)
    return reply(200, analysis)
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    // Log the classification only; the learner's text stays out of logs.
    console.error('Word analysis failed', { requestId, name: (error as Error).name, status: error instanceof Anthropic.APIError ? error.status : undefined })
    return reply(503, { message: 'Word explanation is unavailable right now.', code: 'ANALYSIS_UNAVAILABLE', requestId })
  }
}

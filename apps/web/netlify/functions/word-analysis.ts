import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { checkDailySpend, recordCacheHit, recordClaude } from './lib/ai-usage'
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
  constructions: Construction[]
  phrase: { text: string; meaning: string; textMeaning: string; kind: string; pattern: string; examples: { text: string; meaning: string }[]; words: string[]; lemma: string; lemmaPlain: string; head: string; headPlain: string; partOfSpeech: string; binyan: string; literal: string; built: { lemma: string; lemmaPlain: string; meaning: string }[]; literalNote: string }
  excerpt: { text: string; meaning: string }
}

// One way a verb or adjective is built with what follows it, and what it means that way:
// לְהַזְכִּיר לְמִישֶׁהוּ אֶת מַשֶּׁהוּ, "to remind someone of something". `chip` is just its own
// grammatical words (לְ־ … אֶת) and `preposition` whether one is required, optional or none (את only).
export type Construction = { pattern: string; chip: string; preposition: 'required' | 'optional' | 'none'; meaning: string; short: string; example: string; exampleMeaning: string }

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['word', 'vocalized', 'meaning', 'parts', 'lemma', 'lemmaPlain', 'lemmaMeaning', 'root', 'partOfSpeech', 'gender', 'binyan', 'form', 'note', 'readAs', 'constructions', 'phrase', 'excerpt'],
  properties: {
    word: { type: 'string', description: 'The word exactly as given.' },
    vocalized: { type: 'string', description: 'The word with full niqqud as read in this sentence.' },
    meaning: { type: 'string', description: 'Short English meaning of this word in this sentence, including prefixes (e.g. "in math"). Read the word inside the construction it is part of: ראיתי in "ראיתי את עצמי כותב" is "I could see (myself)", not just "I saw". If the word is part of a pattern (see "phrase"), translate so the pattern shows through, keeping its open place visible: ונטול־ינשופים is "and free of owls", not "and owl-free". This is the main answer; other fields should not repeat it.' },
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
    form: { type: 'string', description: 'Concise grammatical form of the word\'s main piece (not its prefixes, and for words joined with a maqaf, the tapped word\'s own), e.g. "past, 1st person singular" or "masculine singular, construct"; empty if trivial.' },
    note: { type: 'string', description: 'Only if it matters for understanding this sentence (an idiom, register, an irregular form): one short sentence that adds something no other field says. Do not restate the meaning, breakdown, lemma or grammar, and do not describe forms or vowel patterns that are not in the sentence. Usually empty.' },
    readAs: { type: 'string', description: 'If the tapped text is an OCR misreading (e.g. a dropped first letter), the word you believe is printed, without niqqud; otherwise empty. Analyze that word.' },
    constructions: {
      type: 'array',
      description: 'For a verb or adjective, about the lemma rather than this sentence: the constructions a learner needs to use it naturally, each with the meaning it has in it, most common first, at most four. A construction belongs here when its preposition is one English would not lead to (להשתמש בְּ "to use", לחכות לְ "to wait for", לפחד מִ "to be afraid of", גאה בְּ "proud of"), or when the meaning depends on the construction (להזכיר אֶת "to mention", להזכיר לְ "to remind someone", להזכיר לְ… אֶת "to remind someone of"; להרהר בְּ "to contemplate", להרהר אַחֲרֵי "to question, to doubt"). A construction with only את belongs here only to set it apart from the word\'s other constructions, never on its own. Give only constructions of everyday modern Hebrew that you are certain of, in the word\'s common senses, not every preposition that could follow it: two that mean the same (להתגעגע לְ and אֶל) are one, the more common, and a slang or rare sense is left out. Never a preposition that only adds a place, time or direction as it would to any verb (ללכת לים), nor one that adds something extra the word does not need, such as what it is done with (להציף את הרחוב במים: להציף just takes a direct object); never ש, כי or an infinitive; never a pattern with a word of its own besides the word and its grammatical words (לבקש סליחה מ is an expression, not a construction of לבקש); and never a preposition that makes a separate expression with a meaning of its own (that is "phrase"). Empty for a word that just takes a direct object (להציף, לכתוב) or no complement, and for every other part of speech: most words have none, and none is a full answer.',
      items: {
        type: 'object', additionalProperties: false, required: ['pattern', 'chip', 'preposition', 'meaning', 'short', 'example', 'exampleMeaning'],
        properties: {
          pattern: { type: 'string', description: 'The construction in full, vocalized: the word in dictionary form, then its grammatical words with מִישֶׁהוּ or מַשֶּׁהוּ for what fills them: לְהִשְׁתַּמֵּשׁ בְּמַשֶּׁהוּ, לְהַזְכִּיר לְמִישֶׁהוּ אֶת מַשֶּׁהוּ.' },
          chip: { type: 'string', description: 'Only the construction\'s own grammatical words, vocalized, in order, without מישהו or משהו: a prefix with a maqaf (בְּ־, לְ־, מִ־), any other as its word (עַל, אַחֲרֵי, עִם, אֶת); two of them joined by " … " (לְ־ … אֶת).' },
          preposition: { type: 'string', enum: ['required', 'optional', 'none'], description: '"required" if the word takes this preposition whenever it has this complement; "optional" if it is as natural without it, in the same meaning; "none" if the construction has no preposition, only את.' },
          meaning: { type: 'string', description: 'The word in this construction, as a dictionary gives it: "to remind someone of something", "to contemplate something".' },
          short: { type: 'string', description: 'The same in 1 to 3 English words without "to", someone or something: "remind of", "contemplate".' },
          example: { type: 'string', description: 'One short, natural, everyday Hebrew sentence (4 to 9 words, no niqqud) using the word in this construction.' },
          exampleMeaning: { type: 'string', description: 'Its natural English translation.' },
        },
      },
    },
    phrase: {
      type: 'object', additionalProperties: false, required: ['text', 'meaning', 'textMeaning', 'kind', 'pattern', 'examples', 'words', 'lemma', 'lemmaPlain', 'head', 'headPlain', 'partOfSpeech', 'binyan', 'literal', 'built', 'literalNote'],
      description: 'If the word belongs to a unit in this sentence that a learner has to learn as a unit, that unit; otherwise every field empty. Most words belong to none: when unsure, leave it empty. There are two kinds. Fixed: an idiom or fixed expression whose words all belong to it and whose meaning is more than its words (להעמיד פנים, לשבור את הראש, בסופו של דבר, אין לי מושג), a multi-word name, or a construct chain (סמיכות) with a meaning of its own (בית ספר, עורך דין, ארוחת בוקר). A pattern: a word that, in this use, opens a frame with a place other words fill, and that a learner has to learn together with that frame, because its meaning or its grammar here depends on it: נטול + a noun ("free of"), חסר + a noun ("lacking"), בעל + a noun ("having"), כדי + an infinitive ("in order to"), a verb whose meaning with one preposition is not its meaning otherwise (לעמוד על, "to insist on"; לעבור על, "to go over, to violate"). Not a unit: words that only combine as usual, whatever their grammar: an adjective with its noun (ילד גדול, שמלה אדומה), a construct chain whose meaning adds up its words (ספר המורה, מבחן בחשבון), a verb with an ordinary object or place, and a verb with a preposition it takes in its usual meaning (השתמשתי במחשב, חיכיתי לך, חשבתי על זה): that construction is in "constructions" and the word stays a word.',
      properties: {
        text: { type: 'string', description: 'The stretch of the sentence from the unit\'s first word to its last, exactly as written.' },
        kind: { type: 'string', description: '"pattern" if the unit has an open place that other words fill in other sentences (נטול ינשופים: נטול + a noun); "fixed" if every word of it belongs to it (להעמיד פנים, בית ספר).' },
        pattern: { type: 'string', description: 'For a pattern: its fixed words in dictionary form, vocalized, with the open place as a bracketed Hebrew name of what fills it: נָטוּל + [שֵׁם עֶצֶם]. Otherwise empty.' },
        meaning: { type: 'string', description: 'The unit\'s English meaning as a dictionary gives it (verb expressions as "to …": "to go through", "to pretend"); for a pattern, with its open place in brackets ("free of [noun]").' },
        textMeaning: { type: 'string', description: 'What the unit means as written in this sentence, in natural English, briefly ("owl-free", "we went through").' },
        examples: {
          type: 'array', description: 'For a pattern: two short everyday examples, not from this sentence, each with a different word in the open place, at least one in another form of the word that inflects (נטול סוכר "sugar-free", נטולת דאגות "free of worries"). Otherwise empty.',
          items: { type: 'object', additionalProperties: false, required: ['text', 'meaning'], properties: { text: { type: 'string' }, meaning: { type: 'string' } } },
        },
        words: { type: 'array', items: { type: 'string' }, description: 'Only the unit\'s own words, each exactly as written in the sentence (with prefixes), in order, leaving out any words that come between them: ["מעמיד", "פנים"] in "מעמיד את עצמו פנים". For a pattern, only its fixed words, not the word in its open place: ["נטול"] in "נטול ינשופים".' },
        lemma: { type: 'string', description: 'The unit\'s dictionary form, vocalized, with its inflecting word in dictionary form: לַעֲבֹר דֶּרֶךְ for עוברים דרך, לְהַעֲמִיד פָּנִים for מעמידה פנים. For a pattern, its fixed words only: נָטוּל for נטולת דאגות.' },
        lemmaPlain: { type: 'string', description: 'The same without niqqud, in standard full spelling (כתיב מלא): לעבור דרך, נטול.' },
        head: { type: 'string', description: 'The dictionary form, vocalized, of the word in the unit that inflects (לַעֲבֹר), or empty if none does.' },
        headPlain: { type: 'string', description: 'The same without niqqud, in full spelling (לעבור), or empty.' },
        partOfSpeech: { type: 'string', description: 'What the whole unit inflects as: verb, noun or adjective, or "other" if it is fixed.' },
        binyan: { type: 'string', description: 'If the inflecting word is a verb: its binyan in Latin letters; otherwise empty.' },
        literal: { type: 'string', description: 'For a fixed unit of two or more words: what it says word for word, in English, when seeing that helps a learner understand or remember why it means what it does ("for the sake of the truth" for למען האמת, "at the end of the matter" for בסופו של דבר). Empty for a pattern, and for a unit whose literal reading adds nothing to its meaning (ארוחת בוקר is "breakfast").' },
        built: {
          type: 'array', description: 'Whenever "literal" is given: each word of the unit in its own dictionary form, vocalized, without the prefixes ה, ו, ב, ל, מ, ש, כ unless they are part of the word (לְמַעַן keeps its ל), with its plain spelling and the meaning it has inside this unit, in order. Otherwise empty.',
          items: { type: 'object', additionalProperties: false, required: ['lemma', 'lemmaPlain', 'meaning'], properties: { lemma: { type: 'string' }, lemmaPlain: { type: 'string', description: 'Without niqqud, in full spelling.' }, meaning: { type: 'string', description: '1 to 4 English words.' } } },
        },
        literalNote: { type: 'string', description: 'Whenever "literal" is given and only if it helps: one short sentence on how the literal reading comes to mean what the unit means or how it is used ("Introduces an honest admission."). Only what you are certain of; never a guessed history of the expression. Usually empty.' },
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

The learner may select several words instead of one. Then explain them as one unit: "meaning" is what the words mean together here; "parts" lists each word (with its prefixes) and its meaning here; "lemma" and "lemmaMeaning" are the expression's dictionary form and senses only if it is a fixed expression, otherwise empty; root, binyan and form apply only if one word carries the meaning, otherwise empty; "partOfSpeech" is "phrase"; "readAs" is empty; "phrase" is empty unless the selected words are a use of a pattern or part of a larger fixed expression, and then it is that unit, as for one word; "excerpt" is as for one word. If the words don't form a unit, still give their combined meaning and say so in "note".`

// The model request for one tapped word (or selected words) in its sentence; also used by the
// phrase evaluation (tests/eval/phrases.eval.ts), so it measures exactly what the app asks.
export const analysisRequest = (word: string, sentence: string) => ({
  model: 'claude-opus-5-5',
  max_tokens: 4000,
  // A tap should feel instant; this is a short, well-specified lookup.
  output_config: { effort: 'low' as const, format: { type: 'json_schema' as const, schema } },
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default' as const,
  // The instructions and schema are the same on every call; caching them makes a tap
  // cheaper and a little faster.
  system: [{ type: 'text' as const, text: SYSTEM, cache_control: { type: 'ephemeral' as const } }],
  messages: [{ role: 'user' as const, content: `Sentence: ${sentence || word}\n${word.split(/\s+/).length > 1 ? 'Selected words' : 'Tapped word'}: ${word}` }],
})

// A word's constructions as they can be trusted: never ש or כי (not prepositions, though the
// model sometimes lists them), and never a lone את construction, which says only that the word
// takes a direct object, as most do.
const plainHebrew = (text: string) => text.replace(/[\u0591-\u05C7]/g, '').replace(/[\u05BE\-–…]/g, ' ').trim()
// A pattern is the word, then only grammatical words and מישהו or משהו (with a prefix: בְּמַשֶּׁהוּ),
// never another word of its own (לבקש סליחה ממישהו is an expression).
const GRAMMATICAL = new Set(['את', 'אות', 'על', 'עם', 'אל', 'אחרי', 'אחר', 'אצל', 'בין', 'בעד', 'נגד', 'לפני', 'מפני', 'כלפי', 'לגבי', 'בשביל', 'מול', 'עד', 'כמו', 'לקראת', 'אודות', 'בגלל', 'מן'])
const placeholder = (word: string) => /^(ו|ב|ל|מ|מ־|כ)?(מישהו|משהו)$/.test(word) || /^(ב|ל|מ|כ)?(מי|מה)$/.test(word)
const builtOnlyOfGrammar = (item: Construction, lemma: string) => {
  const words = plainHebrew(item.pattern).replace(/[()]/g, '').split(/\s+/).filter(Boolean)
  const own = plainHebrew(lemma).split(/\s+/).length
  return words.length > own && words.slice(own).every(word => GRAMMATICAL.has(word) || placeholder(word) || /^(ב|ל|מ)$/.test(word))
}
export const trustedConstructions = (analysis: WordAnalysis): WordAnalysis => {
  const kept = (analysis.constructions || []).filter(item => item.pattern?.trim() && item.chip?.trim() && item.meaning?.trim()
    && !plainHebrew(item.chip).split(/\s+/).some(word => word === 'ש' || word === 'כי')
    && builtOnlyOfGrammar(item, analysis.lemma || analysis.word)).slice(0, 4)
  return { ...analysis, constructions: kept.every(item => item.preposition === 'none') ? [] : kept }
}

// The cache name for this prompt and schema: bump the version when either changes.
const CACHE_KIND = 'word-analysis-v9'
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

    await checkDailySpend(auth)
    client ??= new Anthropic()
    const response = await client.beta.messages.create(analysisRequest(word, sentence), { timeout: 15000, maxRetries: 1 })
    await recordClaude(auth.userId, 'word', response, Date.now() - started)

    if (response.stop_reason === 'refusal') return reply(422, { message: 'This word could not be explained.', code: 'ANALYSIS_REFUSED', requestId })
    const text = response.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')
    const analysis = trustedConstructions(JSON.parse(text) as WordAnalysis)
    if (cache.size >= 500) cache.delete(cache.keys().next().value!)
    cache.set(key, analysis)
    await rememberAnswer(CACHE_KIND, key, analysis)
    return reply(200, analysis)
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    if (status === 429) return reply(429, { message: (error as Error).message, code: 'DAILY_LIMIT', requestId })
    // Log the classification only; the learner's text stays out of logs.
    console.error('Word analysis failed', { requestId, name: (error as Error).name, status: error instanceof Anthropic.APIError ? error.status : undefined })
    return reply(503, { message: 'Word explanation is unavailable right now.', code: 'ANALYSIS_UNAVAILABLE', requestId })
  }
}

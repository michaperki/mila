import Anthropic from '@anthropic-ai/sdk'
import { verifyAuth } from './auth'
import { checkDailySpend, type Feature, recordCacheHit, recordClaude } from './ai-usage'
import { cachedAnswer, rememberAnswer } from './ai-cache'
import type { Gloss } from './forms-writer'

// The words of one sentence, each with its meaning there and, given the sentence's English, the
// words of the English that say it: one small, fast call per sentence, kept for every learner
// (aiCache). Used by the reader's quick meanings (sentence-glosses) and to give a Study card
// written before its glosses said so the same word data new cards are written with (card-words).
const meaning = { type: 'string', description: 'Its meaning in this sentence in 1 to 4 English words, including attached prefixes and suffixes ("and in the house", "his"). For a word that is part of an expression, its meaning within the expression.' } as const
const rendered = { type: 'string', description: 'The words of the English translation that say this word, copied exactly from it and in its order ("quietly", "to him"), or "" if no words of the translation say it on their own.' } as const
const schemaOf = (aligned: boolean) => ({
  type: 'object', additionalProperties: false, required: ['meanings'],
  properties: {
    meanings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: aligned ? ['n', 'meaning', 'inTranslation'] : ['n', 'meaning'],
        properties: { n: { type: 'integer', description: 'The word\'s number.' }, meaning, ...(aligned ? { inTranslation: rendered } : {}) },
      },
    },
  },
}) as const

const SYSTEM = 'You help an English-speaking learner read modern Hebrew. Given a sentence and its numbered words, give each word\'s meaning as used in this sentence, briefly and in plain English. The text may come from OCR; read a misrecognized word as the word that is most likely printed.'
// The cache name for this prompt and schema: bump the version when either changes.
const CACHE_KIND = 'sentence-glosses-v1'
const ALIGNED_KIND = 'sentence-glosses-aligned-v1'
export type Answer = { meanings: string[]; renders?: string[] }
const cache = new Map<string, Answer>()
let client: Anthropic | null = null

// Answers or throws: { statusCode: 422 } when the model gives none; the spend check's 429.
export async function sentenceWords({ sentence, words, translation }: { sentence: string; words: string[]; translation?: string }, auth: ReturnType<typeof verifyAuth>, feature: Feature): Promise<Answer> {
  const kind = translation ? ALIGNED_KIND : CACHE_KIND
  const key = `${sentence}\u0000${words.join(' ')}${translation ? `\u0000${translation}` : ''}`
  const started = Date.now()
  // Kept as the meanings alone before `renders` (the unaligned kind still is).
  const stored = cache.get(`${kind}\u0000${key}`) ?? await cachedAnswer<string[] | Answer>(kind, key)
  if (stored) {
    await recordCacheHit(auth.userId, feature, Date.now() - started)
    return Array.isArray(stored) ? { meanings: stored } : stored
  }
  await checkDailySpend(auth)
  client ??= new Anthropic()
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 3000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: schemaOf(!!translation) } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content: `Sentence: ${sentence}\n${translation ? `English translation: ${translation}\n` : ''}Words:\n${words.map((word, i) => `${i + 1}. ${word}`).join('\n')}` }],
  }, { timeout: 20000, maxRetries: 1 })
  await recordClaude(auth.userId, feature, response, Date.now() - started)
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') throw Object.assign(new Error('No meanings for this sentence.'), { statusCode: 422 })
  const text = response.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')
  const answer = (JSON.parse(text) as { meanings: { n: number; meaning: string; inTranslation?: string }[] }).meanings
  // One meaning per word, in the words' order; a word the model skipped gets ''.
  const meanings = words.map((_, i) => answer.find(item => item.n === i + 1)?.meaning.trim() || '')
  const result: Answer = translation ? { meanings, renders: words.map((_, i) => answer.find(item => item.n === i + 1)?.inTranslation?.trim() || '') } : { meanings }
  if (cache.size >= 300) cache.delete(cache.keys().next().value!)
  cache.set(`${kind}\u0000${key}`, result)
  // The unaligned kind is kept as before, the meanings alone, for the answers already kept.
  await rememberAnswer(kind, key, translation ? result : meanings)
  return result
}

// A word as a card's tap finds it (mobile ocr-cleanup bareWord), and without niqqud.
export const bareWord = (text: string) => text.replace(/^[\s.,!?;:״"'׳()[\]{}«»\-–—]+|[\s.,!?;:״"'׳()[\]{}«»\-–—]+$/g, '')
const plain = (text: string) => bareWord(text).replace(/[\u0591-\u05C7]/g, '')

// A card sentence's glosses with the English words each says (`t`), from a sentence's words: its
// glosses as they were with `t` added, or, for one written without, a gloss for each word but the
// card's own (`mark`, left out as the writer leaves it out), its dictionary form unknown ('').
export function glossesWith(sentence: string, mark: string | undefined, glosses: Gloss[] | undefined, answer: Answer): Gloss[] {
  const t = (i: number) => answer.renders?.[i]?.trim() ?? ''
  if (glosses?.length) return glosses.map(gloss => ({ ...gloss, t: t(gloss.i) }))
  const own = new Set((mark || '').split(/\s+/).map(plain).filter(Boolean))
  return sentence.split(/\s+/).filter(Boolean).flatMap((word, i) => (own.has(plain(word)) || !answer.meanings[i] ? [] : [{ i, lemma: '', en: answer.meanings[i], t: t(i) }]))
}

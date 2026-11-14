import { isListed, PREFIXES, plainWord, rankOfForm } from './frequency.ts'
import { lemmaKeyOf, type LearnerEntry } from './learner.ts'

// How much each saved word comes up in what the learner reads: a measure of how relevant it is to
// them, apart from how common it is in Hebrew at large (lib/frequency.ts). Every word of every saved
// passage is matched to a saved word by the forms that word is known in (its dictionary form, the
// forms it was met in and its cards' forms), as written or, for a form that is neither one of those
// nor a listed Hebrew word, without a prefix (so כלב, a word of its own, isn't taken for כ + לב).
// Only forms seen somewhere are matched, so a word met in a form never
// saved isn't counted there: counts are at least what they say, not exactly it. Expressions of
// several words aren't counted. `read` counts only the part of a passage read so far: as far as
// its progress says, or for a passage saved before progress was kept, as far as the last sentence
// a word was saved from (so at least that much was read). A passage saved more than once (the
// same sentences) is counted once.
export type TextDoc = { id?: string; textId?: string; title?: string; chunks?: { text?: string; type?: string }[]; furthestSegment?: number; lastSegment?: number }
export type WordExposure = { key: string; total: number; read: number; texts: number; forms: Record<string, number> }
export type Exposure = {
  words: Map<string, WordExposure>
  tokens: number; readTokens: number; texts: number; duplicates: number; withoutProgress: number
  // Forms that come up often in the passages and are no saved word's: maybe worth knowing.
  unmatched: { form: string; count: number; rank?: number }[]
}

const tokensOf = (text: string) => plainWord(text).replace(/[׳'"״]/g, '').split(/[\s־-]+/).filter(word => word.length > 1)

export function readingExposure(texts: TextDoc[], entries: LearnerEntry[]): Exposure {
  // Each known form, to the saved words it is a form of (a form can be two words': שמח).
  const byForm = new Map<string, Set<string>>()
  for (const entry of entries) {
    const key = lemmaKeyOf(entry.lemmaPlain || entry.lemma)
    if (key.includes(' ')) continue
    const forms = [entry.lemmaPlain, entry.lemma, ...(entry.encounters || []).map(met => met.surface), ...(entry.forms || []).map(form => form.he)]
    for (const form of forms) {
      if (!form) continue
      const plain = lemmaKeyOf(form)
      if (!plain || plain.includes(' ')) continue
      if (!byForm.has(plain)) byForm.set(plain, new Set())
      byForm.get(plain)!.add(key)
    }
  }
  const match = (token: string): string[] => {
    const own = byForm.get(token)
    if (own) return [...own]
    if (isListed(token)) return []
    for (const prefix of PREFIXES) {
      if (!token.startsWith(prefix) || token.length - prefix.length < 2) continue
      const found = byForm.get(token.slice(prefix.length))
      if (found) return [...found]
    }
    return []
  }
  // The furthest sentence of each passage a word was saved from.
  const savedFrom = new Map<string, number>()
  for (const entry of entries) {
    for (const met of entry.encounters || []) {
      const ref = met.sourceRef
      const at = ref ? Number(ref.chunkId.slice(ref.textId.length + 1)) : NaN
      if (ref && Number.isInteger(at)) savedFrom.set(ref.textId, Math.max(savedFrom.get(ref.textId) ?? -1, at))
    }
  }
  const unique = new Map<string, TextDoc & { recorded: boolean }>()
  for (const text of texts) {
    const content = (text.chunks || []).map(chunk => chunk.text || '').join('\n')
    const id = text.textId || text.id || ''
    const read = Math.max(text.furthestSegment ?? text.lastSegment ?? -1, savedFrom.get(id) ?? -1)
    const before = unique.get(content)
    const progress = Math.max(read, before ? (before.furthestSegment ?? -1) : -1)
    unique.set(content, { ...text, furthestSegment: progress, lastSegment: progress, recorded: !!before?.recorded || text.furthestSegment != null || text.lastSegment != null })
  }
  const words = new Map<string, WordExposure>()
  const loose = new Map<string, number>()
  let tokens = 0, readTokens = 0
  for (const text of unique.values()) {
    const read = text.furthestSegment ?? -1
    const seenHere = new Set<string>()
    ;(text.chunks || []).forEach((chunk, i) => {
      for (const token of tokensOf(chunk.text || '')) {
        tokens++
        if (i <= read) readTokens++
        const keys = match(token)
        if (!keys.length) { loose.set(token, (loose.get(token) ?? 0) + 1); continue }
        for (const key of keys) {
          let found = words.get(key)
          if (!found) words.set(key, found = { key, total: 0, read: 0, texts: 0, forms: {} })
          found.total++
          if (i <= read) found.read++
          found.forms[token] = (found.forms[token] ?? 0) + 1
          if (!seenHere.has(key)) { seenHere.add(key); found.texts++ }
        }
      }
    })
  }
  const unmatched = [...loose.entries()].filter(([, count]) => count >= 3)
    .map(([form, count]) => ({ form, count, rank: rankOfForm(form) })).sort((a, b) => b.count - a.count)
  const withoutProgress = [...unique.values()].filter(text => !text.recorded).length
  return { words, tokens, readTokens, texts: unique.size, duplicates: texts.length - unique.size, withoutProgress, unmatched }
}

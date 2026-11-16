import type { Handler } from '@netlify/functions'
import { getDb } from './lib/mongo'
import { verifyAuth } from './lib/auth'
import type { LearnerEvent } from './lib/learner'
import { relevanceOf } from './lib/relevance'
import { organisationOf } from './lib/taxonomy'
import { lemmaKeyOf } from './lib/lemma'

const handler: Handler = async (event) => {
  try {
    const auth = verifyAuth(event)
    const db = await getDb()
    const vocab = db.collection('vocab')

    if (event.httpMethod === 'GET') {
      const [docs, lookups] = await Promise.all([
        // Archived words (an import set them aside, DATA-1) stay saved but leave Study and the list.
        vocab.find({ userId: auth.userId, archived: { $ne: true } }).sort({ createdAt: -1 }).toArray(),
        db.collection('studyEvents').find({ userId: auth.userId, type: 'lookup' }).project<LearnerEvent>({ _id: 0, userId: 0 }).toArray().catch(() => []),
      ])
      const sanitized = relevanceOf(docs.map(({ _id, ...rest }) => normalizeItem(rest)), lookups)
      return {
        statusCode: 200,
        body: JSON.stringify({ vocab: sanitized }),
      }
    }

    if (event.httpMethod === 'POST') {
      if (!event.body) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Missing body' }) }
      }

      const payload = JSON.parse(event.body)
      const id = payload.id || (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
      const createdAt =
        typeof payload.createdAt === 'number'
          ? payload.createdAt
          : payload.createdAt
          ? new Date(payload.createdAt).getTime()
          : Date.now()

      // `encounter` (mobile): one place the word was met. It is added to the entry's
      // `encounters` (one per sentence, newest last) instead of replacing the entry's context,
      // so meeting a word again in another book keeps one entry and one practice history.
      // `rank` and `lookedUp` are worked out on every fetch (relevanceOf), never kept.
      // Themes and register come from the save's explanation (VOCAB-2) and are kept only where the
      // word has none yet: an import's, or an earlier save's, stay.
      const { encounter, createdAt: _sent, rank: _rank, lookedUp: _lookedUp, categories, register, taxonomy: _taxonomy, level: _level, ...fields } = payload
      const organised = organisationOf({ categories, register })
      if (encounter !== undefined && !(encounter && typeof encounter === 'object' && typeof encounter.context === 'string')) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid encounter' }) }
      }
      // One entry per word: a save whose dictionary form is already saved under another id
      // (other vowels, an older save) is added to that entry rather than starting a second one.
      const lemmaKey = typeof fields.lemma === 'string' ? lemmaKeyOf(typeof fields.lemmaPlain === 'string' && fields.lemmaPlain ? fields.lemmaPlain : fields.lemma) : ''
      const same = lemmaKey ? await vocab.findOne<{ id: string }>({ userId: auth.userId, lemmaKey, id: { $ne: id } }, { projection: { id: 1 } }) : null
      const target = same?.id ?? id
      const doc = {
        ...fields,
        id: target,
        ...(lemmaKey ? { lemmaKey } : {}),
        userId: auth.userId,
        updatedAt: Date.now(),
      }

      if (encounter) await vocab.updateOne({ userId: auth.userId, id: target }, { $pull: { encounters: { context: encounter.context } } } as never)
      await vocab.updateOne(
        { userId: auth.userId, id: target },
        {
          $set: doc,
          // Saving again keeps the word's place in the practice order.
          $setOnInsert: { createdAt },
          ...(encounter ? { $push: { encounters: { $each: [encounter], $slice: -20 } } } : {}),
          // Saved again from reading: back from the archive.
          ...(encounter ? { $unset: { archived: '' } } : {}),
        } as never,
        { upsert: true },
      )
      if (organised) await vocab.updateOne({ userId: auth.userId, id: target, taxonomy: { $exists: false } }, { $set: organised })
      return {
        statusCode: 200,
        body: JSON.stringify({ item: normalizeItem({ ...doc, createdAt }) }),
      }
    }

    // Records practice without touching the rest of the entry (POST replaces it): `form` is one
    // form card's results, `checkpoint` one stage's checkpoint results, `results` the word card's
    // own, `known` the stages the learner marked as known and `opened` those they chose to study
    // before Mila brought them in. Results are what was answered, never a date to come back; with
    // them, `primed` says which were answered just after the word was shown. Sent without it (by
    // an app from before), it is cleared so it can't be read against the wrong answers.
    // A result is the card's whole record, sent again until it arrives (mobile lib/results.ts):
    // kept only if it is no older than the one stored (`last`), so the same one twice changes
    // nothing and an older one arriving late is ignored (204 either way).
    if (event.httpMethod === 'PATCH') {
      const payload = JSON.parse(event.body || '{}')
      const id = payload.id
      if (typeof id !== 'string') return { statusCode: 400, body: JSON.stringify({ message: 'Missing vocab id' }) }
      // Undoing a save: `unsave` is the sentence it was saved from. That encounter goes; an entry
      // left with no encounters and never practised goes with it, so undoing the first save of a
      // word leaves nothing behind while undoing a later one keeps the word and its history.
      if (typeof payload.unsave === 'string') {
        await vocab.updateOne({ userId: auth.userId, id }, { $pull: { encounters: { context: payload.unsave } }, $set: { updatedAt: Date.now() } } as never)
        const { deletedCount } = await vocab.deleteOne({
          userId: auth.userId, id, encounters: { $size: 0 }, results: { $exists: false }, 'forms.results': { $exists: false }, checkpoints: { $exists: false },
        })
        return { statusCode: 200, body: JSON.stringify({ deleted: deletedCount > 0 }) }
      }
      let filter: Record<string, unknown> = { userId: auth.userId, id }
      let set: Record<string, unknown>
      let unset: Record<string, ''> | undefined
      let options: { arrayFilters: Record<string, unknown>[] } | undefined
      if (Array.isArray(payload.known) || Array.isArray(payload.opened)) {
        const field = Array.isArray(payload.known) ? 'known' : 'opened'
        if (!payload[field].every((stage: unknown) => typeof stage === 'string')) return { statusCode: 400, body: JSON.stringify({ message: 'Invalid stages' }) }
        set = { [field]: payload[field] }
      } else if (payload.form) {
        // A sentence card's `on` (which of its sentences each result was given on) and `seen`
        // (every sentence it was answered on) come with them from Study; kept as they were if not.
        const { key, results, last, primed, on, seen } = payload.form
        if (typeof key !== 'string' || !isResults(results, last) || !isPrimed(primed, results) || !isOn(on, results) || !isSeen(seen)) return { statusCode: 400, body: JSON.stringify({ message: 'Invalid result' }) }
        filter = { ...filter, 'forms.key': key }
        set = { 'forms.$[card].results': results, 'forms.$[card].last': last, ...(primed ? { 'forms.$[card].primed': primed } : {}), ...(on ? { 'forms.$[card].on': on, 'forms.$[card].seen': seen ?? [] } : {}) }
        if (!primed) unset = { 'forms.$[card].primed': '' }
        options = { arrayFilters: [{ 'card.key': key, ...noOlder('card.last', last) }] }
      } else if (payload.checkpoint) {
        const { stage, results, last, primed } = payload.checkpoint
        if (typeof stage !== 'string' || !/^[a-z]+$/.test(stage) || !isResults(results, last) || !isPrimed(primed, results)) return { statusCode: 400, body: JSON.stringify({ message: 'Invalid result' }) }
        set = { [`checkpoints.${stage}`]: { results, last, ...(primed ? { primed } : {}) } }
        filter = { ...filter, ...noOlder(`checkpoints.${stage}.last`, last) }
      } else if (isResults(payload.results, payload.last) && isPrimed(payload.primed, payload.results)) {
        set = { results: payload.results, last: payload.last, ...(payload.primed ? { primed: payload.primed } : {}) }
        filter = { ...filter, ...noOlder('last', payload.last) }
        if (!payload.primed) unset = { primed: '' }
      } else return { statusCode: 400, body: JSON.stringify({ message: 'Invalid result' }) }
      const result = await vocab.updateOne(filter, { $set: { ...set, updatedAt: Date.now() }, ...(unset ? { $unset: unset } : {}) }, options)
      // Not matched: the word is gone, or what is stored is newer than this.
      if (!result.matchedCount && !(await vocab.countDocuments({ userId: auth.userId, id }, { limit: 1 }))) return { statusCode: 404, body: JSON.stringify({ message: 'This word is no longer saved.' }) }
      return { statusCode: 204, body: '' }
    }

    if (event.httpMethod === 'DELETE') {
      // `all=1` clears the whole list (Account → Delete all saved words); it must be explicit,
      // so a request that merely lacks an id still fails.
      if (event.queryStringParameters?.all === '1') {
        const { deletedCount } = await vocab.deleteMany({ userId: auth.userId })
        return { statusCode: 200, body: JSON.stringify({ deleted: deletedCount }) }
      }
      const id = event.queryStringParameters?.id
      if (!id) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Missing vocab id' }) }
      }

      await vocab.deleteOne({ userId: auth.userId, id })
      return { statusCode: 204, body: '' }
    }

    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) }
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500
    return {
      statusCode,
      body: JSON.stringify({ message: (error as Error).message || 'Unexpected error' }),
    }
  }
}

export { handler }

// A card's last few results (true: knew it) and when it was answered.
const isResults = (results: unknown, last: unknown) => Array.isArray(results) && results.length <= 10
  && results.every(value => typeof value === 'boolean') && typeof last === 'number' && Number.isFinite(last)
// Which of those results were primed, by position: missing, or one boolean per result.
const isPrimed = (primed: unknown, results: unknown) => primed === undefined
  || (Array.isArray(primed) && Array.isArray(results) && primed.length === results.length && primed.every(value => typeof value === 'boolean'))

// A record is kept only over one no newer than it (or none).
const noOlder = (field: string, last: number) => ({ $or: [{ [field]: { $exists: false } }, { [field]: { $lte: last } }] })
// Which sentence each of those results was given on (-1 not known), and the sentences answered on.
const isOn = (on: unknown, results: unknown) => on === undefined
  || (Array.isArray(on) && Array.isArray(results) && on.length === results.length && on.every(value => Number.isInteger(value) && value >= -1 && value < 10))
const isSeen = (seen: unknown) => seen === undefined || (Array.isArray(seen) && seen.length <= 10 && seen.every(value => Number.isInteger(value) && value >= 0 && value < 10))

const normalizeItem = (item: any) => ({
  ...item,
  id: item.id ?? item._id ?? crypto.randomUUID(),
  lemma: typeof item.lemma === 'string' ? item.lemma.replace(/[,،，]+/g, '').trim() : item.lemma,
  createdAt:
    typeof item.createdAt === 'number'
      ? item.createdAt
      : item.createdAt
      ? new Date(item.createdAt).getTime()
      : Date.now(),
  frequency: item.frequency && item.frequency > 0 ? item.frequency : 1,
})

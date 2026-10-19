import type { Handler } from '@netlify/functions'
import { getDb } from './lib/mongo'
import { verifyAuth } from './lib/auth'

const handler: Handler = async (event) => {
  try {
    const auth = verifyAuth(event)
    const db = await getDb()
    const vocab = db.collection('vocab')

    if (event.httpMethod === 'GET') {
      const docs = await vocab.find({ userId: auth.userId }).sort({ createdAt: -1 }).toArray()
      const sanitized = docs.map(({ _id, ...rest }) => normalizeItem(rest))
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
      const { encounter, createdAt: _sent, ...fields } = payload
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
        } as never,
        { upsert: true },
      )
      return {
        statusCode: 200,
        body: JSON.stringify({ item: normalizeItem({ ...doc, createdAt }) }),
      }
    }

    // Records practice without touching the rest of the entry (POST replaces it): `form` is one
    // form card's results, `checkpoint` one stage's checkpoint results, `results` the word card's
    // own, `known` the stages the learner marked as known and `opened` those they chose to study
    // before Mila brought them in. Results are what was answered, never a date to come back.
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
      let options: { arrayFilters: Record<string, unknown>[] } | undefined
      if (Array.isArray(payload.known) || Array.isArray(payload.opened)) {
        const field = Array.isArray(payload.known) ? 'known' : 'opened'
        if (!payload[field].every((stage: unknown) => typeof stage === 'string')) return { statusCode: 400, body: JSON.stringify({ message: 'Invalid stages' }) }
        set = { [field]: payload[field] }
      } else if (payload.form) {
        const { key, results, last } = payload.form
        if (typeof key !== 'string' || !isResults(results, last)) return { statusCode: 400, body: JSON.stringify({ message: 'Invalid result' }) }
        filter = { ...filter, 'forms.key': key }
        set = { 'forms.$[card].results': results, 'forms.$[card].last': last }
        options = { arrayFilters: [{ 'card.key': key }] }
      } else if (payload.checkpoint) {
        const { stage, results, last } = payload.checkpoint
        if (typeof stage !== 'string' || !/^[a-z]+$/.test(stage) || !isResults(results, last)) return { statusCode: 400, body: JSON.stringify({ message: 'Invalid result' }) }
        set = { [`checkpoints.${stage}`]: { results, last } }
      } else if (isResults(payload.results, payload.last)) {
        set = { results: payload.results, last: payload.last }
      } else return { statusCode: 400, body: JSON.stringify({ message: 'Invalid result' }) }
      const result = await vocab.updateOne(filter, { $set: { ...set, updatedAt: Date.now() } }, options)
      if (!result.matchedCount) return { statusCode: 404, body: JSON.stringify({ message: 'This word is no longer saved.' }) }
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

// A word's identity: its dictionary form as plainly written (no niqqud, a maqaf read as a space),
// so the same word saved with other vowels is one entry. Mirrors apps/mobile/src/lib/words.ts.
const lemmaKeyOf = (text: string) => text.normalize('NFC').replace(/[\u05BE\-–]/g, ' ').replace(/[\u0591-\u05C7]/g, '')
  .replace(/'/g, '׳').replace(/"/g, '״').replace(/[,،，.!?]/g, '').replace(/\s+/g, ' ').trim()

// A card's last few results (true: knew it) and when it was answered.
const isResults = (results: unknown, last: unknown) => Array.isArray(results) && results.length <= 10
  && results.every(value => typeof value === 'boolean') && typeof last === 'number' && Number.isFinite(last)

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

import { createHash } from 'node:crypto'
import { getDb } from './mongo'

// Answers the model already gave, kept in MongoDB so the same question (a word in the same
// sentence, a sentence's quick meanings) is never paid for twice: not after an app restart,
// not on another function instance, not for another reader of the same page. `kind` names and
// versions the question; bump it when a prompt or schema changes so old answers aren't served.
// The cache must never fail the request it serves: errors read as a miss.
type Cached = { _id: string; kind: string; value: unknown; at: Date }
const keyOf = (kind: string, input: string) => createHash('sha256').update(`${kind}\u0000${input}`).digest('hex')
const answers = async () => (await getDb()).collection<Cached>('aiCache')

export async function cachedAnswer<T>(kind: string, input: string): Promise<T | undefined> {
  try {
    const found = await (await answers()).findOne({ _id: keyOf(kind, input) })
    return found?.value as T | undefined
  } catch (error) {
    console.error('AI cache read failed', { kind, name: (error as Error).name })
    return undefined
  }
}

export async function rememberAnswer(kind: string, input: string, value: unknown) {
  try {
    await (await answers()).updateOne({ _id: keyOf(kind, input) }, { $set: { kind, value, at: new Date() } }, { upsert: true })
  } catch (error) {
    console.error('AI cache write failed', { kind, name: (error as Error).name })
  }
}

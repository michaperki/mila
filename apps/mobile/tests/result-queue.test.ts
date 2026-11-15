import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drain, enqueue, type Outcome, type Pending, type ResultBody, withPending } from '../src/lib/result-queue.ts'
import type { VocabEntry } from '../src/lib/types.ts'

const card = (key: string, results: boolean[], last: number): ResultBody => ({ id: 'w', form: { key, results, last } })
// A queue kept as the file would keep it: read and written whole.
const store = (start: Pending[] = []) => {
  let saved = JSON.stringify(start)
  return { read: () => JSON.parse(saved) as Pending[], write: (queue: Pending[]) => { saved = JSON.stringify(queue) } }
}

test('only the newest update per card waits, and an older one never replaces it', () => {
  let queue = enqueue([], 'me', card('present:m.sg', [true], 1))
  queue = enqueue(queue, 'me', card('present:f.sg', [false], 2))
  queue = enqueue(queue, 'me', card('present:m.sg', [true, false], 3))
  assert.deepEqual(queue.map(item => [item.target, item.last]), [['w|form|present:f.sg', 2], ['w|form|present:m.sg', 3]])
  assert.equal(enqueue(queue, 'me', card('present:m.sg', [true], 1)), queue)
  // Another account's waits apart.
  assert.equal(enqueue(queue, 'other', card('present:m.sg', [true], 1)).length, 3)
})

test('waiting updates are sent in order, and what fails waits for next time', async () => {
  const kept = store()
  kept.write(enqueue(enqueue([], 'me', card('a', [true], 1)), 'me', card('b', [true], 2)))
  const sent: string[] = []
  let online = false
  const send = async (body: ResultBody): Promise<Outcome> => { if (!online) return 'later'; sent.push(body.form!.key); return 'sent' }
  // Offline: nothing is lost, the first is marked tried, and the second isn't sent ahead of it.
  await drain(kept.read, kept.write, 'me', send)
  assert.deepEqual(kept.read().map(item => [item.body.form!.key, item.tries]), [['a', 1], ['b', 0]])
  // Mila closed and opened again: the file still has them; back online, both go, in order.
  online = true
  const reopened = store(kept.read())
  assert.deepEqual(await drain(reopened.read, reopened.write, 'me', send), [])
  assert.deepEqual(sent, ['a', 'b'])
})

test('an update that can never be kept is let go; a deleted word counts as sent', async () => {
  const kept = store(enqueue(enqueue([], 'me', card('bad', [true], 1)), 'me', card('ok', [true], 2)))
  const outcomes: Record<string, Outcome> = { bad: 'refused', ok: 'sent' }
  assert.deepEqual(await drain(kept.read, kept.write, 'me', async body => outcomes[body.form!.key]), [])
})

test('a card answered again while its update was on its way keeps the newer one for next time', async () => {
  const kept = store(enqueue([], 'me', card('a', [true], 1)))
  await drain(kept.read, kept.write, 'me', async () => {
    kept.write(enqueue(kept.read(), 'me', card('a', [true, false], 5)))
    return 'sent'
  })
  assert.deepEqual(kept.read().map(item => item.last), [5])
})

test('words fetched before their updates arrived show the answers given since', () => {
  const entry: VocabEntry = { id: 'w', lemma: 'x', gloss: 'x', forms: [{ key: 'a', stage: 'present', slot: 'm.sg', he: '', en: '', sentence: '', mark: '', translation: '', results: [true], last: 1 }], results: [false], last: 1 } as VocabEntry
  const queue = [card('a', [true, true], 4), { id: 'w', results: [false, true], last: 3 }, { id: 'w', checkpoint: { stage: 'present', results: [true], last: 6 } }]
    .reduce((list, body) => enqueue(list, 'me', body as ResultBody), [] as Pending[])
  const [shown] = withPending([entry], queue, 'me')
  assert.deepEqual(shown.forms![0].results, [true, true])
  assert.deepEqual(shown.results, [false, true])
  assert.deepEqual(shown.checkpoints!.present.results, [true])
  // Something newer from the server stays as it is.
  const newer = { ...entry, forms: [{ ...entry.forms![0], results: [false], last: 9 }] }
  assert.deepEqual(withPending([newer], queue, 'me')[0].forms![0].results, [false])
  assert.equal(withPending([entry], queue, 'other')[0], entry)
})

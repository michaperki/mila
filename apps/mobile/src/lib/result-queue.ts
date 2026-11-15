import type { VocabEntry } from './types'

// Study's answers on their way to the server (lib/results.ts keeps them in a file and sends
// them). Each answer's update says a card's whole record as it now is (its last few results,
// which were primed, which sentence each was on, when it was last answered), never "add one",
// so sending it twice changes nothing, and the server keeps a record only if it is no older
// than the one it has (vocab.ts), so an old one arriving late can't undo a newer. Only the
// newest update per card waits: answering a card again, or changing the answer, replaces it.
// Until the server has it, the update is laid over the words as fetched (withPending), so a
// refresh never shows a card as it was before the answer.
export type ResultBody = { id: string; results?: boolean[]; primed?: boolean[]; last?: number
  form?: { key: string; last: number } & Record<string, unknown>; checkpoint?: { stage: string; last: number } & Record<string, unknown> }
export type Pending = { owner: string; target: string; body: ResultBody; last: number; tries: number }
// Sent: kept by the server (or the word is gone, so there's nothing to keep it on). Refused: it
// can never be kept (an invalid update), so it is let go. Later: offline, signed out or the
// server failing, tried again next time.
export type Outcome = 'sent' | 'refused' | 'later'

export const targetOf = (body: ResultBody) =>
  (body.form ? `${body.id}|form|${body.form.key}` : body.checkpoint ? `${body.id}|checkpoint|${body.checkpoint.stage}` : `${body.id}|word`)
const lastOf = (body: ResultBody) => body.form?.last ?? body.checkpoint?.last ?? body.last ?? 0

// The queue with this update in it, in place of an older one for the same card.
export function enqueue(queue: Pending[], owner: string, body: ResultBody): Pending[] {
  const target = targetOf(body), last = lastOf(body)
  const older = queue.find(item => item.owner === owner && item.target === target)
  if (older && older.last > last) return queue
  return [...queue.filter(item => item !== older), { owner, target, body, last, tries: 0 }]
}

// Sends this account's waiting updates in the order they were made, stopping at the first that
// must wait (the rest would most likely wait too). An update replaced while its request was on its
// way stays, so the newer one is sent next. Returns the queue as it is after.
// The same update: the same card, as of the same answer (an update is never kept by identity, since
// the queue may have been read again from its file meanwhile).
const same = (a: Pending, b: Pending) => a.owner === b.owner && a.target === b.target && a.last === b.last
export async function drain(read: () => Pending[], write: (queue: Pending[]) => void, owner: string, send: (body: ResultBody) => Promise<Outcome>) {
  for (const item of read().filter(entry => entry.owner === owner)) {
    const outcome = await send(item.body)
    const now = read()
    if (outcome === 'later') { write(now.map(entry => (same(entry, item) ? { ...entry, tries: entry.tries + 1 } : entry))); return read() }
    write(now.filter(entry => !same(entry, item)))
  }
  return read()
}

// The words as fetched with this account's waiting updates laid over them.
export function withPending(entries: VocabEntry[], queue: Pending[], owner: string): VocabEntry[] {
  const mine = queue.filter(item => item.owner === owner)
  if (!mine.length) return entries
  return entries.map(entry => mine.filter(item => item.body.id === entry.id).reduce((current, { body }) => {
    if (body.form) {
      const { key, ...record } = body.form
      return { ...current, forms: (current.forms || []).map(form => (form.key === key && (form.last ?? 0) <= record.last ? { ...form, ...record } : form)) }
    }
    if (body.checkpoint) {
      const { stage, ...record } = body.checkpoint
      const kept = current.checkpoints?.[stage]
      return kept && kept.last > record.last ? current : { ...current, checkpoints: { ...current.checkpoints, [stage]: record as never } }
    }
    const { results, primed, last } = body
    return (current.last ?? 0) > (last ?? 0) ? current : { ...current, results, primed, last }
  }, entry as VocabEntry))
}

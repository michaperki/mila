import type { Handler } from '@netlify/functions'
import { randomUUID } from 'node:crypto'
import { verifyAuth } from './lib/auth'
import { getDb } from './lib/mongo'
import { type Change, exportBatch, planImport, TASKS, type TaskEntry, updateFor } from './lib/data-tasks'
import { relevanceOf } from './lib/relevance'
import { CATEGORIES, LEVELS, REGISTERS, TAXONOMY_VERSION } from './lib/taxonomy'

const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })

// The learner's own data out and back in (DATA-1; Account → Your data on the phone).
// GET ?export=backup: everything kept for the account that deleting it would clear, as stored
//   (saved words with their cards, results and encounters, page reads, study events), to keep.
// GET ?export=<task>: the words a task works on, with what to read of each and instructions to
//   give an AI with them (lib/data-tasks.ts); nothing is sent to an AI from here.
// POST { task, rows }: what importing the rows would change (a preview); with apply: true, it
//   is done, with what each field was before kept as an import that can be undone.
// POST { undo: id }: puts back what that import changed, where nothing has changed it since.
// GET ?imports=1: the last imports.
export const handler: Handler = async (event) => {
  const requestId = randomUUID()
  try {
    const { userId } = verifyAuth(event)
    const db = await getDb()
    const vocab = db.collection('vocab')
    const imports = db.collection('imports')
    const words = () => vocab.find({ userId }).project<TaskEntry>({
      _id: 0, id: 1, lemma: 1, lemmaPlain: 1, lemmaKey: 1, gloss: 1, partOfSpeech: 1, archived: 1, categories: 1, register: 1, level: 1, taxonomy: 1, 'encounters.context': 1,
    }).toArray()

    if (event.httpMethod === 'GET') {
      const query = event.queryStringParameters || {}
      if (query.imports) {
        const recent = await imports.find({ userId }).sort({ at: -1 }).limit(5).project({ _id: 0, userId: 0 }).toArray()
        return reply(200, { imports: recent.map(item => ({ id: item.id, task: item.task, at: item.at, changes: (item.changes as Change[]).length, undone: !!item.undone })) })
      }
      if (query.export === 'backup') {
        const [saved, texts, events] = await Promise.all(['vocab', 'texts', 'studyEvents'].map(name => db.collection(name).find({ userId }).project({ _id: 0, userId: 0 }).toArray()))
        return reply(200, { format: 'mila-backup', version: 1, exportedAt: new Date().toISOString(), vocab: saved, texts, studyEvents: events })
      }
      const task = TASKS[query.export || '']
      if (!task) return reply(400, { message: 'Choose what to export.' })
      // Rank (for frequency level), worked out as the app's fetch does.
      const entries = relevanceOf((await words()) as never, []) as TaskEntry[]
      // `waiting`: all the words the task works on, of which `rows` is one file's worth.
      const { rows, waiting } = exportBatch(task, entries)
      return reply(200, {
        format: 'mila-task', task: query.export, title: task.title, instructions: task.instructions, rows, waiting,
        ...(query.export === 'classify-v1' ? { taxonomy: { version: TAXONOMY_VERSION, categories: CATEGORIES, registers: REGISTERS, levels: LEVELS } } : {}),
      })
    }

    if (event.httpMethod === 'POST') {
      let payload: { task?: unknown; rows?: unknown; apply?: unknown; undo?: unknown }
      try { payload = JSON.parse(event.body || '{}') } catch { return reply(400, { message: 'That isn\'t valid JSON.' }) }

      if (typeof payload.undo === 'string') {
        const done = await imports.findOne({ userId, id: payload.undo })
        if (!done) return reply(404, { message: 'That import isn\'t there to undo.' })
        if (done.undone) return reply(200, { restored: 0, skipped: 0 })
        let restored = 0, skipped = 0
        for (const change of done.changes as Change[]) {
          // Only where the field still holds what the import put there.
          const { set, unset } = updateFor([{ ...change, to: change.from }])
          const result = await vocab.updateOne({ userId, id: change.id, [change.field]: change.to === null ? { $exists: false } : change.to },
            { $set: { ...set, updatedAt: Date.now() }, ...(Object.keys(unset).length ? { $unset: unset } : {}) } as never)
          if (result.modifiedCount) restored++; else skipped++
        }
        await imports.updateOne({ userId, id: payload.undo }, { $set: { undone: Date.now() } })
        return reply(200, { restored, skipped })
      }

      if (typeof payload.task !== 'string') return reply(400, { message: 'Say which task the rows are for.' })
      const plan = planImport(payload.task, payload.rows, await words())
      if ('error' in plan) return reply(400, { message: plan.error })
      if (payload.apply !== true || !plan.changes.length) return reply(200, plan)
      const id = randomUUID()
      await imports.insertOne({ userId, id, task: plan.task, at: Date.now(), changes: plan.changes })
      const byWord = new Map<string, Change[]>()
      for (const change of plan.changes) (byWord.get(change.id) ?? byWord.set(change.id, []).get(change.id)!).push(change)
      for (const [word, changes] of byWord) {
        const { set, unset } = updateFor(changes)
        await vocab.updateOne({ userId, id: word }, { $set: { ...set, updatedAt: Date.now() }, ...(Object.keys(unset).length ? { $unset: unset } : {}) } as never)
      }
      return reply(200, { ...plan, applied: id })
    }
    return reply(405, { message: 'Use GET or POST.' })
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return reply(401, { message: 'Your session has expired. Please sign in again.', requestId })
    console.error('Data request failed', { requestId, name: (error as Error).name })
    return reply(503, { message: 'That couldn\'t be done right now. Please try again.', requestId })
  }
}

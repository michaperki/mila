import type { Handler } from '@netlify/functions'
import { getDb } from './lib/mongo'
import { verifyAuth } from './lib/auth'
import { DAY_PATTERN, type DayActivity, treeState } from './lib/tree'

// The learner's bonsai (lib/tree.ts). `day` is the learner's own date, 'YYYY-MM-DD', and `due`
// the cards waiting in their saved words, which the app already counts.
// GET ?day=&due= : the tree as it stands (planting it on the first visit).
// POST { day, due, cards?, sentences?, saved? } : adds what was just done today, then the tree.
const LIMITS = { cards: 300, sentences: 500, saved: 100 }

const handler: Handler = async (event) => {
  try {
    const auth = verifyAuth(event)
    const input = event.httpMethod === 'POST' ? JSON.parse(event.body || '{}') : event.queryStringParameters || {}
    const day = String(input.day ?? '')
    if (!DAY_PATTERN.test(day) || !nearToday(day)) return { statusCode: 400, body: JSON.stringify({ message: 'Invalid day' }) }
    const due = clampCount(input.due, 100000)
    if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ message: 'Method not allowed' }) }

    const db = await getDb()
    const trees = db.collection('trees')
    const activity = db.collection('activity')

    if (event.httpMethod === 'POST') {
      const inc: Record<string, number> = {}
      for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
        const value = clampCount(input[key], LIMITS[key])
        if (value) inc[key] = value
      }
      if (Object.keys(inc).length) {
        await activity.updateOne({ userId: auth.userId, day }, { $inc: inc, $set: { updatedAt: Date.now() } }, { upsert: true })
      }
    }

    await trees.updateOne({ userId: auth.userId }, { $setOnInsert: { userId: auth.userId, planted: day, createdAt: Date.now() } }, { upsert: true })
    const tree = await trees.findOne<{ planted: string }>({ userId: auth.userId }, { projection: { planted: 1 } })
    const days = await activity.find<DayActivity>({ userId: auth.userId }, { projection: { _id: 0, day: 1, cards: 1, sentences: 1, saved: 1 } }).toArray()
    const planted = tree?.planted && DAY_PATTERN.test(tree.planted) ? tree.planted : day
    return { statusCode: 200, body: JSON.stringify({ tree: treeState({ days, planted, today: day, due, userId: auth.userId }) }) }
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500
    return { statusCode, body: JSON.stringify({ message: (error as Error).message || 'Unexpected error' }) }
  }
}

export { handler }

// A whole number from 0 to `max`; anything else counts as 0.
function clampCount(value: unknown, max: number) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.min(max, Math.floor(number)) : 0
}

// The learner's date can differ from the server's by a time zone, never by more.
function nearToday(day: string) {
  const at = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))
  return Math.abs(at - Date.now()) < 2.5 * 86400000
}

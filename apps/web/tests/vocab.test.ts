import { beforeEach, describe, expect, it, vi } from 'vitest'
const updateOne = vi.fn()
vi.mock('../netlify/functions/lib/mongo', () => ({ getDb: async () => ({ collection: () => ({ updateOne }) }) }))
vi.mock('../netlify/functions/lib/auth', () => ({ verifyAuth: () => ({ userId: 'user' }) }))
import { handler } from '../netlify/functions/vocab'

const patch = async (body: unknown) => (await handler({ httpMethod: 'PATCH', body: JSON.stringify(body) } as any, {} as any, () => {}) as any)
beforeEach(() => { vi.clearAllMocks(); updateOne.mockResolvedValue({ matchedCount: 1 }) })

describe('vocab review updates', () => {
  it('sets only the review fields on the user\'s own entry', async () => {
    const response = await patch({ id: 'native-x', review: { due: 10, interval: 3, reps: 2, lapses: 0, last: 5, extra: 'dropped' }, gloss: 'ignored' })
    expect(response.statusCode).toBe(204)
    const [filter, update] = updateOne.mock.calls[0]
    expect(filter).toEqual({ userId: 'user', id: 'native-x' })
    expect(update.$set.review).toEqual({ due: 10, interval: 3, reps: 2, lapses: 0, last: 5 })
    expect(Object.keys(update.$set)).toEqual(['review', 'updatedAt'])
    expect(updateOne.mock.calls[0][2]).toBeUndefined() // never upserts
  })
  it('rejects malformed reviews and reports deleted words', async () => {
    expect((await patch({ id: 'native-x', review: { due: 'soon' } })).statusCode).toBe(400)
    updateOne.mockResolvedValueOnce({ matchedCount: 0 })
    expect((await patch({ id: 'gone', review: { due: 1, interval: 1, reps: 1, lapses: 0 } })).statusCode).toBe(404)
  })
})

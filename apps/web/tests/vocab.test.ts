import { beforeEach, describe, expect, it, vi } from 'vitest'
const updateOne = vi.fn()
const deleteMany = vi.fn()
vi.mock('../netlify/functions/lib/mongo', () => ({ getDb: async () => ({ collection: () => ({ updateOne, deleteMany }) }) }))
vi.mock('../netlify/functions/lib/auth', () => ({ verifyAuth: () => ({ userId: 'user' }) }))
import { handler } from '../netlify/functions/vocab'

const patch = async (body: unknown) => (await handler({ httpMethod: 'PATCH', body: JSON.stringify(body) } as any, {} as any, () => {}) as any)
beforeEach(() => { vi.clearAllMocks(); updateOne.mockResolvedValue({ matchedCount: 1 }) })

describe('word card results', () => {
  it('sets only the results on the user\'s own entry', async () => {
    const response = await patch({ id: 'native-x', results: [false, true], last: 5, gloss: 'ignored' })
    expect(response.statusCode).toBe(204)
    const [filter, update] = updateOne.mock.calls[0]
    expect(filter).toEqual({ userId: 'user', id: 'native-x' })
    expect(update.$set).toEqual({ results: [false, true], last: 5, updatedAt: expect.any(Number) })
    expect(updateOne.mock.calls[0][2]).toBeUndefined() // never upserts
  })
  it('rejects malformed results and reports deleted words', async () => {
    expect((await patch({ id: 'native-x', results: ['yes'], last: 1 })).statusCode).toBe(400)
    expect((await patch({ id: 'native-x', review: { due: 1, interval: 1, reps: 1, lapses: 0 } })).statusCode).toBe(400)
    updateOne.mockResolvedValueOnce({ matchedCount: 0 })
    expect((await patch({ id: 'gone', results: [true], last: 1 })).statusCode).toBe(404)
  })
})

describe('clearing vocab', () => {
  const remove = async (query: Record<string, string> | undefined) => (await handler({ httpMethod: 'DELETE', queryStringParameters: query } as any, {} as any, () => {}) as any)
  it('deletes all of the user\'s words only when asked explicitly', async () => {
    deleteMany.mockResolvedValue({ deletedCount: 3 })
    const response = await remove({ all: '1' })
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ deleted: 3 })
    expect(deleteMany).toHaveBeenCalledWith({ userId: 'user' })
    expect((await remove(undefined)).statusCode).toBe(400)
    expect(deleteMany).toHaveBeenCalledTimes(1)
  })
})

describe('saving a word', () => {
  const post = async (body: unknown) => (await handler({ httpMethod: 'POST', body: JSON.stringify(body) } as any, {} as any, () => {}) as any)
  it('adds an encounter to the entry instead of replacing it', async () => {
    const encounter = { surface: 'הדביק', meaning: 'planted (a kiss)', context: 'מר דרסלי הדביק נשיקה', at: 1 }
    expect((await post({ id: 'native-x', lemma: 'לְהַדְבִּיק', gloss: 'to stick', createdAt: 5, encounter })).statusCode).toBe(200)
    const [pull, upsert] = updateOne.mock.calls
    expect(pull[1]).toEqual({ $pull: { encounters: { context: encounter.context } } })
    const update = upsert[1]
    expect(update.$push).toEqual({ encounters: { $each: [encounter], $slice: -20 } })
    expect(update.$set.encounter).toBeUndefined()
    expect(update.$set.createdAt).toBeUndefined()
    expect(update.$setOnInsert).toEqual({ createdAt: 5 })
    expect(upsert[2]).toEqual({ upsert: true })
  })
  it('rejects a malformed encounter', async () => {
    expect((await post({ id: 'native-x', lemma: 'x', gloss: 'y', encounter: { surface: 'x' } })).statusCode).toBe(400)
    expect(updateOne).not.toHaveBeenCalled()
  })
})

describe('form results', () => {
  it('updates one form card in place, a checkpoint, and the stages marked known or opened', async () => {
    expect((await patch({ id: 'native-x', form: { key: 'past:3pl', results: [true, true], last: 9 } })).statusCode).toBe(204)
    const [filter, update, options] = updateOne.mock.calls[0]
    expect(filter).toEqual({ userId: 'user', id: 'native-x', 'forms.key': 'past:3pl' })
    expect(update.$set['forms.$[card].results']).toEqual([true, true])
    expect(update.$set['forms.$[card].last']).toBe(9)
    expect(options).toEqual({ arrayFilters: [{ 'card.key': 'past:3pl' }] })
    expect((await patch({ id: 'native-x', checkpoint: { stage: 'present', results: [true], last: 3 } })).statusCode).toBe(204)
    expect(updateOne.mock.calls[1][1].$set['checkpoints.present']).toEqual({ results: [true], last: 3 })
    expect((await patch({ id: 'native-x', known: ['present'] })).statusCode).toBe(204)
    expect(updateOne.mock.calls[2][1].$set.known).toEqual(['present'])
    expect((await patch({ id: 'native-x', opened: ['past'] })).statusCode).toBe(204)
    expect(updateOne.mock.calls[3][1].$set.opened).toEqual(['past'])
    expect((await patch({ id: 'native-x', form: { key: 'past:3pl', results: 'x', last: 1 } })).statusCode).toBe(400)
    expect((await patch({ id: 'native-x', checkpoint: { stage: '$where', results: [true], last: 1 } })).statusCode).toBe(400)
  })
})

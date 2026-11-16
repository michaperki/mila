import { beforeEach, describe, expect, it, vi } from 'vitest'
const updateOne = vi.fn()
const deleteMany = vi.fn()
const findOne = vi.fn()
const countDocuments = vi.fn()
vi.mock('../netlify/functions/lib/mongo', () => ({ getDb: async () => ({ collection: () => ({ updateOne, deleteMany, findOne, countDocuments }) }) }))
vi.mock('../netlify/functions/lib/auth', () => ({ verifyAuth: () => ({ userId: 'user' }) }))
import { handler } from '../netlify/functions/vocab'

const patch = async (body: unknown) => (await handler({ httpMethod: 'PATCH', body: JSON.stringify(body) } as any, {} as any, () => {}) as any)
beforeEach(() => { vi.clearAllMocks(); updateOne.mockResolvedValue({ matchedCount: 1 }); findOne.mockResolvedValue(null); countDocuments.mockResolvedValue(0) })
const noOlder = (field: string, last: number) => ({ $or: [{ [field]: { $exists: false } }, { [field]: { $lte: last } }] })

describe('word card results', () => {
  it('sets only the results on the user\'s own entry', async () => {
    const response = await patch({ id: 'native-x', results: [false, true], last: 5, gloss: 'ignored' })
    expect(response.statusCode).toBe(204)
    const [filter, update] = updateOne.mock.calls[0]
    expect(filter).toEqual({ userId: 'user', id: 'native-x', ...noOlder('last', 5) })
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

describe('primed answers', () => {
  it('keeps which results were primed, by position, and clears them when an older app sends none', async () => {
    await patch({ id: 'native-x', form: { key: 'meanings:sense1', results: [false, true], primed: [false, true], last: 5 } })
    expect(updateOne.mock.calls[0][1].$set).toMatchObject({ 'forms.$[card].results': [false, true], 'forms.$[card].primed': [false, true] })
    expect(updateOne.mock.calls[0][1].$unset).toBeUndefined()
    await patch({ id: 'native-x', form: { key: 'meanings:sense1', results: [true], last: 6 } })
    expect(updateOne.mock.calls[1][1].$unset).toEqual({ 'forms.$[card].primed': '' })
    await patch({ id: 'native-x', results: [true], primed: [true], last: 7 })
    expect(updateOne.mock.calls[2][1].$set).toMatchObject({ results: [true], primed: [true] })
    await patch({ id: 'native-x', checkpoint: { stage: 'present', results: [true], primed: [false], last: 8 } })
    expect(updateOne.mock.calls[3][1].$set['checkpoints.present']).toEqual({ results: [true], primed: [false], last: 8 })
  })
  it('rejects primed marks that don\'t match the results', async () => {
    expect((await patch({ id: 'native-x', results: [true, false], primed: [true], last: 1 })).statusCode).toBe(400)
    expect((await patch({ id: 'native-x', form: { key: 'k', results: [true], primed: ['no'], last: 1 } })).statusCode).toBe(400)
  })
})

describe('results sent again', () => {
  it('keeps a result only over one no newer, so a repeat changes nothing and a late older one is ignored', async () => {
    await patch({ id: 'native-x', checkpoint: { stage: 'present', results: [true], last: 3 } })
    expect(updateOne.mock.calls[0][0]).toEqual({ userId: 'user', id: 'native-x', ...noOlder('checkpoints.present.last', 3) })
    // The stored record is newer: nothing changes, and it isn't reported as a missing word.
    updateOne.mockResolvedValueOnce({ matchedCount: 0 }); countDocuments.mockResolvedValueOnce(1)
    expect((await patch({ id: 'native-x', results: [true], last: 1 })).statusCode).toBe(204)
    // The word is gone: 404, so the phone stops sending it.
    updateOne.mockResolvedValueOnce({ matchedCount: 0 }); countDocuments.mockResolvedValueOnce(0)
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
  it('keeps the explanation\'s themes only where the word has none, and only the taxonomy\'s own', async () => {
    const encounter = { surface: 'ינשוף', context: 'ינשוף עף', at: 1 }
    await post({ id: 'native-owl', lemma: 'יַנְשׁוּף', gloss: 'owl', encounter, categories: ['nature', 'nowhere', 'nature'], register: 'posh', taxonomy: 'v0', level: 'rare' })
    const [, upsert, organise] = updateOne.mock.calls
    expect(upsert[1].$set).not.toHaveProperty('categories')
    expect(upsert[1].$set).not.toHaveProperty('level')
    expect(organise[0]).toEqual({ userId: 'user', id: 'native-owl', taxonomy: { $exists: false } })
    expect(organise[1]).toEqual({ $set: { categories: ['nature'], taxonomy: 'v1' } })
    vi.clearAllMocks()
    await post({ id: 'native-owl', lemma: 'יַנְשׁוּף', gloss: 'owl', encounter })
    expect(updateOne).toHaveBeenCalledTimes(2)
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
    expect(options).toEqual({ arrayFilters: [{ 'card.key': 'past:3pl', ...noOlder('card.last', 9) }] })
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

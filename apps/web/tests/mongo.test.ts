import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('mongodb', () => ({ MongoClient: vi.fn() }))
import { MongoClient } from 'mongodb'

const connect = vi.fn()
const close = vi.fn().mockResolvedValue(undefined)
const database = { collection: vi.fn() }
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  process.env.MONGODB_URI = 'mongodb://localhost/test'
  connect.mockResolvedValue(undefined)
  vi.mocked(MongoClient).mockImplementation(() => ({ connect, close, db: () => database }) as any)
})

describe('account storage connection', () => {
  it('reports missing configuration at request time, rather than crashing module loading', async () => {
    delete process.env.MONGODB_URI
    const { getDb } = await import('../netlify/functions/lib/mongo')
    await expect(getDb()).rejects.toMatchObject({ code: 'DATABASE_CONFIG', statusCode: 503 })
    expect(MongoClient).not.toHaveBeenCalled()
  })
  it('shares an in-flight connection between requests', async () => {
    const { getDb } = await import('../netlify/functions/lib/mongo')
    expect(await Promise.all([getDb(), getDb()])).toEqual([database, database])
    expect(connect).toHaveBeenCalledTimes(1)
  })
  it('closes failed connections and permits a later retry', async () => {
    connect.mockRejectedValueOnce(Object.assign(new Error('private connection details'), { code: 'ENOTFOUND' }))
    const { getDb } = await import('../netlify/functions/lib/mongo')
    await expect(getDb()).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' })
    expect(close).toHaveBeenCalledTimes(1)
    expect(await getDb()).toBe(database)
    expect(connect).toHaveBeenCalledTimes(2)
  })
})

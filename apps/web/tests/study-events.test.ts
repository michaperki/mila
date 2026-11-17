import { beforeEach, describe, expect, it, vi } from 'vitest'
const insertMany = vi.fn()
const createIndex = vi.fn()
vi.mock('../netlify/functions/lib/mongo', () => ({ getDb: async () => ({ collection: () => ({ insertMany, createIndex }) }) }))
vi.mock('../netlify/functions/lib/auth', () => ({ verifyAuth: () => ({ userId: 'user' }) }))
import { handler } from '../netlify/functions/study-events'

const post = async (body: unknown) => (await handler({ httpMethod: 'POST', body: JSON.stringify(body) } as any, {} as any, () => {}) as any)
const event = (seq: number, extra: Record<string, unknown> = {}) => ({ id: `s:${seq}`, session: 's', seq, at: 1000 + seq, type: 'show', key: 'w:word', ...extra })
beforeEach(() => { vi.clearAllMocks(); insertMany.mockResolvedValue({}); createIndex.mockResolvedValue('ok') })

describe('study events', () => {
  it('keeps each event as sent, for the signed-in account', async () => {
    const response = await post({ events: [event(0), event(1, { type: 'answer', knew: true, primed: false })] })
    expect(response.statusCode).toBe(200)
    const [docs, options] = insertMany.mock.calls[0]
    expect(docs).toEqual([expect.objectContaining({ id: 's:0', userId: 'user', key: 'w:word' }), expect.objectContaining({ id: 's:1', knew: true, primed: false, userId: 'user' })])
    expect(options).toEqual({ ordered: false })
  })
  it('keeps reading and lookup events too', async () => {
    const reading = ['read', 'select', 'lookup', 'explained', 'save', 'unsave'].map((type, seq) => event(seq, { type }))
    expect((await post({ events: reading })).statusCode).toBe(200)
    expect(insertMany.mock.calls[0][0]).toHaveLength(6)
  })
  it('keeps a batch sent again once: duplicates are not a failure', async () => {
    insertMany.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000, writeErrors: [{ code: 11000 }] }))
    expect((await post({ events: [event(0)] })).statusCode).toBe(200)
    insertMany.mockRejectedValueOnce(Object.assign(new Error('down'), { code: 'ECONN' }))
    expect((await post({ events: [event(0)] })).statusCode).toBe(503)
  })
  it('keeps the rest of a batch when an event can\'t be kept, setting that one apart with why', async () => {
    const response = await post({ events: [event(0), { ...event(1), type: 'other' }, { ...event(2), seq: -1 }, event(3, { note: 'x'.repeat(20_000) }), event(4, { note: 'x'.repeat(5000) })] })
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ kept: 2, refused: 3 })
    const [apart] = insertMany.mock.calls[0]
    expect(apart.map((item: { problem: string }) => item.problem)).toEqual(['type other', 'seq', expect.stringMatching(/^size /)])
    expect(insertMany.mock.calls[1][0].map((item: { id: string }) => item.id)).toEqual(['s:0', 's:4'])
  })
  it('refuses what isn\'t a batch of events', async () => {
    expect((await post({ events: Array.from({ length: 201 }, (_, i) => event(i)) })).statusCode).toBe(400)
    expect((await post({ nothing: true })).statusCode).toBe(400)
    expect(insertMany).not.toHaveBeenCalled()
  })
})

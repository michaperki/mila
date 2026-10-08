import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../netlify/functions/lib/auth', () => ({ verifyAuth: vi.fn() }))
vi.mock('../netlify/functions/lib/mongo', () => ({ getDb: vi.fn() }))
import { verifyAuth } from '../netlify/functions/lib/auth'
import { getDb } from '../netlify/functions/lib/mongo'
import { handler } from '../netlify/functions/feedback'
const insertOne = vi.fn()
const invoke = async (body: unknown) => {
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify(body) } as any, {} as any, () => {}) as any
  return { status: response.statusCode, ...JSON.parse(response.body) }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuth).mockReturnValue({ userId: 'user' })
  vi.mocked(getDb).mockResolvedValue({ collection: () => ({ insertOne }) } as any)
})
describe('feedback endpoint', () => {
  it('stores the note with what the app saw, scoped to the user', async () => {
    const result = await invoke({ note: 'Menu prices became words', screen: 'reader', context: { raw: 'שקשוקה 48' }, app: { updateId: 'u1' } })
    expect(result.status).toBe(200)
    expect(insertOne.mock.calls[0][0]).toMatchObject({ userId: 'user', note: 'Menu prices became words', screen: 'reader', context: { raw: 'שקשוקה 48' } })
  })
  it('requires sign-in and a note', async () => {
    expect((await invoke({ note: '  ' })).status).toBe(400)
    vi.mocked(verifyAuth).mockImplementationOnce(() => { throw Object.assign(new Error('no'), { statusCode: 401 }) })
    expect((await invoke({ note: 'x' })).status).toBe(401)
    expect(insertOne).toHaveBeenCalledTimes(0)
  })
})

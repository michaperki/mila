import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../netlify/functions/lib/mongo', () => ({ getDb: vi.fn() }))
vi.mock('bcryptjs', () => ({ hash: vi.fn().mockResolvedValue('hash'), compare: vi.fn().mockResolvedValue(true) }))
import { getDb } from '../netlify/functions/lib/mongo'
import { handler } from '../netlify/functions/auth'
import { ServiceError } from '../netlify/functions/lib/serviceError'

const users = { findOne: vi.fn(), insertOne: vi.fn() }
const request = async (body: unknown) => {
  const result = await handler({ httpMethod: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) } as any, {} as any, () => {}) as any
  return { status: result.statusCode, ...JSON.parse(result.body) }
}
const credentials = { mode: 'login', email: 'person@example.com', password: 'password' }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.JWT_SECRET = 'test-secret-not-for-production'
  vi.mocked(getDb).mockResolvedValue({ collection: () => users } as any)
  users.findOne.mockResolvedValue(null)
  users.insertOne.mockResolvedValue({})
})

describe('account endpoint', () => {
  it('validates requests before accessing storage', async () => {
    expect((await request('{broken')).status).toBe(400)
    expect((await request({ ...credentials, mode: 'unknown' })).status).toBe(400)
    expect((await request({ ...credentials, mode: 'signup', password: 'a' })).status).toBe(400)
    expect(getDb).not.toHaveBeenCalled()
  })
  it('reports missing configuration without creating an account', async () => {
    delete process.env.JWT_SECRET
    const response = await request({ ...credentials, mode: 'signup' })
    expect(response.status).toBe(503)
    expect(response.code).toBe('AUTH_CONFIG')
    expect(response.requestId).toBeTruthy()
    expect(getDb).not.toHaveBeenCalled()
    expect(users.insertOne).not.toHaveBeenCalled()
  })
  it('distinguishes unavailable storage from incorrect credentials', async () => {
    vi.mocked(getDb).mockRejectedValueOnce(new ServiceError('DATABASE_UNAVAILABLE', 'Account storage unavailable.'))
    const response = await request(credentials)
    expect(response.status).toBe(503)
    expect(response.code).toBe('DATABASE_UNAVAILABLE')
    expect((await request(credentials)).status).toBe(401)
  })
  it('does not expose unexpected database error details', async () => {
    users.findOne.mockRejectedValueOnce(new Error('private connection string'))
    const response = await request(credentials)
    expect(response.status).toBe(500)
    expect(JSON.stringify(response)).not.toContain('private connection string')
    expect(response.requestId).toBeTruthy()
  })
  it('creates accounts and signs in existing users', async () => {
    const created = await request({ ...credentials, mode: 'signup' })
    expect(created.status).toBe(201)
    expect(created.token).toBeTruthy()
    users.findOne.mockResolvedValue({ userId: created.user.id, email: credentials.email, passwordHash: 'hash', tier: 'free' })
    expect((await request(credentials)).status).toBe(200)
    expect((await request({ ...credentials, mode: 'signup' })).status).toBe(409)
  })
})

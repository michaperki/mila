import { randomBytes, randomUUID } from 'node:crypto'
import { ServiceError } from './lib/serviceError'
import type { Handler, HandlerEvent } from '@netlify/functions'
import { hash, compare } from 'bcryptjs'
import { getDb } from './lib/mongo'
import { getJwtSecret, signToken, verifyAuth } from './lib/auth'
import { isAdmin } from './lib/ai-usage'

const SALT_ROUNDS = 10
const MIN_PASSWORD = 8

const handler: Handler = async (event) => {
  const requestId = randomUUID()
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ message: 'Method Not Allowed' }),
      }
    }

    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing body' }),
      }
    }

    let payload
    try { payload = JSON.parse(event.body) } catch {
      return { statusCode: 400, body: JSON.stringify({ message: 'Invalid request. Please submit the form again.' }) }
    }
    const { email, password, mode } = payload || {}
    if (mode === 'refresh' || mode === 'change' || mode === 'reset') return await signedInAction(event, mode, payload)
    if (mode !== 'login' && mode !== 'signup') {
      return { statusCode: 400, body: JSON.stringify({ message: 'Choose sign in or create account.' }) }
    }

    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Email and password are required' }),
      }
    }

    const normalizedEmail = String(email).trim().toLowerCase()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Enter a valid email address.' }) }
    }
    if (mode === 'signup' && password.length < MIN_PASSWORD) {
      return { statusCode: 400, body: JSON.stringify({ message: `Use at least ${MIN_PASSWORD} characters for your password.` }) }
    }

    getJwtSecret()
    const db = await getDb()
    const users = db.collection('users')

    if (mode === 'login') {
      const user = await users.findOne({ email: normalizedEmail })
      if (!user) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: 'Email or password is incorrect. Please check both and try again.' }),
        }
      }

      const passwordMatch = await compare(password, user.passwordHash)
      if (!passwordMatch) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: 'Email or password is incorrect. Please check both and try again.' }),
        }
      }

      const token = signToken({ userId: user.userId, email: user.email, tier: user.tier })
      return {
        statusCode: 200,
        body: JSON.stringify({ token, user: { id: user.userId, email: user.email, tier: user.tier, createdAt: user.createdAt } }),
      }
    }

    const existing = await users.findOne({ email: normalizedEmail })
    if (existing) {
      return {
        statusCode: 409,
        body: JSON.stringify({ message: 'Account already exists. Try signing in.' }),
      }
    }

    const passwordHash = await hash(password, SALT_ROUNDS)
    const userId = (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
    const createdAt = new Date().toISOString()

    const token = signToken({ userId, email: normalizedEmail, tier: 'free' })

    await users.insertOne({
      userId,
      email: normalizedEmail,
      passwordHash,
      tier: 'free',
      createdAt,
      provider: 'local',
    })

    return {
      statusCode: 201,
      body: JSON.stringify({ token, user: { id: userId, email: normalizedEmail, tier: 'free', createdAt } }),
    }
  } catch (error) {
    const failure = error as { name?: string; code?: string | number }
    const code = error instanceof ServiceError ? error.code : 'AUTH_INTERNAL'
    console.error('Authentication request failed', { requestId, code, name: failure.name, providerCode: failure.code })
    return {
      statusCode: error instanceof ServiceError ? error.statusCode : 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        message: error instanceof ServiceError ? error.message : 'The account service encountered a problem. Please try again later or contact the site owner.',
        code,
        requestId,
      }),
    }
  }
}

const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })

// What a signed-in caller can ask for:
// - refresh: a new token for the saved session, on every launch, so testers who keep using the app
//   stay signed in past the token's 7 days; an account that no longer exists is signed out.
// - change: a new password, given the current one.
// - reset (developers only, ADMIN_EMAILS): a temporary password for a learner who forgot theirs,
//   to send them by hand; they can change it in Account. There is no reset email yet.
async function signedInAction(event: HandlerEvent, mode: 'refresh' | 'change' | 'reset', payload: Record<string, unknown>) {
  let auth
  try { auth = verifyAuth(event) } catch { return reply(401, { message: 'Your session has expired. Please sign in again.' }) }
  const users = (await getDb()).collection('users')
  const user = await users.findOne({ userId: auth.userId })
  if (!user) return reply(401, { message: 'This account no longer exists. Please sign in again.' })

  if (mode === 'refresh') {
    const token = signToken({ userId: user.userId, email: user.email, tier: user.tier })
    return reply(200, { token, user: { id: user.userId, email: user.email, tier: user.tier, createdAt: user.createdAt } })
  }
  if (mode === 'change') {
    const { password, newPassword } = payload
    if (typeof password !== 'string' || !(await compare(password, user.passwordHash))) return reply(400, { message: 'Your current password is not right.' })
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD) return reply(400, { message: `Use at least ${MIN_PASSWORD} characters for your new password.` })
    await users.updateOne({ userId: user.userId }, { $set: { passwordHash: await hash(newPassword, SALT_ROUNDS) } })
    return reply(200, { changed: true })
  }
  if (!isAdmin(auth.email)) return reply(403, { message: 'Not available.' })
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  const temporary = randomBytes(9).toString('base64url')
  const { matchedCount } = await users.updateOne({ email }, { $set: { passwordHash: await hash(temporary, SALT_ROUNDS) } })
  if (!matchedCount) return reply(404, { message: 'No account uses that email.' })
  console.info('Password reset by a developer')
  return reply(200, { password: temporary })
}

export { handler }

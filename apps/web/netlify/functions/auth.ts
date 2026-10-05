import { randomUUID } from 'node:crypto'
import { ServiceError } from './lib/serviceError'
import type { Handler } from '@netlify/functions'
import { hash, compare } from 'bcryptjs'
import { getDb } from './lib/mongo'
import { getJwtSecret, signToken } from './lib/auth'

const SALT_ROUNDS = 10

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
    if (mode === 'signup' && password.length < 4) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Password must be at least 4 characters.' }) }
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

export { handler }

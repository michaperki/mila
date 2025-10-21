import type { Handler } from '@netlify/functions'
import { hash, compare } from 'bcryptjs'
import { getDb } from './lib/mongo'
import { signToken } from './lib/auth'

const SALT_ROUNDS = 10

const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ message: 'Method Not Allowed' }),
      }
    }

    const db = await getDb()
    const users = db.collection('users')

    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing body' }),
      }
    }

    const { email, password, mode } = JSON.parse(event.body)

    if (!email || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Email and password are required' }),
      }
    }

    const normalizedEmail = String(email).trim().toLowerCase()

    if (mode === 'login') {
      const user = await users.findOne({ email: normalizedEmail })
      if (!user) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: 'Invalid credentials' }),
        }
      }

      const passwordMatch = await compare(password, user.passwordHash)
      if (!passwordMatch) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: 'Invalid credentials' }),
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

    await users.insertOne({
      userId,
      email: normalizedEmail,
      passwordHash,
      tier: 'free',
      createdAt,
      provider: 'local',
    })

    const token = signToken({ userId, email: normalizedEmail, tier: 'free' })

    return {
      statusCode: 201,
      body: JSON.stringify({ token, user: { id: userId, email: normalizedEmail, tier: 'free', createdAt } }),
    }
  } catch (error) {
    console.error('Auth function error', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Authentication failed. Please try again.' }),
    }
  }
}

export { handler }

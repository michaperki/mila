import type { HandlerEvent } from '@netlify/functions'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined')
}

export type AuthContext = {
  userId: string
  email?: string
  tier?: 'free' | 'premium'
}

export const verifyAuth = (event: HandlerEvent): AuthContext => {
  const header = event.headers.authorization || event.headers.Authorization
  if (!header) {
    throw Object.assign(new Error('Missing authorization header'), { statusCode: 401 })
  }

  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    throw Object.assign(new Error('Invalid authorization header'), { statusCode: 401 })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthContext
    if (!payload.userId) {
      throw new Error('Invalid token payload')
    }
    return payload
  } catch (error) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401, cause: error })
  }
}

export const signToken = (context: AuthContext) => {
  return jwt.sign(context, JWT_SECRET, { expiresIn: '7d' })
}

export const getTokenFromCookie = (event: HandlerEvent, cookieName = 'mila_token') => {
  const cookieHeader = event.headers.cookie || event.headers.Cookie
  if (!cookieHeader) return null

  const cookies = cookieHeader.split(';').map((part) => part.trim())
  const tokenPair = cookies.find((cookie) => cookie.startsWith(`${cookieName}=`))
  if (!tokenPair) return null

  return tokenPair.split('=')[1]
}

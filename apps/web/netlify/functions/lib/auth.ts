import type { HandlerEvent } from '@netlify/functions'
import jwt from 'jsonwebtoken'

import { ServiceError } from './serviceError'

export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET
  if (!secret?.trim()) throw new ServiceError('AUTH_CONFIG', 'Sign-in is unavailable because the account service is not configured. Please contact the site owner.')
  return secret
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
    const payload = jwt.verify(token, getJwtSecret()) as AuthContext
    if (!payload.userId) {
      throw new Error('Invalid token payload')
    }
    return payload
  } catch (error) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401, cause: error })
  }
}

export const signToken = (context: AuthContext) => {
  return jwt.sign(context, getJwtSecret(), { expiresIn: '7d' })
}

export const getTokenFromCookie = (event: HandlerEvent, cookieName = 'mila_token') => {
  const cookieHeader = event.headers.cookie || event.headers.Cookie
  if (!cookieHeader) return null

  const cookies = cookieHeader.split(';').map((part) => part.trim())
  const tokenPair = cookies.find((cookie) => cookie.startsWith(`${cookieName}=`))
  if (!tokenPair) return null

  return tokenPair.split('=')[1]
}

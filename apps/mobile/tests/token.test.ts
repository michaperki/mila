import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokenExpiry } from '../src/lib/token.ts'

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

test('a token says when it runs out', () => {
  assert.equal(tokenExpiry(`${encode({ alg: 'HS256' })}.${encode({ userId: 'u', exp: 1_800_000_000 })}.sig`), 1_800_000_000_000)
  assert.equal(tokenExpiry(`${encode({ alg: 'HS256' })}.${encode({ userId: 'u' })}.sig`), null)
  assert.equal(tokenExpiry('not a token'), null)
  assert.equal(tokenExpiry('a.%%%.c'), null)
})

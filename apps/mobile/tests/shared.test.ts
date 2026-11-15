import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sharing } from '../src/lib/shared.ts'

test('a request asked for again while it is on its way is shared, and asked anew once settled', async () => {
  const share = sharing<number>()
  let calls = 0
  const run = () => new Promise<number>(resolve => { calls++; setTimeout(() => resolve(calls), 5) })
  const [a, b] = await Promise.all([share('w:present', run), share('w:present', run)])
  assert.equal(calls, 1)
  assert.equal(a, b)
  await share('w:past', run)
  assert.equal(calls, 2)
  await share('w:present', run)
  assert.equal(calls, 3)
  // A failure isn't kept: the next call tries again.
  await assert.rejects(share('x', () => Promise.reject(new Error('no'))))
  assert.equal(await share('x', () => Promise.resolve(7)), 7)
})

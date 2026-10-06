import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLiveSession } from '../src/lib/live-session.ts'

test('stopping a session aborts its request and discards a late result', async () => {
  let resolve!: (value: string) => void
  let signal!: AbortSignal
  const results: string[] = []
  let stops = 0
  const session = createLiveSession({ sample: current => { signal = current; return new Promise<string>(done => { resolve = done }) }, onResult: value => results.push(value), onError: () => assert.fail(), onStop: () => stops++ })
  session.stop(); resolve('stale text')
  await new Promise(done => setTimeout(done, 0))
  assert.equal(signal.aborted, true); assert.deepEqual(results, []); assert.equal(stops, 1)
})
test('samples serially and stops at the configured budget', async () => {
  let concurrent = 0; let maxConcurrent = 0; let calls = 0
  const results: number[] = []
  await new Promise<void>((done, reject) => {
    createLiveSession({ sample: async () => { concurrent++; maxConcurrent = Math.max(concurrent, maxConcurrent); await new Promise(resolve => setTimeout(resolve, 5)); concurrent--; return ++calls }, onResult: value => results.push(value), onError: reject, onStop: done, intervalMs: 1, durationMs: 1000, maxSamples: 3 })
  })
  assert.equal(maxConcurrent, 1); assert.deepEqual(results, [1, 2, 3])
})
test('a stalled request is aborted by the session deadline', async () => {
  let signal!: AbortSignal
  await new Promise<void>(done => { createLiveSession({ sample: current => { signal = current; return new Promise(() => {}) }, onResult: () => assert.fail(), onError: () => assert.fail(), onStop: done, durationMs: 5 }) })
  assert.equal(signal.aborted, true)
})

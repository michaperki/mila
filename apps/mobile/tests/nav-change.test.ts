import { test } from 'node:test'
import assert from 'node:assert/strict'
import { screenChange, stackOf } from '../src/lib/nav-change.ts'

const s = (...names: string[]) => names.map(name => ({ key: `${name}-k`, name }))

test('push, back and replace from the stacks of screens', () => {
  assert.deepEqual(screenChange(null, s('index')), { how: 'open' })
  assert.deepEqual(screenChange(s('index'), s('index', 'camera')), { how: 'push' })
  assert.deepEqual(screenChange(s('index', 'camera', 'reader'), s('index', 'camera')), { how: 'back', popped: 1 })
  assert.deepEqual(screenChange(s('index', 'camera', 'reader'), s('index')), { how: 'back', popped: 2 })
  assert.deepEqual(screenChange(s('index', 'compose'), s('index', 'reader')), { how: 'replace' })
})

test('the same screen settling, or its params changing, is not a screen change', () => {
  assert.equal(screenChange(s('index'), s('index')), null)
  // At launch the first state's key is replaced by the real one: v1 recorded it as index → index.
  assert.equal(screenChange([{ key: 'index-stale', name: 'index' }], s('index')), null)
})

test('anything else is unknown, with how many screens went and came', () => {
  assert.deepEqual(screenChange(s('index', 'account', 'import'), s('index', 'vocabulary')), { how: 'unknown', popped: 2, pushed: 1 })
  assert.deepEqual(screenChange(s('index', 'word'), [{ key: 'other', name: 'index' }]), { how: 'unknown', popped: 2, pushed: 1 })
})

test('the stack is the deepest navigator on the focused path', () => {
  const state = { index: 0, routes: [{ key: 'root', name: '__root', state: { index: 1, routes: [{ key: 'a', name: 'index' }, { key: 'b', name: 'reader' }] } }] }
  assert.deepEqual(stackOf(state).map(screen => screen.name), ['index', 'reader'])
  assert.deepEqual(stackOf(undefined), [])
})

test('the root layout before its stack is in the state is no screen yet', () => {
  // Seen at every launch in Preview (v2): open __root, then __root → index as a replace.
  assert.deepEqual(stackOf({ index: 0, routes: [{ key: 'root', name: '__root' }] }), [])
  const launch = { index: 0, routes: [{ key: 'root', name: '__root', state: { index: 0, routes: [{ key: 'a', name: 'index' }] } }] }
  assert.deepEqual(screenChange(stackOf({ index: 0, routes: [{ key: 'root', name: '__root' }] }), stackOf(launch)), { how: 'open' })
})

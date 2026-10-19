import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLastRead } from '../src/lib/today.ts'

test('a bad saved reading position is ignored', () => {
  assert.equal(parseLastRead('{"id":"a","segment":3,"title":"t","at":1}')?.segment, 3)
  assert.equal(parseLastRead(''), null)
  assert.equal(parseLastRead('{"id":"a"}'), null)
})

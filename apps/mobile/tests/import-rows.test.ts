import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rowsIn } from '../src/lib/import-rows.ts'

test('an AI\'s answer is read wherever its JSON list is', () => {
  const rows = [{ id: 'a', categories: ['nature'] }]
  assert.deepEqual(rowsIn(JSON.stringify(rows)), rows)
  assert.deepEqual(rowsIn(`Here you go:\n\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\`\nLet me know!`), rows)
  assert.deepEqual(rowsIn(JSON.stringify({ rows })), rows)
  assert.equal(rowsIn('no json here'), null)
  assert.equal(rowsIn('[not json]'), null)
})

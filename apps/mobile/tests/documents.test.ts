import { test } from 'node:test'
import assert from 'node:assert/strict'
import { documentFromRecognition, textFromDocument } from '../src/lib/documents.ts'
test('native captures round-trip through the existing web document contract', () => {
  const recognition = { text: 'שלום עולם\nמה נשמע?', translation: 'Hello world. How are you?', capturedAt: 12345 }
  const document = documentFromRecognition(recognition, 'test-capture')
  assert.equal(document.id, 'test-capture')
  assert.deepEqual(document.chunks[0].tokens.map(token => token.surface), ['שלום', 'עולם', 'מה', 'נשמע?'])
  assert.deepEqual(textFromDocument(document), recognition)
})

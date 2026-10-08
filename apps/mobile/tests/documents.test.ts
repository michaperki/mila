import { test } from 'node:test'
import assert from 'node:assert/strict'
import { documentFromRecognition, textFromDocument } from '../src/lib/documents.ts'
test('native captures round-trip through the existing web document contract', () => {
  const recognition = { text: 'שלום עולם\nמה נשמע?', translation: 'Hello world\nHow are you?', capturedAt: 12345,
    segments: [{ he: 'שלום עולם', en: 'Hello world', heading: true }, { he: 'מה נשמע?', en: 'How are you?' }] }
  const document = documentFromRecognition(recognition, 'test-capture')
  assert.equal(document.id, 'test-capture')
  assert.deepEqual(document.chunks.map(chunk => chunk.tokens.map(token => token.surface)), [['שלום', 'עולם'], ['מה', 'נשמע?']])
  assert.deepEqual(textFromDocument(document), recognition)
})
test('list numbers are part of the saved line on both sides', () => {
  const document = documentFromRecognition({ text: '1. מה?', translation: '1. What?', capturedAt: 1, segments: [{ he: 'מה?', en: 'What?', marker: '1' }] }, 'n')
  assert.equal(document.chunks[0].text, '1. מה?'); assert.equal(document.chunks[0].translation, '1. What?')
})
test('older single-chunk documents still open as one segment', () => {
  const legacy = { id: 'old', source: 'ocr' as const, createdAt: 1, chunks: [{ id: 'old-0', type: 'sentence' as const, text: 'שלום', translation: 'Hello', tokens: [] }] }
  assert.deepEqual(textFromDocument(legacy).segments, [{ he: 'שלום', en: 'Hello' }])
})

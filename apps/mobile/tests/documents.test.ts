import { test } from 'node:test'
import assert from 'node:assert/strict'
import { documentFromRecognition, textFromDocument } from '../src/lib/documents.ts'
test('native captures round-trip through the existing web document contract', () => {
  const recognition = { text: 'שלום עולם\nמה נשמע?', translation: 'Hello world\nHow are you?', capturedAt: 12345,
    segments: [{ he: 'שלום עולם', en: 'Hello world', heading: true }, { he: 'מה נשמע?', en: 'How are you?' }] }
  const document = documentFromRecognition(recognition, 'test-capture')
  assert.equal(document.id, 'test-capture')
  assert.deepEqual(document.chunks.map(chunk => chunk.tokens.map(token => token.surface)), [['שלום', 'עולם'], ['מה', 'נשמע?']])
  // It opens under the Library's title for it (here its first line).
  assert.deepEqual(textFromDocument(document), { ...recognition, id: 'test-capture', library: 'saved', title: 'שלום עולם' })
})
test('list numbers are part of the saved line on both sides', () => {
  const document = documentFromRecognition({ text: '1. מה?', translation: '1. What?', capturedAt: 1, segments: [{ he: 'מה?', en: 'What?', marker: '1' }] }, 'n')
  assert.equal(document.chunks[0].text, '1. מה?'); assert.equal(document.chunks[0].translation, '1. What?')
})
test('older single-chunk documents still open as one segment', () => {
  const legacy = { id: 'old', source: 'ocr' as const, createdAt: 1, chunks: [{ id: 'old-0', type: 'sentence' as const, text: 'שלום', translation: 'Hello', tokens: [] }] }
  assert.deepEqual(textFromDocument(legacy).segments, [{ he: 'שלום', en: 'Hello' }])
})
test('page reads keep paragraphs and page-edge flags when saved and reopened', () => {
  const recognition = { text: 'א. ב.\nג.', translation: 'A. B.\nC.', capturedAt: 1, source: 'page' as const,
    segments: [{ he: 'א.', en: 'A.', paragraph: true, cutStart: true }, { he: 'ב.', en: 'B.' }, { he: 'ג.', en: 'C.', paragraph: true, cutEnd: true }] }
  const document = documentFromRecognition(recognition, 'p')
  assert.equal(document.layout, 'page')
  const reopened = textFromDocument(document)
  assert.equal(reopened.source, 'page')
  assert.deepEqual(reopened.segments, recognition.segments)
})

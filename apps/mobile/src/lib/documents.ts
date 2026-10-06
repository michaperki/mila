import type { Recognition, TextDoc } from './types'
export function documentFromRecognition(value: Recognition, id: string): TextDoc {
  return { id, source: 'ocr', title: value.text.replace(/\s+/g, ' ').slice(0, 60), createdAt: value.capturedAt,
    chunks: [{ id: `${id}-0`, type: 'sentence', text: value.text, translation: value.translation,
      tokens: value.text.trim().split(/\s+/).filter(Boolean).map((surface, idx) => ({ idx, surface })) }],
  }
}
export function textFromDocument(doc: TextDoc): Recognition {
  return { text: doc.chunks.map(chunk => chunk.text).join('\n'), translation: doc.chunks.map(chunk => chunk.translation || '').join('\n'), capturedAt: doc.createdAt }
}

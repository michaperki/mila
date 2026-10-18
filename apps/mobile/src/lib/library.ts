import { stripNiqqud } from './ocr-cleanup.ts'
import type { TextDoc } from './types'

// The Library's view of a saved passage.

const HEBREW = /[֐-׿]/
export const isHebrew = (text: string) => HEBREW.test(text)

// Its title: the learner's own name for it, else the page's English title, else (older passages,
// pasted text) its first line.
export const titleOf = (doc: TextDoc) => doc.name?.trim() || doc.title?.trim() || doc.chunks[0]?.text?.trim() || 'Untitled'

// One line under the title in the other language: the first English line under a Hebrew title,
// the first Hebrew line under an English one.
export function previewOf(doc: TextDoc) {
  const first = doc.chunks.find(chunk => chunk.text.trim())
  if (!first) return ''
  return isHebrew(titleOf(doc)) ? doc.chunks.find(chunk => chunk.translation?.trim())?.translation?.trim() || '' : first.text.trim()
}

// How far it has been read, 0 to 1, or null if it hasn't been opened at a sentence.
export function progressOf(doc: TextDoc): number | null {
  const furthest = doc.furthestSegment ?? doc.lastSegment
  if (furthest === undefined || !doc.chunks.length) return null
  return Math.min(1, (furthest + 1) / doc.chunks.length)
}

// Recently read (last opened, or added if never opened) or date added, newest first.
export type LibrarySort = 'recent' | 'added'
export function sortDocs(docs: TextDoc[], sort: LibrarySort) {
  const when = (doc: TextDoc) => (sort === 'recent' ? doc.openedAt ?? doc.createdAt : doc.createdAt)
  return [...docs].sort((a, b) => when(b) - when(a))
}

// Search over the title and the text in both languages; Hebrew ignores vowels.
export function matchesDoc(doc: TextDoc, query: string) {
  const wanted = stripNiqqud(query.trim()).toLowerCase()
  if (!wanted) return true
  const haystack = [doc.name, doc.title, ...doc.chunks.flatMap(chunk => [chunk.text, chunk.translation])].filter(Boolean).join('\n')
  return stripNiqqud(haystack).toLowerCase().includes(wanted)
}

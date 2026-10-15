import { test } from 'node:test'
import assert from 'node:assert/strict'
import { segmentsFromPage, tailOf, usableTail, type PageRead } from '../src/lib/page.ts'

const page = (overrides: Partial<PageRead>): PageRead => ({
  blocks: [{ kind: 'paragraph', sentences: [{ he: 'בפחד שמישהו יגלה.', en: 'in fear that someone would find out.' }, { he: 'מר דרסלי', en: 'Mr. Dursley…' }] }],
  startsMidSentence: false, endsMidSentence: false, continuesPrevious: false, omitted: [], ...overrides,
})

test('paragraphs and headings keep the page layout', () => {
  const segments = segmentsFromPage(page({ blocks: [
    { kind: 'heading', sentences: [{ he: 'פרק א', en: 'Chapter One' }] },
    { kind: 'paragraph', sentences: [{ he: 'א.', en: 'A.' }, { he: 'ב.', en: 'B.' }] },
  ] }))
  assert.deepEqual(segments.map(s => [!!s.heading, !!s.paragraph]), [[true, true], [false, true], [false, false]])
})

test('a sentence cut at the page bottom is finished by the next page', () => {
  const first = page({ endsMidSentence: true })
  const tail = tailOf(first, segmentsFromPage(first), 1000)
  assert.deepEqual(tail, { he: 'מר דרסלי', at: 1000 })
  const previous = usableTail(tail, 2000)
  const next = segmentsFromPage(page({ startsMidSentence: true, continuesPrevious: true, blocks: [{ kind: 'paragraph', sentences: [{ he: 'היה מנהל.', en: 'Mr. Dursley was a director.' }] }] }), previous)
  assert.equal(next[0].he, 'מר דרסלי היה מנהל.'); assert.equal(next[0].joined, true); assert.equal(next[0].cutStart, undefined)
})

test('an unrelated or stale fragment is not joined', () => {
  assert.equal(usableTail({ he: 'x', at: 0 }, 21 * 60 * 1000), undefined)
  const segments = segmentsFromPage(page({ startsMidSentence: true, endsMidSentence: true }), 'מר דרסלי')
  assert.equal(segments[0].he, 'בפחד שמישהו יגלה.'); assert.equal(segments[0].cutStart, true); assert.equal(segments[1].cutEnd, true)
  assert.equal(tailOf(page({}), segments), null)
})

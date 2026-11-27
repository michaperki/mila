import { describe, expect, it } from 'vitest'
import { readingOf } from '../netlify/functions/lib/readings'

describe('a word’s reading from the sentence’s quick meanings', () => {
  it('is kept with the word’s own letters, full or defective spelling alike', () => {
    expect(readingOf('ספר', 'סֵפֶר')).toBe('סֵפֶר')
    expect(readingOf('וכשהגיע', 'וּכְשֶׁהִגִּיעַ')).toBe('וּכְשֶׁהִגִּיעַ')
    expect(readingOf('מדבר', 'מְדַבֵּר')).toBe('מְדַבֵּר')
  })
  it('is dropped when it is another word, has no vowels, or is empty', () => {
    expect(readingOf('ספר', 'סִפְרוֹ')).toBe('')
    expect(readingOf('ספר', 'ספר')).toBe('')
    expect(readingOf('ספר', 'סְפָרִים')).toBe('')
    expect(readingOf('ספר', '')).toBe('')
  })
})

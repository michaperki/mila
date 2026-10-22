import { describe, expect, it, vi } from 'vitest'
import { addStarters, STARTERS, starterDoc } from '../netlify/functions/lib/starters'

describe('starter passages', () => {
  it('are a heading and sentences, each with its English', () => {
    for (const starter of STARTERS) {
      const doc = starterDoc(starter, 1)
      expect(doc.chunks[0].type).toBe('phrase')
      for (const chunk of doc.chunks) {
        expect(chunk.text).toMatch(/[֐-׿]/)
        expect(chunk.translation?.trim()).toBeTruthy()
        expect(chunk.tokens.map(token => token.surface).join(' ')).toBe(chunk.text)
      }
      expect(new Set(doc.chunks.map(chunk => chunk.id)).size).toBe(doc.chunks.length)
    }
  })

  it('are added to a library once, beginner first', async () => {
    const insertMany = vi.fn()
    const updateOne = vi.fn().mockResolvedValueOnce({ modifiedCount: 1 }).mockResolvedValue({ modifiedCount: 0 })
    const db = { collection: (name: string) => (name === 'users' ? { updateOne } : { insertMany }) } as never
    await addStarters(db, 'user')
    await addStarters(db, 'user')
    expect(insertMany).toHaveBeenCalledTimes(1)
    const docs = insertMany.mock.calls[0][0]
    expect(docs.map((doc: { textId: string }) => doc.textId)).toEqual(['starter-beginner', 'starter-intermediate', 'starter-advanced'])
    expect(docs[0].createdAt).toBeGreaterThan(docs[1].createdAt)
    expect(docs.every((doc: { userId: string }) => doc.userId === 'user')).toBe(true)
  })
})

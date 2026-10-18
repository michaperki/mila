import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creditOf, seedOf, treeState, type DayActivity } from '../netlify/functions/lib/tree'

const updateOne = vi.fn()
const findOne = vi.fn()
const toArray = vi.fn()
vi.mock('../netlify/functions/lib/mongo', () => ({ getDb: async () => ({ collection: () => ({ updateOne, findOne, find: () => ({ toArray }) }) }) }))
vi.mock('../netlify/functions/lib/auth', () => ({ verifyAuth: () => ({ userId: 'user' }) }))
import { handler } from '../netlify/functions/tree'

// 'YYYY-MM-DD', `offset` days from 2026-10-18.
const day = (offset: number) => new Date(Date.UTC(2026, 9, 18 + offset)).toISOString().slice(0, 10)
const today = day(0)
const studied = (offset: number, cards = 20): DayActivity => ({ day: day(offset), cards })
const state = (days: DayActivity[], extra: { planted?: string; due?: number } = {}) =>
  treeState({ days, planted: extra.planted ?? day(-200), today, due: extra.due ?? 0, userId: 'user' })

describe('the tree', () => {
  it('starts young and healthy on planting day', () => {
    const tree = state([], { planted: today })
    expect(tree.growth).toBe(8)
    expect(tree.overgrowth).toBe(0)
    expect(tree.vitality).toBeGreaterThan(45)
    expect(tree.planted).toBe(today)
  })
  it('caps a day at full credit, so cramming grows no more than a steady day', () => {
    expect(creditOf({ day: today, cards: 500 })).toBe(1)
    expect(state([studied(0, 500)]).growth).toBe(state([studied(0, 15)]).growth)
  })
  it('grows with tended days and never shrinks with time away', () => {
    const month = Array.from({ length: 30 }, (_, i) => studied(-40 - i))
    const later = state(month).growth
    expect(later).toBeGreaterThan(35)
    expect(state(month.map(d => ({ ...d })), { due: 0 }).growth).toBe(later)
    const year = Array.from({ length: 150 }, (_, i) => studied(-i))
    expect(state(year).growth).toBeGreaterThan(90)
  })
  it('grows wild after the grace days and is pruned by studying today', () => {
    const away = state([studied(-10)], { due: 40 })
    expect(away.overgrowth).toBeGreaterThan(50)
    expect(state([studied(-1)], { due: 0 }).overgrowth).toBe(0)
    const back = state([studied(-10), studied(0)], { due: 0 })
    expect(back.overgrowth).toBe(0)
    expect(back.tendedToday).toBe(true)
  })
  it('loses liveliness while away but never dies, and reading brings it back', () => {
    const away = state([studied(-30)])
    expect(away.vitality).toBe(20)
    const read = state([{ day: today, sentences: 12 }, { day: day(-1), sentences: 12 }, { day: day(-2), sentences: 12 }])
    expect(read.vitality).toBeGreaterThan(80)
  })
  it('gives each learner their own stable seed', () => {
    expect(seedOf('user')).toBe(seedOf('user'))
    expect(seedOf('user')).not.toBe(seedOf('someone else'))
  })
})

describe('tree function', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(Date.UTC(2026, 9, 18, 12)))
    findOne.mockResolvedValue({ planted: day(-3) }); toArray.mockResolvedValue([])
  })
  const call = async (httpMethod: string, input: Record<string, unknown>) => (await handler(
    (httpMethod === 'GET' ? { httpMethod, queryStringParameters: input } : { httpMethod, body: JSON.stringify(input) }) as any, {} as any, () => {}) as any)

  it('plants on first visit and returns the tree', async () => {
    const response = await call('GET', { day: today, due: '3' })
    expect(response.statusCode).toBe(200)
    expect(updateOne).toHaveBeenCalledWith({ userId: 'user' }, expect.objectContaining({ $setOnInsert: expect.objectContaining({ planted: today }) }), { upsert: true })
    expect(JSON.parse(response.body).tree.planted).toBe(day(-3))
  })
  it('adds today\'s activity, clamped', async () => {
    await call('POST', { day: today, cards: 4, sentences: 9999, saved: -2 })
    expect(updateOne.mock.calls[0][0]).toEqual({ userId: 'user', day: today })
    expect(updateOne.mock.calls[0][1].$inc).toEqual({ cards: 4, sentences: 500 })
  })
  it('rejects a day far from today', async () => {
    expect((await call('GET', { day: day(-5) })).statusCode).toBe(400)
    expect((await call('GET', { day: 'soon' })).statusCode).toBe(400)
  })
})

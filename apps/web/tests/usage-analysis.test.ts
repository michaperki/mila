import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain module served to the viewer as it is
import { abandoned, backtracks, features, readSheet } from '../public/usage-analysis.js'

// One session's events, in order: `at` in seconds.
let seq = 0
const e = (at: number, type: string, fields: Record<string, unknown>) => ({ id: `s:${seq}`, session: 's', seq: seq++, at: at * 1000, type, ...fields })
const nav = (at: number, from: string | null, to: string, how: string, ms?: number, extra: Record<string, unknown> = {}) => e(at, 'nav', { from, to, how, ...(ms !== undefined ? { ms } : {}), ...extra })

describe('usage analysis', () => {
  it('reads the Read sheet: what was offered, chosen or dismissed, and what led to reading', () => {
    seq = 0
    const sheet1 = e(1, 'offer', { surface: 'read', options: ['photo', 'paste', 'continue', 'dismiss'] })
    const sheet2 = e(10, 'offer', { surface: 'read', options: ['photo', 'paste', 'continue', 'dismiss'] })
    const sheet3 = e(20, 'offer', { surface: 'read', options: ['photo', 'paste', 'dismiss'] })
    const events = [
      nav(0, null, 'index', 'open'),
      sheet1, e(2, 'pick', { surface: 'read', option: 'continue', group: sheet1.id }), nav(3, 'index', 'reader', 'push', 3000),
      nav(8, 'reader', 'index', 'back', 5000),
      sheet2, e(11, 'pick', { surface: 'read', option: 'dismiss', group: sheet2.id }),
      sheet3, e(21, 'pick', { surface: 'read', option: 'photo', group: sheet3.id }), nav(21, 'index', 'camera', 'push', 13000),
      nav(25, 'camera', 'index', 'back', 4000),
    ]
    const read = readSheet(events)
    expect(read.showings).toBe(3)
    expect(read.offered).toEqual({ photo: 3, paste: 3, continue: 2, dismiss: 3 })
    expect(read.rows.map(({ choice, chosen, read: opened }: any) => [choice, chosen, opened])).toEqual([['continue', 1, 1], ['dismiss', 1, 0], ['photo', 1, 0]])
    const camera = abandoned(events).find((row: any) => row.screen === 'camera')
    expect(camera).toMatchObject({ started: 1, abandoned: 1, by: { 'nothing tried': 1 } })
  })
  it('counts a control in the showings that offered it, so one never used shows as 0 of n', () => {
    seq = 0
    const tap1 = e(1, 'offer', { surface: 'reader drawer', options: ['close', 'listen'] })
    const more1 = e(2, 'offer', { surface: 'reader drawer', options: ['details'], group: tap1.id })
    const tap2 = e(5, 'offer', { surface: 'reader drawer', options: ['close', 'listen'] })
    const tap3 = e(9, 'offer', { surface: 'reader drawer', options: ['close', 'listen', 'details'] })
    const events = [tap1, more1, tap2, tap3, e(10, 'pick', { surface: 'reader drawer', option: 'close', group: tap3.id })]
    const drawer = features(events).find((row: any) => row.surface === 'reader drawer')
    expect(drawer.showings).toBe(3)
    const option = (name: string) => drawer.options.find((row: any) => row.option === name)
    expect(option('details')).toMatchObject({ offered: 2, usedIn: 0, uses: 0, share: 0 })
    expect(option('close')).toMatchObject({ offered: 3, usedIn: 1, share: 1 / 3 })
  })
  it('finds Back pressed again right after Back returned to the camera, with every arrival as the denominator', () => {
    seq = 0
    const events = [
      nav(0, null, 'index', 'open'),
      nav(1, 'index', 'camera', 'push', 1000), nav(5, 'camera', 'reader', 'push', 4000),
      nav(30, 'reader', 'camera', 'back', 25000), nav(31, 'camera', 'index', 'back', 1200),
      nav(40, 'index', 'camera', 'push', 9000), nav(45, 'camera', 'reader', 'push', 5000),
      nav(60, 'reader', 'camera', 'back', 15000), nav(70, 'camera', 'index', 'back', 10000, { away: 8000 }),
    ]
    const back = backtracks(events, 3000).find((row: any) => row.key === 'reader → camera · back')
    expect(back).toMatchObject({ arrivals: 2, backtracked: 2 })
    expect(back.times.map((t: any) => t.ms)).toEqual([1200, 2000])
    expect(backtracks(events, 1500).find((row: any) => row.key === 'reader → camera · back').backtracked).toBe(1)
  })
  it('doesn\'t take a screen change a control made for Back', () => {
    seq = 0
    const events = [nav(0, 'index', 'practice', 'push', 1000), nav(1, 'practice', 'index', 'back', 1000, { after: 'done' })]
    expect(backtracks(events, 3000).find((row: any) => row.to === 'practice').backtracked).toBe(0)
  })
})

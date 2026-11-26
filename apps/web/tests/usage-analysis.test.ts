import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain module served to the viewer as it is
import { abandoned, backtracks, detours, features, navCheck, paths, patterns, readSheet, showings } from '../public/usage-analysis.js'

// One session's events, in order: `at` in seconds.
let seq = 0
const e = (at: number, type: string, fields: Record<string, unknown>) => ({ id: `s:${seq}`, session: 's', seq: seq++, at: at * 1000, type, ...fields })
// Screen changes as the v2 tracker records them (`nv: 2`).
const nav = (at: number, from: string | null, to: string, how: string, ms?: number, extra: Record<string, unknown> = {}) => e(at, 'nav', { nv: 2, from, to, how, ...(ms !== undefined ? { ms } : {}), ...extra })

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
  it('counts Continue out of the openings that offered it: 1 of 2, not 1 of 10', () => {
    seq = 0
    const events: any[] = []
    for (let i = 0; i < 10; i++) {
      const sheet = e(i * 10, 'offer', { surface: 'read', options: ['photo', 'paste', ...(i < 2 ? ['continue'] : []), 'dismiss'] })
      events.push(sheet, e(i * 10 + 1, 'pick', { surface: 'read', option: i === 0 ? 'continue' : 'dismiss', group: sheet.id }))
    }
    const option = features(events).find((row: any) => row.surface === 'read').options.find((row: any) => row.option === 'continue')
    expect(option).toMatchObject({ offered: 2, usedIn: 1, share: 0.5 })
  })
  it('checks screen changes against where surfaces appeared, and leaves v1 sessions out', () => {
    seq = 0
    const v1 = [{ id: 'old:0', session: 'old', seq: 0, at: 0, type: 'nav', from: null, to: 'index', how: 'open' },
      { id: 'old:1', session: 'old', seq: 1, at: 1000, type: 'offer', surface: 'study card', options: ['done'] }]
    const events = [...v1,
      nav(0, null, 'index', 'open'), e(0.1, 'offer', { surface: 'home', options: ['read'] }),
      nav(1, 'index', 'practice', 'push', 1000), e(1.1, 'offer', { surface: 'study card', options: ['done'] }),
      // A surface on another screen than the last screen change says: a missed change.
      e(5, 'offer', { surface: 'your words', options: ['study'] }),
      nav(9, 'practice', 'word', 'unknown', 3000, { popped: 2, pushed: 2 })]
    const check = navCheck(events)
    expect(check).toMatchObject({ sessions: 2, tracked: 1, untracked: 1, navs: 3, checked: 3, agree: 2, disagreeing: 1, byHow: { open: 1, push: 1, unknown: 1 } })
    expect(check.disagree[0]).toMatchObject({ surface: 'your words', expected: 'vocabulary', screen: 'practice' })
  })
  it('finds detours and retries, each out of the arrivals they began with', () => {
    seq = 0
    const events = [
      nav(0, null, 'index', 'open'),
      nav(1, 'index', 'library', 'push', 1000), nav(2, 'library', 'index', 'back', 1000), nav(3, 'index', 'vocabulary', 'push', 1000),
      nav(10, 'vocabulary', 'index', 'back', 7000),
      nav(11, 'index', 'library', 'push', 1000), nav(12, 'library', 'index', 'back', 1000), nav(13, 'index', 'library', 'push', 1000),
      nav(30, 'library', 'index', 'back', 17000),
    ]
    const rows = detours(events, 3000)
    expect(rows.find((row: any) => row.kind === 'detour')).toMatchObject({ steps: ['Home', '→ Library', '↩ Home at once', '→ Your words'], count: 1, comparable: 3 })
    expect(rows.find((row: any) => row.kind === 'retry')).toMatchObject({ count: 1, comparable: 3 })
  })
  it('finds recurring paths with their share of comparable moments, panels closed at once, and screens left untouched', () => {
    seq = 0
    const events: any[] = [nav(0, null, 'index', 'open')]
    let at = 1
    for (let i = 0; i < 3; i++) {
      const drawer = e(at + 1, 'offer', { surface: 'reader drawer', options: ['close', 'details'], by: 'reader: tap a word' })
      events.push(nav(at, 'index', 'reader', 'push', 1000), e(at + 0.5, 'pick', { surface: 'reader', option: 'tap a word' }), drawer,
        e(at + 2, 'pick', { surface: 'reader drawer', option: i < 2 ? 'close' : 'details', group: drawer.id }), nav(at + 5, 'reader', 'index', 'back', 5000))
      at += 10
    }
    events.push(nav(at, 'index', 'account', 'push', 1000), nav(at + 2, 'account', 'index', 'back', 2000))
    const found = paths(events)
    // Of the 3 arrivals at the Reader, 2 went on this way (the 3-step path is inside it, as often).
    const path = found.find((row: any) => row.steps.join(' | ') === '→ Reader | reader: tap a word | reader drawer: close | ↩ Home')
    expect(path).toMatchObject({ count: 2, comparable: 3 })
    expect(found.some((row: any) => row.steps.join(' | ') === '→ Reader | reader: tap a word | reader drawer: close')).toBe(false)
    const drawer = showings(events).find((row: any) => row.surface === 'reader drawer')
    expect(drawer).toMatchObject({ showings: 3, used: 1, closedAtOnce: 2, by: { 'reader: tap a word': 3 } })
    const all = patterns(events, 3000)
    expect(all.find((row: any) => row.kind === 'left untouched')).toMatchObject({ steps: ['→ Account', 'nothing done', '↩ Back'], count: 1, comparable: 1 })
    expect(all.find((row: any) => row.kind === 'panel closed at once')).toMatchObject({ count: 2, comparable: 3, share: 2 / 3 })
  })
})

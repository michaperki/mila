import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain module served to the viewer as it is
import { abandoned, backtracks, detours, features, lookupWaits, navCheck, paths, patterns, prepare, readSheet, showings, waits, waitSummary } from '../public/usage-analysis.js'

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

  it('puts right the first v2 builds: the root layout at launch, and system Back taken for a pick', () => {
    seq = 0
    const fixed = prepare([
      nav(0, null, '__root', 'open'), nav(0.01, '__root', 'index', 'replace', 6),
      e(1, 'pick', { surface: 'your words', option: 'open a word' }), nav(2.3, 'word', 'vocabulary', 'back', 1300, { action: 'POP', after: 'open a word' }),
      nav(4, 'word', 'vocabulary', 'back', 900, { action: 'GO_BACK', after: 'delete word' }),
    ])
    expect(fixed.filter((x: any) => x.type === 'nav').map((x: any) => [x.from, x.to, x.how, x.after ?? null])).toEqual([[null, 'index', 'open', null], ['word', 'vocabulary', 'back', null], ['word', 'vocabulary', 'back', 'delete word']])
  })

  it('tells what reached the learner: ready, failed, left before ready, or unknown with no outcome', () => {
    seq = 0
    const w = (at: number, state: string, fields: Record<string, unknown>) => e(at, 'wait', { state, ...fields })
    const a = w(1, 'start', { surface: 'camera', what: 'photo to passage', goal: 'passage', from: 'capture' })
    const b = w(20, 'start', { surface: 'camera', what: 'photo to passage', goal: 'passage', from: 'photo' })
    const c = w(40, 'start', { surface: 'camera', what: 'photo to passage', goal: 'passage', from: 'capture' })
    const d = w(60, 'start', { surface: 'camera', what: 'photo to passage', goal: 'passage', from: 'capture' })
    const events = [
      a, w(6, 'reached', { of: a.id, milestone: 'passage', ms: 5000 }), w(6, 'end', { of: a.id, how: 'ready', ms: 5000, after: 0, reached: ['passage'] }),
      b, w(23, 'end', { of: b.id, how: 'screen left', ms: 3000, reached: [] }),
      c, w(45, 'failed', { of: c.id, reason: 'no text', ms: 4000 }), w(45, 'end', { of: c.id, how: 'failed', ms: 4000, reached: [] }),
      d,
    ]
    const list = waits(events)
    expect(list.map((x: any) => x.outcome)).toEqual(['ready', 'left before ready', 'failed', 'unknown'])
    const [row] = waitSummary(list)
    expect(row).toMatchObject({ started: 4, ready: 1, failed: 1, left: 1, unknown: 1, known: 3, readyMedian: 5000, leftHow: { 'screen left': 1 }, failedWhy: { 'no text': 1 } })
    // Left before ready is a pattern out of the waits whose outcome is known: 1 of 3, not of 4.
    const left = patterns(events).find((p: any) => p.kind === 'left before ready')
    expect(left).toMatchObject({ steps: ['photo to passage (photo)', 'waiting for passage', 'screen left before it showed'], count: 1, comparable: 3 })
    expect(left.examples[0]).toMatchObject({ id: b.id, last: { id: events[4].id } })
  })

  it('makes word lookups waits from their own events: first meaning, Details, foreground time, failures', () => {
    seq = 0
    const T = 1000_000
    const st = (at: number, type: string, fields: Record<string, unknown>) => ({ id: `r:${seq}`, session: 'reading', seq: seq++, at: T + at * 1000, type, ...fields })
    const u = (at: number, type: string, fields: Record<string, unknown>) => ({ id: `u:${seq}`, session: 'app', seq: seq++, at: T + at * 1000, type, ...fields })
    const drawer1 = u(0.05, 'offer', { surface: 'reader drawer', options: ['close', 'listen', 'save'] })
    const usage = [u(-5, 'nav', { nv: 2, to: 'reader', how: 'push' }), drawer1, u(10.94, 'offer', { surface: 'reader drawer', options: ['details'], group: drawer1.id }), u(14, 'pick', { surface: 'reader drawer', option: 'close', group: drawer1.id })]
    // The session seen in Preview: the meaning and Details after about 11 s, closed 3 s later.
    // Here with 2 s in the background while waiting, which isn't counted.
    const l1 = st(0, 'lookup', { saved: false })
    const l2 = st(30, 'lookup', { saved: false }) // left before anything showed; the explanation came after
    const l3 = st(50, 'lookup', { saved: false }) // the quick meaning showed, then the explanation failed
    const l4 = st(70, 'lookup', { saved: false }) // no closed event: unknown
    const l5 = st(-60, 'lookup', { saved: false }) // closed before `v: 2`: its meaning time is unreliable, left out
    const lookups = [
      st(-59, 'closed', { of: l5.id, how: 'closed', ms: 4000, waitMs: 3000, details: false }), l5,
      l1, st(3, 'app', { state: 'background' }), st(5, 'app', { state: 'active' }), st(10.9, 'explained', { of: l1.id, why: 'tap', ms: 10900 }),
      st(14, 'closed', { v: 2, of: l1.id, how: 'closed', ms: 14000, waitMs: 10980, shown: 'meaning', details: false }),
      l2, st(32, 'closed', { v: 2, of: l2.id, how: 'left', ms: 2000, waitMs: null, shown: null, details: false }), st(36, 'explained', { of: l2.id, why: 'tap', ms: 6000 }),
      l3, st(51, 'closed', { v: 2, of: l3.id, how: 'next word', ms: 1000, waitMs: 200, shown: 'quick', details: false, failed: 'error' }),
      l4,
    ]
    const made = lookupWaits(lookups, usage)
    expect(made.skipped).toBe(1)
    const list = waits([...usage, ...made.events])
    expect(list.map((x: any) => [x.outcome, x.readyMs, x.waitedMs, x.details])).toEqual([
      ['ready', 8980, 12000, 'moved on'],
      ['left before ready', null, 2000, 'left before it could be known'],
      ['ready', 200, 1000, 'failed'],
      ['unknown', null, null, null],
    ])
    expect(list[0].reached).toEqual([{ milestone: 'meaning', ms: 8980 }, { milestone: 'details', ms: 8980 }])
    expect(made.events.find((x: any) => x.of === `lookup:${l2.id}` && x.state === 'end').arrivedAfter).toBe(4000)
    const found = patterns([...usage, ...made.events])
    expect(found.find((p: any) => p.kind === 'available, moved on')).toMatchObject({ count: 1, comparable: 1 })
    expect(found.find((p: any) => p.kind === 'left before ready')).toMatchObject({ steps: ['word lookup', 'waiting for meaning', 'screen left before it showed'], count: 1, comparable: 3 })
  })

  it("counts the reader's sheet's Details (v: 3) as its explanation arriving, once asked for", () => {
    const T = 1_800_000_000_000
    let seq = 0
    const st = (at: number, type: string, fields: Record<string, unknown>) => ({ id: `r:${seq}`, session: 'reading', seq: seq++, at: T + at * 1000, type, ...fields })
    const u = (at: number, type: string, fields: Record<string, unknown>) => ({ id: `u:${seq}`, session: 'app', seq: seq++, at: T + at * 1000, type, ...fields })
    // Details is offered at once now: that alone is no milestone.
    const usage = [u(-5, 'nav', { nv: 2, to: 'reader', how: 'push' }), u(0.05, 'offer', { surface: 'reader drawer', options: ['close', 'listen', 'details', 'save'] })]
    const asked = st(0, 'lookup', { saved: false })
    const notAsked = st(20, 'lookup', { saved: false })
    const lookups = [
      asked, st(6, 'explained', { of: asked.id, why: 'details', ms: 6000 }), st(9, 'closed', { v: 3, of: asked.id, how: 'next word', ms: 9000, waitMs: 300, shown: 'quick', details: true }),
      notAsked, st(21.5, 'closed', { v: 3, of: notAsked.id, how: 'closed', ms: 1500, waitMs: 200, shown: 'quick', details: false }),
    ]
    const list = waits([...usage, ...lookupWaits(lookups, usage).events])
    expect(list.map((x: any) => x.reached)).toEqual([[{ milestone: 'meaning', ms: 300 }, { milestone: 'details', ms: 6000 }], [{ milestone: 'meaning', ms: 200 }]])
  })
})

// Usage analysis (2026-11-26): what the Usage view (/debug.html → Usage) shows, worked out from
// usage events (apps/mobile/src/lib/usage.ts) alone. Pure: events in, tables out, so it is tested
// (tests/usage-analysis.test.ts) and the viewer only draws.
//
// An event: { id, session, seq, at, type: 'nav' | 'offer' | 'pick' | 'outcome', ... }.
//   nav     { to, from, how: 'open' | 'push' | 'back' | 'replace', popped?, ms?, away?, after? }
//   offer   { surface, options, group? }   the first offer of a showing has no group: its id is it
//   pick    { surface, option, group, value? }
//   outcome { surface, outcome }
//   wait    { state: 'start' | 'reached' | 'failed' | 'end', ... }   waiting for something to reach
//           the learner (usage.ts waitFor); word lookups' waits are made here from their own study
//           events (lookupWaits)

// The surfaces whose controls are recorded, and since when; everything else is screens only.
// Kept here so the view can say "not tracked" rather than show a zero. Screen changes count only
// from the fixed tracker (`nv: 2`, 2026-11-26 v2): v1's saw the launch and nothing after.
export const COVERAGE = [
  { surface: 'screens', what: 'Every screen change in the app: where from, how (push, Back, replace, unknown), time on the screen before', since: '2026-11-26 (v2)' },
  { surface: 'home', what: 'Read, Library, Study (and what it offered: continue a round, a suggestion), Your words, Account, touching the tree', since: '2026-11-26' },
  { surface: 'read', what: 'Home → Read sheet: starters, photo, paste, continue, dismiss', since: '2026-11-26' },
  { surface: 'camera', what: 'Capture and Live once the camera is ready, choose a photo, paste, about, read this passage, cancel; outcomes: opened reader, no text, read failed', since: '2026-11-26' },
  { surface: 'compose', what: 'Type or paste, Translate & read once there is text; outcomes: opened reader, read failed', since: '2026-11-26 (v2)' },
  { surface: 'reader', what: 'Tap a word, select words, English, cursive, vowels, text size, save passage, remove from library', since: '2026-11-26 (tap and select v2)' },
  { surface: 'sentence bar', what: 'Previous and next where there is one, listen, done', since: '2026-11-26' },
  { surface: 'reader drawer', what: 'Close, listen, Details once there are details, save / undo, in your words, pick a word, save just the word, save the pattern, study now', since: '2026-11-26' },
  { surface: 'study card', what: 'Top bar: done, previous (not on the first card), next, new round, settings, why; tap a word once the answer shows a sentence', since: '2026-11-26 (tap a word v2)' },
  { surface: 'study drawer', what: 'A word tapped on a card: as the reader drawer, plus More', since: '2026-11-26' },
  { surface: 'study settings', what: 'Each setting, new sentences, cursive answers, close', since: '2026-11-26' },
  { surface: 'study welcome back', what: 'Continue, new round', since: '2026-11-26' },
  { surface: 'study end', what: 'Back to your tree, another round, new sentences', since: '2026-11-26' },
  { surface: 'your words', what: 'Study, search, status filter, theme, open a word', since: '2026-11-26' },
  { surface: 'word page', what: 'Listen, mark known / undo, all forms, root, stages (fold, mark known, undo, study now), built on, expressions, its words, open passage, delete', since: '2026-11-26 (v2)' },
  { surface: 'library', what: 'Search, sort, open a passage (which row), passage menu (long press or …) and its choice, rename, delete, photos waiting: read again, delete; pull to refresh', since: '2026-11-26 (v2)' },
  { surface: 'account', what: 'Every setting and button, check for updates (outcomes: update found, already latest, failed), Learning Insights, debug capture (start, stop, outcomes); panels seen: AI spend, Learning Insights, debug capture, temporary password', since: '2026-11-26 (v2)' },
  { surface: 'waits', what: 'Photo → readable passage (from the shutter, a photo chosen, or Read this passage on a live result, to the Reader opening on it); Listen → its sound starting. Each: what became visible and when, failures, or how it was left before', since: '2026-11-27' },
  { surface: 'word lookups', what: 'From the lookups’ own events: first meaning shown (the sentence’s quick meaning counts), Details becoming available, failures, how the drawer was left', since: '2026-11-27 (meaning times before this missed the quick meaning, so earlier Reader lookups are left out)' },
  { surface: 'import', what: 'Task, preview changes once something is pasted, apply, undo; outcomes: previewed, applied, nothing to change, failed', since: '2026-11-26 (v2)' },
]
export const NOT_TRACKED = 'Controls on All forms, Root, Learning Insights, sign in and the password forms (their screens are tracked); swipes and answers on cards (those are study events); scrolling, except developer panels on Account coming into view.'

// Route names as the app shows them.
const SCREEN = { index: 'Home', camera: 'Camera', reader: 'Reader', compose: 'Paste text', practice: 'Study', vocabulary: 'Your words', word: 'Word page', library: 'Library', account: 'Account', import: 'Import', insights: 'Insights', table: 'All forms', root: 'Root', login: 'Sign in', signup: 'Create account' }
export const screenName = name => SCREEN[name] ?? name ?? '—'
// The screen each surface is on, to check screen changes against where controls were offered.
const SCREEN_OF = { home: 'index', read: 'index', camera: 'camera', compose: 'compose', reader: 'reader', 'sentence bar': 'reader', 'reader drawer': 'reader', 'study card': 'practice', 'study drawer': 'practice', 'study settings': 'practice', 'study welcome back': 'practice', 'study end': 'practice', 'your words': 'vocabulary', 'word page': 'word', library: 'library', account: 'account', import: 'import' }
// Surfaces that are panels or sheets over a screen, rather than a screen's own controls (whose
// visits are judged by what was done on the screen: leftUntouched).
const PANELS = new Set(['read', 'sentence bar', 'reader drawer', 'study drawer', 'study settings', 'study welcome back', 'study end'])
// Picks that close what they are on rather than use it.
const CLOSING = new Set(['close', 'dismiss', 'done', 'cancel', 'privacy: show less'])

const byTime = (a, b) => a.at - b.at || (a.session === b.session ? a.seq - b.seq : 0)
const groupOf = event => event.group ?? event.id
// Time on a screen with Mila in the foreground.
export const activeMs = nav => Math.max(0, (nav.ms ?? 0) - (nav.away ?? 0))
// Back, as the learner pressed it: not a screen change a control made (Done, Back to your tree).
const isBack = nav => nav.how === 'back' && !nav.after
const label = nav => (nav.how === 'back' && nav.after ? `back (${nav.after})` : nav.how)

export function sessionsOf(events) {
  const sessions = new Map()
  for (const event of [...events].sort(byTime)) {
    if (!sessions.has(event.session)) sessions.set(event.session, [])
    sessions.get(event.session).push(event)
  }
  // In time order (one phone's clock), so waits made from lookup events fall in place.
  for (const list of sessions.values()) list.sort((a, b) => a.at - b.at || a.seq - b.seq)
  return sessions
}

// The events as recorded, with what the first v2 builds got wrong put right (2026-11-27): every
// launch recorded opening the root layout (`__root`) and then a replace by Home, which is the
// launch; and Back by the system (action POP) taken soon after a pick was put down to that pick.
export function prepare(events) {
  const out = []
  for (const event of events) {
    if (event.type !== 'nav') { out.push(event); continue }
    if (event.to === '__root') continue
    let fixed = event
    if (event.from === '__root') { const { ms: _ms, away: _away, ...rest } = event; fixed = { ...rest, from: null, how: 'open' } }
    if (fixed.action === 'POP' && fixed.after) { const { after: _after, ...rest } = fixed; fixed = rest }
    out.push(fixed)
  }
  return out
}
const ref = event => ({ session: event.session, id: event.id })

// Each surface's controls: how many showings offered each, in how many it was used, and how often.
export function features(events) {
  const surfaces = new Map()
  const surface = name => {
    if (!surfaces.has(name)) surfaces.set(name, { surface: name, showings: new Set(), first: Infinity, last: 0, options: new Map() })
    return surfaces.get(name)
  }
  const option = (s, name) => {
    if (!s.options.has(name)) s.options.set(name, { option: name, offered: new Set(), usedIn: new Set(), uses: 0, values: {}, firstOffered: null, lastUsed: null, examples: [], unoffered: 0 })
    return s.options.get(name)
  }
  const sorted = [...events].sort(byTime)
  for (const event of sorted) {
    if (event.type !== 'offer' || !event.surface) continue
    const s = surface(event.surface), group = groupOf(event)
    s.showings.add(group); s.first = Math.min(s.first, event.at); s.last = Math.max(s.last, event.at)
    for (const name of event.options ?? []) { const o = option(s, name); o.offered.add(group); o.firstOffered ??= event.at }
  }
  for (const event of sorted) {
    if (event.type !== 'pick' || !event.surface) continue
    const s = surface(event.surface), o = option(s, event.option)
    o.uses++; o.lastUsed = event.at
    if (event.group && o.offered.has(event.group)) o.usedIn.add(event.group)
    else o.unoffered++
    if (event.value !== undefined) { const key = String(event.value); o.values[key] = (o.values[key] ?? 0) + 1 }
    if (o.examples.length < 20) o.examples.push(ref(event))
  }
  return [...surfaces.values()].map(s => ({
    surface: s.surface, showings: s.showings.size, first: Number.isFinite(s.first) ? s.first : null, last: s.last || null,
    options: [...s.options.values()].map(o => ({
      surface: s.surface, option: o.option, offered: o.offered.size, usedIn: o.usedIn.size, uses: o.uses,
      share: o.offered.size ? o.usedIn.size / o.offered.size : null, values: o.values, firstOffered: o.firstOffered, lastUsed: o.lastUsed,
      examples: o.examples, unoffered: o.unoffered,
      // Showings that offered it and didn't use it: where to look when it is rarely used.
      missed: [...o.offered].filter(group => !o.usedIn.has(group)).slice(-20),
    })),
  }))
}

// Every arrival at a screen, with how it was left: by Back within `threshold` ms of Mila in the
// foreground is a backtrack. Grouped by how the screen was arrived at (from, how, to): each row has
// how many arrivals there were (the denominator), how many were backed out of in time, and every
// arrival's active time on the screen, so other cutoffs can be read off.
export function backtracks(events, threshold = 3000) {
  const patterns = new Map()
  for (const list of sessionsOf(events).values()) {
    const navs = list.filter(event => event.type === 'nav')
    for (let i = 0; i < navs.length; i++) {
      const arrive = navs[i], leave = navs[i + 1]
      if (arrive.how === 'open') continue
      const key = `${arrive.from} → ${arrive.to} · ${label(arrive)}`
      if (!patterns.has(key)) patterns.set(key, { key, from: arrive.from, to: arrive.to, how: label(arrive), arrivals: 0, backtracked: 0, times: [], examples: [] })
      const p = patterns.get(key)
      p.arrivals++
      if (!leave) continue
      const ms = activeMs(leave)
      const back = isBack(leave)
      p.times.push({ ms, back, ...ref(arrive), left: ref(leave) })
      if (back && ms <= threshold) { p.backtracked++; if (p.examples.length < 20) p.examples.push({ ...ref(arrive), ms }) }
    }
  }
  return [...patterns.values()]
}

// The Read sheet, each time it was open: what it offered, what was chosen (or that it was
// dismissed), and whether a passage was then opened before Home came back.
export function readSheet(events) {
  const rows = new Map(), offered = new Map(), tracked = trackedSessions(events)
  let showings = 0
  for (const list of sessionsOf(events).values()) {
    const groups = new Map()
    list.forEach((event, i) => {
      if (event.surface !== 'read') return
      if (event.type === 'offer') {
        const group = groupOf(event)
        if (!groups.has(group)) { groups.set(group, { options: new Set(), pick: null }); showings++ }
        for (const name of event.options ?? []) groups.get(group).options.add(name)
      }
      if (event.type === 'pick' && groups.has(event.group) && !groups.get(event.group).pick) groups.get(event.group).pick = { event, i }
    })
    for (const { options, pick } of groups.values()) {
      for (const name of options) offered.set(name, (offered.get(name) ?? 0) + 1)
      const choice = pick?.event.option ?? 'nothing recorded'
      if (!rows.has(choice)) rows.set(choice, { choice, chosen: 0, read: 0, checked: 0, examples: [] })
      const row = rows.get(choice)
      row.chosen++
      if (pick && row.examples.length < 20) row.examples.push(ref(pick.event))
      // Whether it led to reading needs the screen changes after it, so only where they were kept.
      if (pick && tracked.has(list[0]?.session)) {
        row.checked++
        // Read: the reader opened before Home was arrived at again.
        let read = false
        for (const later of list.slice(pick.i + 1)) {
          if (later.type !== 'nav') continue
          if (later.to === 'reader') { read = true; break }
          if (later.to === 'index') break
        }
        if (read) row.read++
      }
    }
  }
  return { showings, offered: Object.fromEntries(offered), rows: [...rows.values()].sort((a, b) => b.chosen - a.chosen) }
}

// Tasks started and not finished, each by what happened last: a camera visit (not one returned
// to by Back) with no passage opened, Paste text left without reading, Study left before a
// round's end, an import previewed and not applied.
export function abandoned(events) {
  const outcomeIn = (during, name) => during.some(event => event.type === 'outcome' && event.outcome === name)
  const tasks = [
    { task: 'Camera visit ended without a passage', screen: 'camera', done: (_during, next) => next?.to === 'reader' || next?.to === 'compose' },
    { task: 'Paste text left without reading', screen: 'compose', done: (_during, next) => next?.to === 'reader' },
    { task: 'Study left before the round’s end', screen: 'practice', done: during => during.some(event => event.type === 'offer' && event.surface === 'study end') },
    { task: 'Import previewed and not applied', screen: 'import', started: during => outcomeIn(during, 'previewed'), done: during => outcomeIn(during, 'applied') },
  ]
  return tasks.map(({ task, screen, started, done }) => {
    const row = { task, screen, started: 0, abandoned: 0, by: {}, examples: [] }
    for (const list of sessionsOf(events).values()) {
      list.forEach((event, i) => {
        if (event.type !== 'nav' || event.to !== screen || event.how === 'back') return
        const rest = list.slice(i + 1)
        const leaving = rest.findIndex(later => later.type === 'nav')
        const during = leaving < 0 ? rest : rest.slice(0, leaving)
        const next = leaving < 0 ? null : rest[leaving]
        if (!next) return
        if (started && !started(during, next)) return
        row.started++
        if (done(during, next)) return
        row.abandoned++
        const lastOutcome = during.filter(later => later.type === 'outcome').pop()?.outcome
        const why = lastOutcome ? `after “${lastOutcome}”` : during.some(later => later.type === 'pick') ? 'after using a control' : 'nothing tried'
        row.by[why] = (row.by[why] ?? 0) + 1
        if (row.examples.length < 20) row.examples.push(ref(event))
      })
    }
    return row
  })
}

// One session's events around an example, to read what happened.
export function around(events, session, id, before = 12, after = 12) {
  const list = sessionsOf(events).get(session) ?? []
  const at = list.findIndex(event => event.id === id)
  return { list: list.slice(Math.max(0, at - before), at + after + 1), at: list[at] ?? null }
}

export function describe(event) {
  if (event.type === 'nav') return `${screenName(event.from)} → ${screenName(event.to)} · ${label(event)}${event.how === 'unknown' ? ` (${event.popped} off, ${event.pushed} on${event.action ? `, ${event.action}` : ''})` : ''}${event.nv ? '' : ' [v1 tracker]'}${event.ms !== undefined ? ` · ${(activeMs(event) / 1000).toFixed(1)} s on ${event.from}` : ''}${event.away ? ` (${Math.round(event.away / 1000)} s away)` : ''}`
  if (event.type === 'offer') return `${event.surface} ${event.group ? 'now also offers' : 'appears, offering'} ${(event.options ?? []).join(', ')}${event.by ? ` (brought up by ${event.by})` : ''}`
  if (event.type === 'seen') return `${event.surface}: ${event.panel} panel scrolled into view`
  if (event.type === 'pick') return `${event.surface}: ${event.option}${event.value !== undefined ? ` = ${event.value}` : ''}`
  if (event.type === 'outcome') return `${event.surface}: ${event.outcome}`
  if (event.type === 'wait') {
    if (event.state === 'start') return `${event.what} asked for${event.from ? ` (${event.from})` : ''}, waiting for ${event.goal}${event.by ? ` · by ${event.by}` : ''}`
    if (event.state === 'reached') return `${event.milestone} ${event.milestone === 'playing' ? 'started' : 'visible'} after ${seconds(event.ms)}${event.shown === 'quick' ? ' (the sentence’s quick meaning)' : ''}${event.fellBack ? ` (fell back to the ${event.fellBack === true ? 'phone’s voice' : event.fellBack})` : ''}${event.voice ? ` · ${event.voice}` : ''}`
    if (event.state === 'failed') return `${event.what ?? 'wait'} failed: ${event.reason}${event.ms !== null && event.ms !== undefined ? ` after ${seconds(event.ms)}` : ''}`
    if (event.state === 'end') return `${event.how === 'ready' ? 'ready' : `ended: ${event.how}`} after ${seconds(event.ms)}${event.after !== undefined ? `, ${seconds(event.after)} after ${event.reached?.[event.reached.length - 1] ?? 'it'} showed` : ', nothing shown yet'}${event.used?.length ? ` · used ${event.used.join(', ')}` : ''}${event.arrivedAfter !== undefined ? ` · it arrived ${seconds(event.arrivedAfter)} later` : ''}`
  }
  return event.type
}
const seconds = ms => (ms === null || ms === undefined ? '?' : `${(ms / 1000).toFixed(1)} s`)

// Sessions whose screen changes were recorded by the fixed tracker (`nv: 2`). Before it, a
// session has the launch and nothing after, so anything worked out from screen changes uses
// these only.
export function trackedSessions(events) {
  const tracked = new Set()
  for (const event of events) if (event.type === 'nav' && event.nv >= 2) tracked.add(event.session)
  return tracked
}
export const trackedEvents = events => { const tracked = trackedSessions(events); return events.filter(event => tracked.has(event.session)) }

// Checking the screen changes against the rest: each surface appearing (its first offer) should be
// on the screen the last screen change arrived at. A disagreement is a missed or wrong screen
// change; unknown changes are counted with what the stacks did.
export function navCheck(events) {
  const tracked = trackedSessions(events)
  const all = new Set(events.map(event => event.session))
  const byHow = {}, disagree = [], unknown = []
  let navs = 0, checked = 0, agree = 0, beforeAny = 0, first = null
  for (const [session, list] of sessionsOf(events)) {
    if (!tracked.has(session)) continue
    let screen = null
    for (const event of list) {
      if (event.type === 'nav') {
        navs++; byHow[event.how] = (byHow[event.how] ?? 0) + 1; screen = event.to; first ??= event.at
        if (event.how === 'unknown' && unknown.length < 20) unknown.push(ref(event))
      }
      if (event.type !== 'offer' || event.group || !SCREEN_OF[event.surface]) continue
      if (screen === null) { beforeAny++; continue }
      checked++
      if (SCREEN_OF[event.surface] === screen) agree++
      else if (disagree.length < 50) disagree.push({ ...ref(event), surface: event.surface, expected: SCREEN_OF[event.surface], screen })
    }
  }
  return { sessions: all.size, tracked: tracked.size, untracked: all.size - tracked.size, navs, byHow, checked, agree, disagree, disagreeing: checked - agree, beforeAny, unknown, first }
}

// A session as steps: screen changes and explicit actions (picks, outcomes), the same step done
// again straight away counted once (×n). Panels appearing and coming into view are not steps;
// they show in the examples.
const MARK = { open: '●', push: '→', back: '↩', replace: '⇢', unknown: '?' }
export function stepsOf(list) {
  const steps = []
  for (const event of list) {
    let text = null
    if (event.type === 'nav') text = `${MARK[event.how] ?? '?'} ${screenName(event.to)}${event.how === 'back' && event.after ? ` (by ${event.after})` : ''}`
    if (event.type === 'pick') text = `${event.surface}: ${event.option}${typeof event.value === 'string' && event.value.length <= 24 ? ` = ${event.value}` : ''}`
    if (event.type === 'outcome') text = `${event.surface} ⇒ ${event.outcome}`
    if (!text) continue
    const last = steps[steps.length - 1]
    if (last?.text === text) { last.times++; continue }
    steps.push({ text, kind: event.type, event, times: 1 })
  }
  return steps
}

// Recurring paths: every run of 2 to `longest` steps, how often it happened, and its share of the
// comparable visits: the times its first step happened with as many steps after it. A path that
// only ever occurs inside a longer one with the same count is left for the longer one.
export function paths(events, { longest = 4, least = 2 } = {}) {
  const counts = new Map(), comparable = new Map()
  for (const list of sessionsOf(trackedEvents(events)).values()) {
    const steps = stepsOf(list), texts = steps.map(step => step.text)
    for (let n = 2; n <= longest; n++) {
      for (let i = 0; i + n <= texts.length; i++) {
        const key = texts.slice(i, i + n).join('\u0000'), first = `${n}\u0000${texts[i]}`
        comparable.set(first, (comparable.get(first) ?? 0) + 1)
        if (!counts.has(key)) counts.set(key, { steps: texts.slice(i, i + n), count: 0, examples: [] })
        const row = counts.get(key)
        row.count++
        if (row.examples.length < 20) row.examples.push({ ...ref(steps[i].event), last: ref(steps[i + n - 1].event) })
      }
    }
  }
  const rows = [...counts.entries()].filter(([, row]) => row.count >= least)
  const kept = new Map(rows)
  for (const [, row] of rows) {
    if (row.steps.length < 3) continue
    for (const part of [row.steps.slice(0, -1), row.steps.slice(1)]) {
      const key = part.join('\u0000')
      if (kept.get(key)?.count === row.count) kept.delete(key)
    }
  }
  return [...kept.values()].map(row => ({ kind: 'path', steps: row.steps, count: row.count, comparable: comparable.get(`${row.steps.length}\u0000${row.steps[0]}`), examples: row.examples }))
}

// Detours: arriving at a screen, going straight Back, and then going somewhere else (a wrong
// turn), or to the same screen again (a retry). Each out of every arrival at that screen from
// the screen before it.
export function detours(events, threshold = 3000) {
  const arrivals = new Map(), found = new Map()
  for (const list of sessionsOf(trackedEvents(events)).values()) {
    const navs = list.filter(event => event.type === 'nav')
    for (let i = 0; i < navs.length; i++) {
      const go = navs[i], back = navs[i + 1], then = navs[i + 2]
      if (go.how !== 'push' && go.how !== 'replace') continue
      const pair = `${go.from}\u0000${go.to}`
      arrivals.set(pair, (arrivals.get(pair) ?? 0) + 1)
      if (!back || !isBack(back) || back.to !== go.from || activeMs(back) > threshold || !then) continue
      const retry = then.to === go.to
      const steps = [screenName(go.from), `→ ${screenName(go.to)}`, `↩ ${screenName(go.from)} at once`, `${MARK[then.how] ?? '?'} ${screenName(then.to)}${retry ? ' again' : ''}`]
      const key = `${retry ? 'retry' : 'detour'}\u0000${steps.join('\u0000')}`
      if (!found.has(key)) found.set(key, { kind: retry ? 'retry' : 'detour', steps, pair, count: 0, examples: [] })
      const row = found.get(key)
      row.count++
      if (row.examples.length < 20) row.examples.push({ ...ref(back), last: ref(then) })
    }
  }
  return [...found.values()].map(({ pair, ...row }) => ({ ...row, comparable: arrivals.get(pair) }))
}

// Each showing of a surface (a panel, a sheet, a screen's controls) by what was done with it:
// something used, only closed (at once: within `threshold` of appearing, or later), or nothing.
// With what brought it up, when a pick did.
export function showings(events, threshold = 3000) {
  const surfaces = new Map()
  const groups = new Map()
  for (const event of [...events].sort(byTime)) {
    if (event.type === 'offer' && !event.group) groups.set(event.id, { surface: event.surface, at: event.at, by: event.by ?? null, picks: [], offer: event })
    if (event.type === 'pick' && event.group && groups.has(event.group)) groups.get(event.group).picks.push(event)
  }
  for (const showing of groups.values()) {
    if (!surfaces.has(showing.surface)) surfaces.set(showing.surface, { surface: showing.surface, showings: 0, used: 0, closedAtOnce: 0, closedLater: 0, nothing: 0, by: {}, examples: { closedAtOnce: [], nothing: [], used: [] } })
    const row = surfaces.get(showing.surface)
    row.showings++
    const by = showing.by ?? 'came up by itself'
    row.by[by] = (row.by[by] ?? 0) + 1
    const used = showing.picks.filter(event => !CLOSING.has(event.option))
    const kind = used.length ? 'used' : !showing.picks.length ? 'nothing' : showing.picks[0].at - showing.at <= threshold ? 'closedAtOnce' : 'closedLater'
    row[kind]++
    if (row.examples[kind] && row.examples[kind].length < 20) row.examples[kind].push(ref(showing.offer))
  }
  return [...surfaces.values()]
}

// Screens arrived at and left by Back with nothing done on them: no control used, no outcome.
export function leftUntouched(events) {
  const screens = new Map()
  for (const list of sessionsOf(trackedEvents(events)).values()) {
    list.forEach((event, i) => {
      if (event.type !== 'nav' || event.how === 'back' || event.how === 'open') return
      const rest = list.slice(i + 1), leaving = rest.findIndex(later => later.type === 'nav')
      if (leaving < 0) return
      if (!screens.has(event.to)) screens.set(event.to, { screen: event.to, visits: 0, untouched: 0, examples: [] })
      const row = screens.get(event.to)
      row.visits++
      const next = rest[leaving]
      if (!isBack(next) || rest.slice(0, leaving).some(later => later.type === 'pick' || later.type === 'outcome')) return
      row.untouched++
      if (row.examples.length < 20) row.examples.push({ ...ref(event), last: ref(next) })
    })
  }
  return [...screens.values()]
}

// Everything above as one ranked list of patterns, each a readable sequence of steps with how
// often it happened out of the comparable moments, and examples.
// `least`: how often a pattern must have happened to be listed (a path at least twice).
export function patterns(events, threshold = 3000, { least = 1, longest = 4 } = {}) {
  const rows = []
  for (const p of backtracks(trackedEvents(events), threshold)) {
    if (!p.backtracked) continue
    rows.push({ kind: 'quick reversal', steps: [screenName(p.from), `${MARK[p.how] ?? '→'} ${screenName(p.to)}`, '↩ Back at once'], count: p.backtracked, comparable: p.arrivals, examples: p.examples })
  }
  rows.push(...detours(events, threshold))
  for (const s of showings(events, threshold)) {
    if (!PANELS.has(s.surface)) continue
    if (s.closedAtOnce) rows.push({ kind: 'panel closed at once', steps: [`${s.surface} appears`, 'closed, nothing used'], count: s.closedAtOnce, comparable: s.showings, examples: s.examples.closedAtOnce })
    if (s.nothing) rows.push({ kind: 'shown, nothing used', steps: [`${s.surface} appears`, 'gone, nothing used'], count: s.nothing, comparable: s.showings, examples: s.examples.nothing })
  }
  for (const s of leftUntouched(events)) {
    if (s.untouched) rows.push({ kind: 'left untouched', steps: [`→ ${screenName(s.screen)}`, 'nothing done', '↩ Back'], count: s.untouched, comparable: s.visits, examples: s.examples })
  }
  for (const t of abandoned(trackedEvents(events))) {
    if (t.abandoned) rows.push({ kind: 'task left', steps: [t.task], count: t.abandoned, comparable: t.started, examples: t.examples, by: t.by })
  }
  rows.push(...waitPatterns(waits(events)))
  rows.push(...paths(events, { least: Math.max(2, least), longest }))
  return rows.filter(row => row.count >= least)
    .map(row => ({ ...row, share: row.comparable ? row.count / row.comparable : null, key: `${row.kind}\u0000${row.steps.join('\u0000')}` }))
    .sort((a, b) => b.count - a.count || (b.share ?? 0) - (a.share ?? 0) || b.steps.length - a.steps.length)
}

// Word lookups as waits (2026-11-27), from their own study events rather than the drawer (which is
// being redesigned): `lookup` (the tap), `explained` (the explanation arriving, even after the
// drawer moved on) and `closed` (how the drawer left the word, when its first meaning showed,
// whether Details was opened, failures), with the drawer's showing (usage offers) for when Details
// became available, and the app's background time (study `app` events) to count foreground time
// only. Each becomes wait events in the usage session it happened in:
//   goal `meaning`: the first meaning shown (the sentence's quick meaning counts);
//   milestone `details`: Details available (Reader lookups, and card lookups once More was asked).
// Left out: Reader lookups before closed events counted the quick meaning (no `v`), whose meaning
// time can be late. A lookup with no closed event has no known outcome (unknown).
export function lookupWaits(lookups = [], events = []) {
  const list = [...lookups].sort((a, b) => a.at - b.at)
  const closed = new Map(), explained = new Map(), background = []
  let since = null
  for (const e of list) {
    if (e.type === 'closed' && e.of) closed.set(e.of, e)
    if (e.type === 'explained' && e.of && !explained.has(e.of)) explained.set(e.of, e)
    if (e.type === 'app') {
      if (e.state === 'active') { if (since !== null) background.push([since, e.at]); since = null }
      else since ??= e.at
    }
  }
  if (since !== null) background.push([since, Infinity])
  const fg = (from, to) => Math.max(0, to - from - background.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, to) - Math.max(a, from)), 0))
  // The usage session each lookup happened in: the last one begun before it.
  const starts = [...sessionsOf(events)].map(([session, evs]) => ({ session, at: evs[0].at })).sort((a, b) => a.at - b.at)
  const sessionAt = at => { let found = null; for (const s of starts) if (s.at <= at + 1000) found = s.session; return found }
  // Drawer showings: their first offer, when Details was first offered in them, and More pressed.
  const showings = []
  const byGroup = new Map()
  for (const e of [...events].sort(byTime)) {
    if (e.surface !== 'reader drawer' && e.surface !== 'study drawer') continue
    if (e.type === 'offer' && !e.group) { const s = { surface: e.surface, at: e.at, id: e.id, detailsAt: null, more: false }; showings.push(s); byGroup.set(e.id, s) }
    const s = byGroup.get(e.type === 'offer' ? groupOf(e) : e.group)
    if (!s) continue
    if (e.type === 'offer' && (e.options ?? []).includes('details') && s.detailsAt === null) s.detailsAt = e.at
    if (e.type === 'pick' && e.option === 'more') s.more = true
  }
  const out = []
  let skipped = 0
  for (const l of list) {
    if (l.type !== 'lookup') continue
    const card = l.glossed !== undefined
    const c = closed.get(l.id), x = explained.get(l.id)
    if (c && !c.v && !card) { skipped++; continue }
    const session = sessionAt(l.at)
    if (!session) continue
    const surface = card ? 'study drawer' : 'reader drawer'
    const showing = showings.find(s => s.surface === surface && s.at >= l.at - 200 && s.at <= l.at + 1500) ?? null
    const base = { type: 'wait', session, seq: -1, source: 'lookup events' }
    const id = `lookup:${l.id}`
    out.push({ ...base, id, at: l.at, state: 'start', surface, what: 'word lookup', goal: 'meaning', ...(l.saved ? { from: 'saved word' } : card ? { from: 'card' } : {}) })
    if (!c) continue
    const reached = []
    if (c.waitMs !== null && c.waitMs !== undefined) {
      const at = l.at + c.waitMs
      reached.push({ milestone: 'meaning', at })
      out.push({ ...base, id: `${id}:meaning`, at, state: 'reached', of: id, milestone: 'meaning', ms: fg(l.at, at), ...(c.shown ? { shown: c.shown } : {}) })
    }
    const detailsAsked = !card || showing?.more || x?.why === 'more'
    if (showing?.detailsAt && showing.detailsAt <= c.at && detailsAsked) {
      // Offered in the same render as the meaning it comes with, a few ms either way: not before it.
      const at = Math.max(showing.detailsAt, reached[0]?.at ?? l.at)
      reached.push({ milestone: 'details', at })
      out.push({ ...base, id: `${id}:details`, at, state: 'reached', of: id, milestone: 'details', ms: fg(l.at, at) })
    }
    // A failure with a meaning already shown (the quick one) is the explanation's, not the meaning's.
    const shown = reached.some(r => r.milestone === 'meaning')
    const failed = c.failed && !shown
    if (failed) out.push({ ...base, id: `${id}:failed`, at: c.at - 1, state: 'failed', of: id, what: 'word lookup', reason: c.failed === 'no meaning' ? 'no meaning to show' : 'lookup failed', ms: null })
    const last = reached[reached.length - 1]
    const how = failed ? 'failed' : { closed: 'closed', 'next word': 'next word', left: 'screen left' }[c.how] ?? c.how
    out.push({
      ...base, id: `${id}:end`, at: c.at, state: 'end', of: id, how, ms: fg(l.at, c.at),
      ...(last ? { after: fg(last.at, c.at) } : {}), reached: reached.map(r => r.milestone), used: c.details ? ['details'] : [],
      // Details: whether it could have been had. An explanation arriving before the drawer left
      // without Details offered means this word had none to show.
      details: !detailsAsked ? 'not asked' : reached.some(r => r.milestone === 'details') ? (c.details ? 'opened' : 'moved on') : c.failed || c.moreFailed ? 'failed' : x && x.at <= c.at ? 'none for this word' : 'left before it could be known',
      ...(x && x.at > c.at && !reached.length ? { arrivedAfter: fg(c.at, x.at) } : {}),
    })
  }
  return { events: out, skipped }
}

// Every wait, from its events (the app's own and the lookups'), by what reached the learner:
//   ready              its goal was reached (shown, or sound started)
//   failed             it couldn't be had
//   left before ready  the learner moved on first: left the screen, cancelled, pressed again…
//   unknown            started, and nothing after: the app was killed or the events lost
export function waits(events) {
  const starts = new Map(), parts = new Map()
  for (const e of [...events].sort(byTime)) {
    if (e.type !== 'wait') continue
    if (e.state === 'start') { starts.set(e.id, e); continue }
    if (!parts.has(e.of)) parts.set(e.of, [])
    parts.get(e.of).push(e)
  }
  return [...starts.values()].map(start => {
    const later = parts.get(start.id) ?? []
    const reached = later.filter(e => e.state === 'reached')
    const failed = later.find(e => e.state === 'failed') ?? null
    const end = later.find(e => e.state === 'end') ?? null
    const ready = reached.find(e => e.milestone === start.goal) ?? null
    const outcome = failed ? 'failed' : ready ? 'ready' : end ? 'left before ready' : 'unknown'
    return {
      id: start.id, session: start.session, at: start.at, surface: start.surface, what: start.what, goal: start.goal, from: start.from ?? null, by: start.by ?? null,
      outcome, readyMs: ready?.ms ?? null, waitedMs: end?.ms ?? null, how: end?.how ?? null, after: end?.after ?? null,
      reached: reached.map(e => ({ milestone: e.milestone, ms: e.ms })), failed: failed?.reason ?? null, details: end?.details ?? null, used: end?.used ?? [],
      start, last: end ?? failed ?? reached[reached.length - 1] ?? start,
    }
  })
}

const pctile = (list, q) => { if (!list.length) return null; const s = [...list].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] }
const example = w => ({ session: w.session, id: w.start.id, last: { session: w.session, id: w.last.id } })

// Each kind of wait: how many there were and what came of them, how long the goal took to show
// (median, 90th percentile, foreground time), and how long people waited before leaving, by how
// they left; for word lookups, what came of Details.
export function waitSummary(list) {
  const rows = new Map()
  for (const w of list) {
    if (!rows.has(w.what)) rows.set(w.what, { what: w.what, goal: w.goal, started: 0, ready: 0, failed: 0, left: 0, unknown: 0, readyMs: [], leftMs: [], leftHow: {}, failedWhy: {}, from: {}, details: {}, examples: { ready: [], failed: [], left: [], unknown: [] } })
    const row = rows.get(w.what)
    row.started++
    const kind = { ready: 'ready', failed: 'failed', 'left before ready': 'left', unknown: 'unknown' }[w.outcome]
    row[kind]++
    if (row.examples[kind].length < 30) row.examples[kind].push(example(w))
    if (w.from) row.from[w.from] = (row.from[w.from] ?? 0) + 1
    if (w.outcome === 'ready' && w.readyMs !== null) row.readyMs.push(w.readyMs)
    if (w.outcome === 'left before ready') { if (w.waitedMs !== null) row.leftMs.push(w.waitedMs); row.leftHow[w.how] = (row.leftHow[w.how] ?? 0) + 1 }
    if (w.outcome === 'failed') row.failedWhy[w.failed] = (row.failedWhy[w.failed] ?? 0) + 1
    if (w.details && w.outcome === 'ready') row.details[w.details] = (row.details[w.details] ?? 0) + 1
  }
  return [...rows.values()].map(row => ({
    ...row, known: row.started - row.unknown,
    readyMedian: pctile(row.readyMs, 0.5), readyP90: pctile(row.readyMs, 0.9), leftMedian: pctile(row.leftMs, 0.5),
  }))
}

// Waits as patterns: left before ready (out of the waits with a known outcome), each way of
// leaving its own row; failures; and, for lookups, Details available and moved on from.
function waitPatterns(list) {
  const rows = new Map()
  const add = (kind, steps, w, comparable) => {
    const key = `${kind}\u0000${steps.join('\u0000')}`
    if (!rows.has(key)) rows.set(key, { kind, steps, count: 0, comparable, examples: [], waited: [] })
    const row = rows.get(key)
    row.count++
    if (row.examples.length < 20) row.examples.push(example(w))
    if (w.waitedMs !== null) row.waited.push(w.waitedMs)
  }
  const known = {}, detailsShown = {}
  for (const w of list) {
    if (w.outcome !== 'unknown') known[w.what] = (known[w.what] ?? 0) + 1
    if (w.reached.some(r => r.milestone === 'details')) detailsShown[w.what] = (detailsShown[w.what] ?? 0) + 1
  }
  for (const w of list) {
    const asked = `${w.what}${w.from ? ` (${w.from})` : ''}`
    if (w.outcome === 'left before ready') add('left before ready', [asked, `waiting for ${w.goal}`, `${w.how} before it showed`], w, known[w.what])
    if (w.outcome === 'failed') add('failed while waiting', [asked, `failed: ${w.failed}`], w, known[w.what])
    if (w.details === 'moved on') add('available, moved on', [`${w.what}: meaning shown`, 'Details available', `${w.how}, Details not opened`], w, detailsShown[w.what])
  }
  return [...rows.values()].map(({ waited, ...row }) => ({ ...row, by: waited.length ? { 'median wait before leaving': `${seconds(pctile(waited, 0.5))}` } : undefined }))
}

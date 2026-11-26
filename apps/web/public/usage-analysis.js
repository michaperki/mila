// Usage analysis (2026-11-26): what the Usage view (/debug.html → Usage) shows, worked out from
// usage events (apps/mobile/src/lib/usage.ts) alone. Pure: events in, tables out, so it is tested
// (tests/usage-analysis.test.ts) and the viewer only draws.
//
// An event: { id, session, seq, at, type: 'nav' | 'offer' | 'pick' | 'outcome', ... }.
//   nav     { to, from, how: 'open' | 'push' | 'back' | 'replace', popped?, ms?, away?, after? }
//   offer   { surface, options, group? }   the first offer of a showing has no group: its id is it
//   pick    { surface, option, group, value? }
//   outcome { surface, outcome }

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
  for (const list of sessions.values()) list.sort((a, b) => a.seq - b.seq)
  return sessions
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
  return event.type
}

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
  rows.push(...paths(events, { least: Math.max(2, least), longest }))
  return rows.filter(row => row.count >= least)
    .map(row => ({ ...row, share: row.comparable ? row.count / row.comparable : null, key: `${row.kind}\u0000${row.steps.join('\u0000')}` }))
    .sort((a, b) => b.count - a.count || (b.share ?? 0) - (a.share ?? 0) || b.steps.length - a.steps.length)
}

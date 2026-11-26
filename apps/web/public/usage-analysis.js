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
// Kept here so the view can say "not tracked" rather than show a zero.
export const COVERAGE = [
  { surface: 'screens', what: 'Every screen change in the app: where from, how (push, Back, replace), time on the screen before', since: '2026-11-26' },
  { surface: 'home', what: 'Read, Library, Study, Your words, Account', since: '2026-11-26' },
  { surface: 'read', what: 'Home → Read sheet: starters, photo, paste, continue, dismiss', since: '2026-11-26' },
  { surface: 'camera', what: 'Capture, choose a photo, paste, live, about, read this passage, cancel; outcomes: opened reader, no text, read failed', since: '2026-11-26' },
  { surface: 'reader', what: 'Toolbar: English, cursive, vowels, text size; save passage, remove from library', since: '2026-11-26' },
  { surface: 'sentence bar', what: 'Previous, next, listen, done', since: '2026-11-26' },
  { surface: 'reader drawer', what: 'Close, listen, Details, save / undo, in your words, pick a word, save just the word, save the pattern, study now', since: '2026-11-26' },
  { surface: 'study card', what: 'Top bar: done, previous, next, new round, settings, why (answers are in study events)', since: '2026-11-26' },
  { surface: 'study drawer', what: 'A word tapped on a card: as the reader drawer, plus More', since: '2026-11-26' },
  { surface: 'study settings', what: 'Each setting, new sentences, cursive answers, close', since: '2026-11-26' },
  { surface: 'study welcome back', what: 'Continue, new round', since: '2026-11-26' },
  { surface: 'study end', what: 'Back to your tree, another round, new sentences', since: '2026-11-26' },
  { surface: 'your words', what: 'Study, search, status filter, theme, open a word', since: '2026-11-26' },
]
export const NOT_TRACKED = 'Controls on Library, a word’s page, All forms, Root, Account, Learning Insights, Paste text and Import (their screens are tracked); swipes and answers on cards; taps on words (those are lookups in study events).'

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
  const rows = new Map(), offered = new Map()
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
      if (!rows.has(choice)) rows.set(choice, { choice, chosen: 0, read: 0, examples: [] })
      const row = rows.get(choice)
      row.chosen++
      if (pick) {
        // Read: the reader opened before Home was arrived at again.
        let read = false
        for (const later of list.slice(pick.i + 1)) {
          if (later.type !== 'nav') continue
          if (later.to === 'reader') { read = true; break }
          if (later.to === 'index') break
        }
        if (read) row.read++
        if (row.examples.length < 20) row.examples.push(ref(pick.event))
      }
    }
  }
  return { showings, offered: Object.fromEntries(offered), rows: [...rows.values()].sort((a, b) => b.chosen - a.chosen) }
}

// Tasks started and not finished: a camera visit (arrived at by push or replace) with no passage
// opened before it was left, by what happened last; Paste text left without reading.
export function abandoned(events) {
  const tasks = [
    { task: 'Camera visit ended without a passage', screen: 'camera', done: (_visit, next) => next?.to === 'reader' || next?.to === 'compose' },
    { task: 'Paste text left without reading', screen: 'compose', done: (_visit, next) => next?.to === 'reader' },
  ]
  return tasks.map(({ task, screen, done }) => {
    const row = { task, screen, started: 0, abandoned: 0, by: {}, examples: [] }
    for (const list of sessionsOf(events).values()) {
      list.forEach((event, i) => {
        if (event.type !== 'nav' || event.to !== screen || event.how === 'back') return
        const rest = list.slice(i + 1)
        const leaving = rest.findIndex(later => later.type === 'nav')
        const during = leaving < 0 ? rest : rest.slice(0, leaving)
        const next = leaving < 0 ? null : rest[leaving]
        if (!next) return
        row.started++
        if (done(event, next)) return
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
  if (event.type === 'nav') return `${event.from ?? '—'} → ${event.to} · ${label(event)}${event.ms !== undefined ? ` · ${(activeMs(event) / 1000).toFixed(1)} s on ${event.from}` : ''}${event.away ? ` (${Math.round(event.away / 1000)} s away)` : ''}`
  if (event.type === 'offer') return `${event.surface} shows ${(event.options ?? []).join(', ')}`
  if (event.type === 'pick') return `${event.surface}: ${event.option}${event.value !== undefined ? ` = ${event.value}` : ''}`
  if (event.type === 'outcome') return `${event.surface}: ${event.outcome}`
  return event.type
}

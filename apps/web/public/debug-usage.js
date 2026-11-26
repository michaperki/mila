// The Usage view of /debug.html (DEBUG-2, 2026-11-26): how Mila is used, from the always-on usage
// events (apps/mobile/src/lib/usage.ts, read through debug-trace ?usage). Worked out in
// usage-analysis.js; this only draws it. Left, top to bottom:
//   - when tracking began, what it covers, and a check of the screen changes against where
//     surfaces appeared (v1 sessions, whose screen changes weren't recorded, are left out of
//     everything worked out from them);
//   - patterns, ranked by how often they happened, each as a sequence of steps with its share of
//     the comparable visits: quick reversals, detours and retries, panels closed at once or left
//     unused, screens left untouched, tasks left, and recurring paths;
//   - panels by what was done with them, controls by use out of the showings that offered them,
//     panels scrolled into view, backtracks, the Read sheet and unfinished tasks.
// Right: an example's session as it was recorded, around the moment.
// Uses the page's own api, $ and esc (debug.html).
import {
  abandoned, activeMs, around, backtracks, COVERAGE, describe, features, navCheck, NOT_TRACKED, patterns, readSheet, screenName, showings, trackedEvents,
} from './usage-analysis.js'

const PREFS = 'milaUsagePrefs'
const read = () => { try { return JSON.parse(localStorage.getItem(PREFS) || '{}') } catch { return {} } }
const prefs = { days: 30, threshold: 3, sort: 'uses', surface: '', least: 1, kind: '', ...read() }
const keep = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)) } catch { /* this visit only */ } }
let data = null, loadedDays = null, chosen = null
const pct = share => (share === null || share === undefined ? '–' : `${Math.round(share * 100)}%`)
const meter = share => `<span class="meter"><i style="width:${Math.round((share ?? 0) * 100)}%"></i></span>`
const when = at => (at ? new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '–')
const secs = ms => `${(ms / 1000).toFixed(1)} s`
const median = list => { if (!list.length) return null; const s = [...list].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const counts = map => Object.entries(map).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(k)} ${n}`).join(' · ')
// A pattern's steps as chips: Back in red, explicit actions in green, screens plain.
const chips = steps => `<span class="chips">${steps.map(step => `<span class="step ${/^↩/.test(step) ? 'back' : /: /.test(step) ? 'pick' : ''}">${esc(step)}</span>`).join('<span class="sep">›</span>')}</span>`
const KINDS = ['quick reversal', 'detour', 'retry', 'panel closed at once', 'shown, nothing used', 'left untouched', 'task left', 'path']

window.showUsage = async (force) => {
  if (!data || force || loadedDays !== prefs.days) {
    $('usageMain').innerHTML = '<p class="muted">Loading…</p>'
    try { data = await api(`debug-trace?usage=${prefs.days}`); loadedDays = prefs.days } catch (error) { $('usageMain').innerHTML = `<p style="color:var(--red)">${esc(error.message)}</p>`; return }
  }
  draw()
}

function draw() {
  const events = data.events
  const tracked = trackedEvents(events)
  const threshold = prefs.threshold * 1000
  const check = navCheck(events)
  const surfaces = features(events)
  const seenSurface = new Map(surfaces.map(s => [s.surface, s]))
  let rows = surfaces.flatMap(s => s.options).filter(o => !prefs.surface || o.surface === prefs.surface)
  rows = rows.sort(prefs.sort === 'share'
    ? (a, b) => (a.share ?? 2) - (b.share ?? 2) || b.offered - a.offered
    : (a, b) => a.uses - b.uses || b.offered - a.offered)
  const found = patterns(events, threshold, { least: prefs.least }).filter(p => !prefs.kind || p.kind === prefs.kind)
  const shown = found.slice(0, 80)
  const panels = showings(events, threshold).sort((a, b) => b.showings - a.showings)
  const back = backtracks(tracked, threshold).filter(p => p.arrivals).sort((a, b) => b.backtracked - a.backtracked || (b.backtracked / b.arrivals) - (a.backtracked / a.arrivals) || b.arrivals - a.arrivals)
  const sheet = readSheet(events)
  const tasks = abandoned(tracked)
  // Panels scrolled into view, each out of the visits to the screen they are on.
  const seenRows = [...events.filter(e => e.type === 'seen').reduce((map, e) => map.set(`${e.surface}|${e.panel}`, { surface: e.surface, panel: e.panel, n: (map.get(`${e.surface}|${e.panel}`)?.n ?? 0) + 1 }), new Map()).values()]
  const healthy = check.tracked > 0 && check.disagreeing === 0 && !(check.byHow.unknown > 0)

  $('usageMain').innerHTML = `
  <div class="u-bar">
    <label>Period <select id="uDays">${[7, 30, 90, 365].map(d => `<option value="${d}" ${d === prefs.days ? 'selected' : ''}>last ${d} days</option>`).join('')}</select></label>
    <label>“At once”: within <input id="uThreshold" type="number" min="0.5" max="120" step="0.5" value="${prefs.threshold}"> s</label>
    <label>Patterns seen at least <input id="uLeast" type="number" min="1" max="50" step="1" value="${prefs.least}"> times</label>
    <label>Kind <select id="uKind"><option value="">all</option>${KINDS.map(k => `<option ${k === prefs.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
    <button id="uRefresh">Refresh</button>
  </div>

  <div class="u-coverage">
    <div><strong>Tracking began ${when(data.began)}</strong>${data.began ? '' : ' (no usage events yet: use Mila Preview signed in with this account)'} ·
      showing ${new Date(Math.max(data.since, data.began ?? data.since)).toLocaleDateString()} to now · ${events.length} events · ${check.sessions} app sessions</div>
    <details><summary>What is tracked, and since when (a control not listed here isn’t tracked, so it can’t show as zero)</summary>
      <table class="u" style="margin-top:6px"><tr><th>Surface</th><th>What</th><th>Since</th><th>First seen here</th></tr>
      ${COVERAGE.map(c => `<tr><td>${esc(c.surface)}</td><td>${esc(c.what)}</td><td>${c.since}</td><td>${c.surface === 'screens' ? when(check.first) : seenSurface.has(c.surface) ? when(seenSurface.get(c.surface).first) : '<span class="muted">not seen in this period</span>'}</td></tr>`).join('')}
      </table><p class="muted">Not tracked yet: ${esc(NOT_TRACKED)}<br>A control counts as offered only while it can be used: hidden or disabled (Continue with nothing to continue, Capture before the camera is ready, Previous on the first card) it isn’t a chance to use it.</p></details>
  </div>

  <div class="u-coverage ${healthy ? 'u-ok' : 'u-warn'}">
    <strong>Screen changes: ${check.tracked ? (healthy ? 'consistent' : 'check these') : 'none recorded by the fixed tracker yet'}</strong>
    <div class="muted" style="margin-top:4px">
      ${check.navs} screen changes in ${check.tracked} of ${check.sessions} sessions (${counts(check.byHow) || 'none'}).
      ${check.untracked ? `${check.untracked} earlier ${check.untracked === 1 ? 'session was' : 'sessions were'} recorded by the v1 tracker, which saw only the launch: ${check.untracked === 1 ? 'it is' : 'they are'} left out of everything worked out from screen changes (patterns, backtracks, tasks, what led to reading), and counted in controls only.` : ''}
      Of ${check.checked} surfaces appearing, ${check.agree} were on the screen the last screen change arrived at${check.disagreeing ? `, <span class="zero">${check.disagreeing} weren’t</span> (a missed or wrong screen change: <a href="#" id="uDisagree">see them</a>)` : ''}.
      ${check.byHow.unknown ? `<span class="zero">${check.byHow.unknown} unknown</span> (the stacks both lost and gained screens: <a href="#" id="uUnknown">see them</a>).` : 'None unknown.'}
    </div>
  </div>

  <div class="u-section">
    <h2>Patterns, most frequent first</h2>
    <div class="note">Sequences found in every session with screen changes, not only the ones looked for: Back within ${prefs.threshold} s of arriving (quick reversal), straight back and then elsewhere (detour) or the same place again (retry), a panel or sheet closed without using it within ${prefs.threshold} s or gone with nothing used, a screen left by Back with nothing done, a task left, and any run of 2–4 steps seen at least ${Math.max(2, prefs.least)} times (path). “Of” is the comparable visits: arrivals for a reversal or detour, showings for a panel, visits for a screen, starts for a task, and for a path the times its first step happened. Click a row for its examples.</div>
    <table class="u"><tr><th>Kind</th><th>Pattern</th><th class="num">Times</th><th class="num">Of</th><th class="num">Share</th></tr>
    ${shown.map((p, i) => `<tr class="click ${chosen?.kind === 'pattern' && chosen.key === p.key ? 'on' : ''}" data-pattern="${i}"><td class="kind">${esc(p.kind)}</td><td>${chips(p.steps)}${p.by ? `<div class="muted" style="font-size:11px">${counts(p.by)}</div>` : ''}</td>
      <td class="num">${p.count}</td><td class="num muted">${p.comparable ?? '–'}</td><td class="num">${pct(p.share)}${meter(p.share)}</td></tr>`).join('') || `<tr><td colspan="5" class="muted">${check.tracked ? 'No patterns yet at this count.' : 'Patterns need screen changes from the fixed tracker: use Mila Preview after the update.'}</td></tr>`}
    </table>${found.length > shown.length ? `<p class="muted">${found.length - shown.length} more below this count; filter by kind or raise “at least” to narrow.</p>` : ''}
  </div>

  <div class="u-section">
    <h2>Panels and sheets: what was done with each showing</h2>
    <div class="note">A showing is a surface appearing (a drawer per lookup, a sheet each time it opened, a screen’s controls each visit). Appearing is not an action: “used” means a control in it was pressed. “Brought up by” is the control pressed just before it appeared.</div>
    <table class="u"><tr><th>Surface</th><th class="num">Showings</th><th class="num">Used</th><th class="num">Closed at once</th><th class="num">Closed later</th><th class="num">Nothing</th><th>Brought up by</th></tr>
    ${panels.map((s, i) => `<tr class="click ${chosen?.kind === 'panel' && chosen.key === s.surface ? 'on' : ''}" data-panel="${i}"><td>${esc(s.surface)}</td><td class="num">${s.showings}</td>
      <td class="num">${s.used} <span class="muted">${pct(s.used / s.showings)}</span></td><td class="num">${s.closedAtOnce}</td><td class="num">${s.closedLater}</td><td class="num">${s.nothing}</td>
      <td class="muted">${counts(s.by)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nothing shown in this period.</td></tr>'}
    </table>
    ${seenRows.length ? `<div class="note" style="margin-top:8px">Panels scrolled into view (on screen, not acted on): ${seenRows.map(r => `${esc(r.surface)} · ${esc(r.panel)} in ${r.n} of ${seenSurface.get(r.surface)?.showings ?? '?'} visits`).join(' · ')}</div>` : ''}
  </div>

  <div class="u-section">
    <h2>Controls, rarely used first</h2>
    <div class="note">Each control out of the showings where it could be used. “Used in” counts showings; “uses” counts presses. Click a row for showings where it was used, or offered and not used.
      <label style="margin-left:8px">Sort <select id="uSort"><option value="uses" ${prefs.sort === 'uses' ? 'selected' : ''}>uses, fewest first</option><option value="share" ${prefs.sort === 'share' ? 'selected' : ''}>share of showings, lowest first</option></select></label>
      <label style="margin-left:8px">Surface <select id="uSurface"><option value="">all</option>${surfaces.map(s => `<option ${s.surface === prefs.surface ? 'selected' : ''}>${esc(s.surface)}</option>`).join('')}</select></label></div>
    <table class="u"><tr><th>Surface</th><th>Control</th><th class="num">Used in</th><th class="num">Share</th><th class="num">Uses</th><th>Values</th><th>Last used</th></tr>
    ${rows.map((o, i) => `<tr class="click ${chosen?.kind === 'feature' && chosen.key === o.surface + '|' + o.option ? 'on' : ''}" data-feature="${i}">
      <td>${esc(o.surface)}</td><td>${esc(o.option)}</td>
      <td class="num ${o.usedIn === 0 ? 'zero' : ''}">${o.usedIn} of ${o.offered}</td><td class="num">${pct(o.share)}${meter(o.share)}</td><td class="num">${o.uses}${o.unoffered ? ` <span class="muted" title="Presses not tied to a showing that offered it">(${o.unoffered} untied)</span>` : ''}</td>
      <td class="muted">${counts(o.values)}</td><td class="muted">${when(o.lastUsed)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No controls recorded in this period.</td></tr>'}
    </table>
  </div>

  <div class="u-section">
    <h2>Backtracks: Back pressed within ${prefs.threshold} s of arriving</h2>
    <div class="note">Every way a screen was arrived at (from → to · how), how many arrivals there were, and how many were left by Back within the cutoff (time with Mila in the foreground). A screen change a control made (Done, Back to your tree) isn’t Back. Click a row for every arrival’s time.</div>
    <table class="u"><tr><th>Arrived</th><th class="num">Backed out</th><th class="num">Share</th><th class="num">Median time there</th></tr>
    ${back.map((p, i) => `<tr class="click ${chosen?.kind === 'back' && chosen.key === p.key ? 'on' : ''}" data-back="${i}"><td>${esc(screenName(p.from))} → <strong>${esc(screenName(p.to))}</strong> · ${esc(p.how)}</td>
      <td class="num">${p.backtracked} of ${p.arrivals}</td><td class="num">${pct(p.backtracked / p.arrivals)}${meter(p.backtracked / p.arrivals)}</td>
      <td class="num muted">${p.times.length ? secs(median(p.times.map(t => t.ms))) : '–'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No screen changes in this period.</td></tr>'}
    </table>
  </div>

  <div class="u-section">
    <h2>Home → Read</h2>
    <div class="note">The sheet was open ${sheet.showings} ${sheet.showings === 1 ? 'time' : 'times'}. Offered: ${counts(sheet.offered) || '–'}. “Led to reading”: the reader opened before Home came back, out of the choices made where screen changes were recorded.</div>
    <table class="u"><tr><th>Choice</th><th class="num">Chosen</th><th class="num">Share of openings</th><th class="num">Led to reading</th></tr>
    ${sheet.rows.map((r, i) => `<tr class="click ${chosen?.kind === 'read' && chosen.key === r.choice ? 'on' : ''}" data-read="${i}"><td>${esc(r.choice)}</td><td class="num">${r.chosen}</td>
      <td class="num">${pct(r.chosen / sheet.showings)}${meter(r.chosen / sheet.showings)}</td><td class="num">${r.choice === 'dismiss' || r.choice === 'nothing recorded' ? '–' : r.checked ? `${r.read} of ${r.checked}` : '<span class="muted">not known (v1)</span>'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Not opened in this period.</td></tr>'}
    </table>
  </div>

  <div class="u-section">
    <h2>Tasks left unfinished</h2>
    <div class="note">A task started on a screen (not one returned to by Back) and left before it was done, by what happened last on it.</div>
    <table class="u"><tr><th>Task</th><th class="num">Left unfinished</th><th class="num">Share</th><th>By what happened last</th></tr>
    ${tasks.map((t, i) => `<tr class="click ${chosen?.kind === 'task' && chosen.key === t.task ? 'on' : ''}" data-task="${i}"><td>${esc(t.task)}</td><td class="num">${t.abandoned} of ${t.started}</td>
      <td class="num">${t.started ? pct(t.abandoned / t.started) : '–'}${meter(t.started ? t.abandoned / t.started : 0)}</td><td class="muted">${counts(t.by) || '–'}</td></tr>`).join('')}
    </table>
  </div>`

  $('uDays').onchange = () => { prefs.days = Number($('uDays').value); keep(); chosen = null; void window.showUsage() }
  $('uThreshold').onchange = () => { const v = Number($('uThreshold').value); if (v > 0) { prefs.threshold = v; keep(); draw() } }
  $('uLeast').onchange = () => { const v = Math.round(Number($('uLeast').value)); if (v >= 1) { prefs.least = v; keep(); draw() } }
  $('uKind').onchange = () => { prefs.kind = $('uKind').value; keep(); draw() }
  $('uSort').onchange = () => { prefs.sort = $('uSort').value; keep(); draw() }
  $('uSurface').onchange = () => { prefs.surface = $('uSurface').value; keep(); draw() }
  $('uRefresh').onclick = () => void window.showUsage(true)
  if ($('uDisagree')) $('uDisagree').onclick = event => { event.preventDefault(); choose({ kind: 'check', key: 'disagree', item: { title: 'Surfaces appearing on another screen than the last screen change', examples: check.disagree, notes: check.disagree.map(d => `${d.surface} appeared while the last screen change said ${screenName(d.screen)} (expected ${screenName(d.expected)})`) } }) }
  if ($('uUnknown')) $('uUnknown').onclick = event => { event.preventDefault(); choose({ kind: 'check', key: 'unknown', item: { title: 'Unknown screen changes', examples: check.unknown } }) }
  const bind = (attr, list, kind, keyOf) => { for (const tr of $('usageMain').querySelectorAll(`[data-${attr}]`)) tr.onclick = () => { const item = list[tr.dataset[attr]]; choose({ kind, key: keyOf(item), item }) } }
  bind('pattern', shown, 'pattern', p => p.key)
  bind('panel', panels, 'panel', s => s.surface)
  bind('feature', rows, 'feature', o => `${o.surface}|${o.option}`)
  bind('back', back, 'back', p => p.key)
  bind('read', sheet.rows, 'read', r => r.choice)
  bind('task', tasks, 'task', t => t.task)
  // A row chosen before a redraw (another cutoff, sort) stays chosen, with its numbers redone.
  if (chosen) {
    const again = chosen.kind === 'pattern' ? found.find(p => p.key === chosen.key)
      : chosen.kind === 'panel' ? panels.find(s => s.surface === chosen.key)
        : chosen.kind === 'feature' ? surfaces.flatMap(s => s.options).find(o => `${o.surface}|${o.option}` === chosen.key)
          : chosen.kind === 'back' ? back.find(p => p.key === chosen.key) : chosen.kind === 'read' ? sheet.rows.find(r => r.choice === chosen.key)
            : chosen.kind === 'task' ? tasks.find(t => t.task === chosen.key) : chosen.item
    if (again) { chosen.item = again; side() } else { chosen = null; $('usageSide').innerHTML = '' }
  } else if (!$('usageSide').innerHTML) $('usageSide').innerHTML = '<p class="muted">Click a row to see examples: the session as recorded, around the moment.</p>'
}

function choose(next) { chosen = { ...next, example: 0, list: null }; draw() }

// The examples a row has, each a moment in a session (and, for a sequence, where it ended).
function examplesOf() {
  const { kind, item } = chosen
  if (kind === 'feature') return chosen.list === 'missed'
    ? item.missed.map(group => { const offer = data.events.find(e => e.type === 'offer' && (e.group ?? e.id) === group); return offer ? { session: offer.session, id: offer.id } : null }).filter(Boolean)
    : item.examples
  if (kind === 'panel') return item.examples[chosen.list ?? 'closedAtOnce'] ?? []
  if (kind === 'back') return chosen.list === 'all' ? item.times : item.examples
  return item.examples
}

function side() {
  const { kind, item } = chosen
  const examples = examplesOf()
  const index = Math.min(chosen.example, Math.max(0, examples.length - 1))
  const example = examples[index]
  let head = ''
  if (kind === 'pattern') head = `<h2>${esc(item.kind)}</h2><p>${chips(item.steps)}</p><p>${item.count} times${item.comparable ? ` of ${item.comparable} (${pct(item.share)})` : ''}.${item.by ? ` ${counts(item.by)}.` : ''}</p>`
  if (kind === 'panel') head = `<h2>${esc(item.surface)}</h2><p>${item.showings} showings: ${item.used} used, ${item.closedAtOnce} closed at once, ${item.closedLater} closed later, ${item.nothing} with nothing pressed.</p>
    <p>${['closedAtOnce', 'nothing', 'used'].map(list => `<button class="mode ${(chosen.list ?? 'closedAtOnce') === list ? 'on' : ''}" data-list="${list}">${{ closedAtOnce: 'Closed at once', nothing: 'Nothing pressed', used: 'Used' }[list]} (${item.examples[list].length})</button>`).join(' ')}</p>`
  if (kind === 'feature') head = `<h2>${esc(item.surface)} · ${esc(item.option)}</h2><p>Used in ${item.usedIn} of ${item.offered} showings (${pct(item.share)}), ${item.uses} presses. First offered ${when(item.firstOffered)}.</p>
    <p><button class="mode ${chosen.list !== 'missed' ? 'on' : ''}" data-list="used">Where it was used (${item.examples.length})</button> <button class="mode ${chosen.list === 'missed' ? 'on' : ''}" data-list="missed">Offered, not used (latest ${item.missed.length})</button></p>`
  if (kind === 'back') head = `<h2>${esc(screenName(item.from))} → ${esc(screenName(item.to))} · ${esc(item.how)}</h2><p>${item.backtracked} of ${item.arrivals} arrivals were left by Back within ${prefs.threshold} s.</p>
    <p class="muted">Time on ${esc(screenName(item.to))} before leaving, every arrival (red: Back within the cutoff; grey: left another way). Click one to see it.</p>
    <div class="times">${item.times.map((t, i) => `<span class="${t.back && t.ms <= prefs.threshold * 1000 ? 'hit' : t.back ? '' : 'other'}" data-time="${i}" title="${t.back ? 'Back' : 'not Back'}">${secs(t.ms)}</span>`).join('') || '<span class="other">none left yet</span>'}</div>`
  if (kind === 'read') head = `<h2>Read sheet · ${esc(item.choice)}</h2><p>Chosen ${item.chosen} times${item.choice === 'dismiss' ? '' : `, ${item.read} of ${item.checked} led to reading`}.</p>`
  if (kind === 'task') head = `<h2>${esc(item.task)}</h2><p>${item.abandoned} of ${item.started}. ${counts(item.by)}</p>`
  if (kind === 'check') head = `<h2>${esc(item.title)}</h2>${item.notes?.[index] ? `<p>${esc(item.notes[index])}</p>` : ''}`
  let body = '<p class="muted">No examples.</p>'
  if (example) {
    const { list, at } = around(data.events, example.session, example.id, 12, 16)
    const t0 = at?.at ?? list[0]?.at ?? 0
    const from = list.findIndex(e => e.id === example.id), to = example.last ? list.findIndex(e => e.id === example.last.id) : from
    body = `<p><button id="uPrev" ${index <= 0 ? 'disabled' : ''}>‹</button> Example ${index + 1} of ${examples.length} <button id="uNext" ${index >= examples.length - 1 ? 'disabled' : ''}>›</button>
      <span class="muted">${when(at?.at)}</span></p>
      <p class="muted" style="font-size:11px">Grey rows are things appearing (a panel, its controls); the rest are screen changes and actions. The moment is highlighted${example.last ? ', through where the sequence ends' : ''}.</p>
      <div class="seq">${list.map((e, i) => `<div class="ev ${e.id === example.id ? 'here' : i > from && i <= to ? 'span' : ''} ${e.type === 'offer' || e.type === 'seen' ? 'appear' : ''}"><span class="t">${e.at - t0 >= 0 ? '+' : '−'}${secs(Math.abs(e.at - t0))}</span><span class="k">${e.type}</span><span>${esc(describe(e))}${e.type === 'nav' && e.how === 'back' && !e.after && activeMs(e) <= prefs.threshold * 1000 ? ' <span class="zero">at once</span>' : ''}</span></div>`).join('')}</div>`
  }
  $('usageSide').innerHTML = head + body
  for (const b of $('usageSide').querySelectorAll('[data-list]')) b.onclick = () => { chosen.list = b.dataset.list; chosen.example = 0; side() }
  for (const s of $('usageSide').querySelectorAll('[data-time]')) s.onclick = () => { chosen.list = 'all'; chosen.example = Number(s.dataset.time); side() }
  if ($('uPrev')) $('uPrev').onclick = () => { chosen.example = index - 1; side() }
  if ($('uNext')) $('uNext').onclick = () => { chosen.example = index + 1; side() }
}

// The Usage view of /debug.html (2026-11-26): how Mila is used, from the always-on usage events
// (apps/mobile/src/lib/usage.ts, read through debug-trace ?usage). Worked out in
// usage-analysis.js; this only draws it. Left: when tracking began and what it covers, controls
// by how much they are used (each out of the showings that offered it), Back pressed again soon
// after arriving (each out of every arrival of that kind), the Read sheet's choices, and tasks
// left unfinished. Right: an example's session as it was recorded, around the moment.
// Uses the page's own api, $ and esc (debug.html).
import { abandoned, activeMs, around, backtracks, COVERAGE, describe, features, NOT_TRACKED, readSheet } from './usage-analysis.js'

const PREFS = 'milaUsagePrefs'
const read = () => { try { return JSON.parse(localStorage.getItem(PREFS) || '{}') } catch { return {} } }
const prefs = { days: 30, threshold: 3, sort: 'uses', surface: '', ...read() }
const keep = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)) } catch { /* this visit only */ } }
let data = null, loadedDays = null, chosen = null
const pct = share => (share === null || share === undefined ? '–' : `${Math.round(share * 100)}%`)
const meter = share => `<span class="meter"><i style="width:${Math.round((share ?? 0) * 100)}%"></i></span>`
const when = at => (at ? new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '–')
const secs = ms => `${(ms / 1000).toFixed(1)} s`
const median = list => { if (!list.length) return null; const s = [...list].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

window.showUsage = async (force) => {
  if (!data || force || loadedDays !== prefs.days) {
    $('usageMain').innerHTML = '<p class="muted">Loading…</p>'
    try { data = await api(`debug-trace?usage=${prefs.days}`); loadedDays = prefs.days } catch (error) { $('usageMain').innerHTML = `<p style="color:var(--red)">${esc(error.message)}</p>`; return }
  }
  draw()
}

function draw() {
  const events = data.events
  const sessions = new Set(events.map(e => e.session)).size
  const threshold = prefs.threshold * 1000
  const surfaces = features(events)
  const seen = new Map(surfaces.map(s => [s.surface, s]))
  const navs = events.filter(e => e.type === 'nav')
  let rows = surfaces.flatMap(s => s.options).filter(o => !prefs.surface || o.surface === prefs.surface)
  rows = rows.sort(prefs.sort === 'share'
    ? (a, b) => (a.share ?? 2) - (b.share ?? 2) || b.offered - a.offered
    : (a, b) => a.uses - b.uses || b.offered - a.offered)
  const back = backtracks(events, threshold).filter(p => p.arrivals).sort((a, b) => b.backtracked - a.backtracked || (b.backtracked / b.arrivals) - (a.backtracked / a.arrivals) || b.arrivals - a.arrivals)
  const sheet = readSheet(events)
  const tasks = abandoned(events)

  $('usageMain').innerHTML = `
  <div class="u-bar">
    <label>Period <select id="uDays">${[7, 30, 90, 365].map(d => `<option value="${d}" ${d === prefs.days ? 'selected' : ''}>last ${d} days</option>`).join('')}</select></label>
    <label>Backtrack: Back within <input id="uThreshold" type="number" min="0.5" max="120" step="0.5" value="${prefs.threshold}"> s of arriving</label>
    <label>Sort controls by <select id="uSort"><option value="uses" ${prefs.sort === 'uses' ? 'selected' : ''}>uses, fewest first</option><option value="share" ${prefs.sort === 'share' ? 'selected' : ''}>share of showings, lowest first</option></select></label>
    <label>Surface <select id="uSurface"><option value="">all</option>${surfaces.map(s => `<option ${s.surface === prefs.surface ? 'selected' : ''}>${esc(s.surface)}</option>`).join('')}</select></label>
    <button id="uRefresh">Refresh</button>
  </div>

  <div class="u-coverage">
    <div><strong>Tracking began ${when(data.began)}</strong>${data.began ? '' : ' (no usage events yet: use Mila Preview signed in with this account)'} ·
      showing ${new Date(Math.max(data.since, data.began ?? data.since)).toLocaleDateString()} to now · ${events.length} events · ${sessions} app sessions · ${navs.length} screen changes</div>
    <details><summary>What is tracked, and since when (a control not listed here isn’t tracked, so it can’t show as zero)</summary>
      <table class="u" style="margin-top:6px"><tr><th>Surface</th><th>What</th><th>Since</th><th>First seen here</th></tr>
      ${COVERAGE.map(c => `<tr><td>${esc(c.surface)}</td><td>${esc(c.what)}</td><td>${c.since}</td><td>${c.surface === 'screens' ? when(navs[0]?.at) : seen.has(c.surface) ? when(seen.get(c.surface).first) : '<span class="muted">not seen in this period</span>'}</td></tr>`).join('')}
      </table><p class="muted">Not tracked yet: ${esc(NOT_TRACKED)}</p></details>
  </div>

  <div class="u-section">
    <h2>Controls, rarely used first</h2>
    <div class="note">Each control out of the showings that offered it (a drawer per lookup, a sheet each time it opened, a screen each visit). “Used in” counts showings; “uses” counts presses. Click a row for showings where it was used, or offered and not used.</div>
    <table class="u"><tr><th>Surface</th><th>Control</th><th class="num">Used in</th><th class="num">Share</th><th class="num">Uses</th><th>Values</th><th>Last used</th></tr>
    ${rows.map((o, i) => `<tr class="click ${chosen?.kind === 'feature' && chosen.key === o.surface + '|' + o.option ? 'on' : ''}" data-feature="${i}">
      <td>${esc(o.surface)}</td><td>${esc(o.option)}</td>
      <td class="num ${o.usedIn === 0 ? 'zero' : ''}">${o.usedIn} of ${o.offered}</td><td class="num">${pct(o.share)}${meter(o.share)}</td><td class="num">${o.uses}${o.unoffered ? ` <span class="muted" title="Presses not tied to a showing that offered it">(${o.unoffered} untied)</span>` : ''}</td>
      <td class="muted">${Object.entries(o.values).map(([k, n]) => `${esc(k)} ${n}`).join(' · ')}</td><td class="muted">${when(o.lastUsed)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No controls recorded in this period.</td></tr>'}
    </table>
  </div>

  <div class="u-section">
    <h2>Backtracks: Back pressed within ${prefs.threshold} s of arriving</h2>
    <div class="note">Every way a screen was arrived at (from → to · how), how many arrivals there were, and how many were left by Back within the cutoff (time with Mila in the foreground). A screen change a control made (Done, Back to your tree) isn’t Back. Click a row for every arrival’s time.</div>
    <table class="u"><tr><th>Arrived</th><th class="num">Backed out</th><th class="num">Share</th><th class="num">Median time there</th></tr>
    ${back.map((p, i) => `<tr class="click ${chosen?.kind === 'back' && chosen.key === p.key ? 'on' : ''}" data-back="${i}"><td>${esc(p.from ?? '—')} → <strong>${esc(p.to)}</strong> · ${esc(p.how)}</td>
      <td class="num">${p.backtracked} of ${p.arrivals}</td><td class="num">${pct(p.backtracked / p.arrivals)}${meter(p.backtracked / p.arrivals)}</td>
      <td class="num muted">${p.times.length ? secs(median(p.times.map(t => t.ms))) : '–'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No screen changes in this period.</td></tr>'}
    </table>
  </div>

  <div class="u-section">
    <h2>Home → Read</h2>
    <div class="note">The sheet was open ${sheet.showings} ${sheet.showings === 1 ? 'time' : 'times'}. Offered: ${Object.entries(sheet.offered).map(([k, n]) => `${esc(k)} ${n}`).join(' · ') || '–'}. “Led to reading”: the reader opened before Home came back.</div>
    <table class="u"><tr><th>Choice</th><th class="num">Chosen</th><th class="num">Share of openings</th><th class="num">Led to reading</th></tr>
    ${sheet.rows.map((r, i) => `<tr class="click ${chosen?.kind === 'read' && chosen.key === r.choice ? 'on' : ''}" data-read="${i}"><td>${esc(r.choice)}</td><td class="num">${r.chosen}</td>
      <td class="num">${pct(r.chosen / sheet.showings)}${meter(r.chosen / sheet.showings)}</td><td class="num">${r.choice === 'dismiss' || r.choice === 'nothing recorded' ? '–' : `${r.read} of ${r.chosen}`}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Not opened in this period.</td></tr>'}
    </table>
  </div>

  <div class="u-section">
    <h2>Tasks left unfinished</h2>
    <div class="note">A visit to the screen (not one returned to by Back) left without a passage opened, by what happened last on it.</div>
    <table class="u"><tr><th>Task</th><th class="num">Left unfinished</th><th class="num">Share</th><th>By what happened last</th></tr>
    ${tasks.map((t, i) => `<tr class="click ${chosen?.kind === 'task' && chosen.key === t.task ? 'on' : ''}" data-task="${i}"><td>${esc(t.task)}</td><td class="num">${t.abandoned} of ${t.started}</td>
      <td class="num">${t.started ? pct(t.abandoned / t.started) : '–'}${meter(t.started ? t.abandoned / t.started : 0)}</td><td class="muted">${Object.entries(t.by).map(([k, n]) => `${esc(k)} ${n}`).join(' · ') || '–'}</td></tr>`).join('')}
    </table>
  </div>`

  $('uDays').onchange = () => { prefs.days = Number($('uDays').value); keep(); chosen = null; void window.showUsage() }
  $('uThreshold').onchange = () => { const v = Number($('uThreshold').value); if (v > 0) { prefs.threshold = v; keep(); draw() } }
  $('uSort').onchange = () => { prefs.sort = $('uSort').value; keep(); draw() }
  $('uSurface').onchange = () => { prefs.surface = $('uSurface').value; keep(); draw() }
  $('uRefresh').onclick = () => void window.showUsage(true)
  for (const tr of $('usageMain').querySelectorAll('[data-feature]')) tr.onclick = () => { const o = rows[tr.dataset.feature]; choose({ kind: 'feature', key: `${o.surface}|${o.option}`, item: o }) }
  for (const tr of $('usageMain').querySelectorAll('[data-back]')) tr.onclick = () => { const p = back[tr.dataset.back]; choose({ kind: 'back', key: p.key, item: p }) }
  for (const tr of $('usageMain').querySelectorAll('[data-read]')) tr.onclick = () => { const r = sheet.rows[tr.dataset.read]; choose({ kind: 'read', key: r.choice, item: r }) }
  for (const tr of $('usageMain').querySelectorAll('[data-task]')) tr.onclick = () => { const t = tasks[tr.dataset.task]; choose({ kind: 'task', key: t.task, item: t }) }
  // A row chosen before a redraw (another cutoff, sort) stays chosen, with its numbers redone.
  if (chosen) {
    const again = chosen.kind === 'feature' ? surfaces.flatMap(s => s.options).find(o => `${o.surface}|${o.option}` === chosen.key)
      : chosen.kind === 'back' ? back.find(p => p.key === chosen.key) : chosen.kind === 'read' ? sheet.rows.find(r => r.choice === chosen.key) : tasks.find(t => t.task === chosen.key)
    if (again) { chosen.item = again; side() } else { chosen = null; $('usageSide').innerHTML = '' }
  } else if (!$('usageSide').innerHTML) $('usageSide').innerHTML = '<p class="muted">Click a row to see examples: the session as recorded, around the moment.</p>'
}

function choose(next) { chosen = { ...next, example: 0, list: null }; draw() }

// The examples a row has, each a moment in a session.
function examplesOf() {
  const { kind, item } = chosen
  if (kind === 'feature') return chosen.list === 'missed'
    ? item.missed.map(group => { const offer = data.events.find(e => e.type === 'offer' && (e.group ?? e.id) === group); return offer ? { session: offer.session, id: offer.id } : null }).filter(Boolean)
    : item.examples
  if (kind === 'back') return chosen.list === 'all' ? item.times : item.examples
  return item.examples
}

function side() {
  const { kind, item } = chosen
  const examples = examplesOf()
  const index = Math.min(chosen.example, Math.max(0, examples.length - 1))
  const example = examples[index]
  let head = ''
  if (kind === 'feature') head = `<h2>${esc(item.surface)} · ${esc(item.option)}</h2><p>Used in ${item.usedIn} of ${item.offered} showings (${pct(item.share)}), ${item.uses} presses. First offered ${when(item.firstOffered)}.</p>
    <p><button class="mode ${chosen.list !== 'missed' ? 'on' : ''}" data-list="used">Where it was used (${item.examples.length})</button> <button class="mode ${chosen.list === 'missed' ? 'on' : ''}" data-list="missed">Offered, not used (latest ${item.missed.length})</button></p>`
  if (kind === 'back') head = `<h2>${esc(item.from ?? '—')} → ${esc(item.to)} · ${esc(item.how)}</h2><p>${item.backtracked} of ${item.arrivals} arrivals were left by Back within ${prefs.threshold} s.</p>
    <p class="muted">Time on ${esc(item.to)} before leaving, every arrival (red: Back within the cutoff; grey: left another way). Click one to see it.</p>
    <div class="times">${item.times.map((t, i) => `<span class="${t.back && t.ms <= prefs.threshold * 1000 ? 'hit' : t.back ? '' : 'other'}" data-time="${i}" title="${t.back ? 'Back' : 'not Back'}">${secs(t.ms)}</span>`).join('') || '<span class="other">none left yet</span>'}</div>`
  if (kind === 'read') head = `<h2>Read sheet · ${esc(item.choice)}</h2><p>Chosen ${item.chosen} times${item.choice === 'dismiss' ? '' : `, ${item.read} led to reading`}.</p>`
  if (kind === 'task') head = `<h2>${esc(item.task)}</h2><p>${item.abandoned} of ${item.started}. ${Object.entries(item.by).map(([k, n]) => `${esc(k)} ${n}`).join(' · ')}</p>`
  let body = '<p class="muted">No examples.</p>'
  if (example) {
    const { list, at } = around(data.events, example.session, example.id)
    const t0 = at?.at ?? list[0]?.at ?? 0
    body = `<p><button id="uPrev" ${index <= 0 ? 'disabled' : ''}>‹</button> Example ${index + 1} of ${examples.length} <button id="uNext" ${index >= examples.length - 1 ? 'disabled' : ''}>›</button>
      <span class="muted">${when(at?.at)}</span></p>
      <div class="seq">${list.map(e => `<div class="ev ${e.id === example.id ? 'here' : ''}"><span class="t">${e.at - t0 >= 0 ? '+' : '−'}${secs(Math.abs(e.at - t0))}</span><span class="k">${e.type}</span><span>${esc(describe(e))}${e.type === 'nav' && e.how === 'back' && !e.after && activeMs(e) <= prefs.threshold * 1000 ? ' <span class="zero">backtrack</span>' : ''}</span></div>`).join('')}</div>`
  }
  $('usageSide').innerHTML = head + body
  for (const b of $('usageSide').querySelectorAll('[data-list]')) b.onclick = () => { chosen.list = b.dataset.list; chosen.example = 0; side() }
  for (const s of $('usageSide').querySelectorAll('[data-time]')) s.onclick = () => { chosen.list = 'all'; chosen.example = Number(s.dataset.time); side() }
  if ($('uPrev')) $('uPrev').onclick = () => { chosen.example = index - 1; side() }
  if ($('uNext')) $('uNext').onclick = () => { chosen.example = index + 1; side() }
}

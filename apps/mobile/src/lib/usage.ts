import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect, useRootNavigationState } from 'expo-router'
import { studySession } from './study-log'

// Usage events (2026-11-26), for the developers' Usage view (/debug.html → Usage): how Mila is
// used, always on (no debug capture needed), as names and timings only, never text:
//   nav      a screen arrived at: `to`, `from`, `how` (open, push, back, replace), how many screens
//            a back went (`popped`), how long the screen before was on (`ms`, and `away`, the part
//            of it Mila was in the background), and `after`, the control picked just before, when
//            the move was that control's doing rather than Back.
//   offer    a surface shown with the controls it had (`surface`, `options`); `group` ties a
//            surface's offers (more can appear while it is shown: Details once explained) to the
//            picks made on it. A surface's group is new each time it is shown.
//   pick     a control used (`surface`, `option`, `group`, and sometimes `value`).
//   outcome  what came of something, where it isn't a screen change (`surface`, `outcome`).
// They go through the study events' queue (lib/study-log.ts) and the server keeps them apart,
// in usageEvents (functions/study-events.ts), so Learning Insights and the learner model never
// read them. Signed out, nothing is kept.
type Fields = Record<string, unknown>
let log: ReturnType<typeof studySession>['log'] | null = null
let owner: string | null = null
const record = (type: 'nav' | 'offer' | 'pick' | 'outcome', fields: Fields) => (log ? log(type, fields) : null)

// The account usage is kept for; one usage session per account per launch of the app.
export function startUsage(next: string | null) {
  if (next === owner) return
  owner = next
  log = next ? studySession(next).log : null
}

// The control picked last, to tell a screen change it caused from Back.
let lastPick: { option: string; surface: string; at: number } | null = null
const CAUSED_WITHIN = 1500
export function pick(surface: string, option: string, group?: string | null, fields?: Fields) {
  lastPick = { option, surface, at: Date.now() }
  record('pick', { surface, option, group: group ?? null, ...fields })
}
export function outcome(surface: string, name: string, fields?: Fields) {
  record('outcome', { surface, outcome: name, ...fields })
}

// A surface shown while `key` is not null (a new key, or null and back, is a new showing), with
// the controls available now; controls that appear later in the same showing are added to it.
// Returns the way to log a pick on it.
export function useOffer(surface: string, key: unknown, options: (string | false | null | undefined)[]) {
  const shown = useRef<{ key: unknown; group: string | null; offered: Set<string> } | null>(null)
  const list = options.filter((item): item is string => !!item)
  const signature = list.join('|')
  useEffect(() => {
    if (key === null || key === undefined || key === false) { shown.current = null; return }
    if (!shown.current || shown.current.key !== key) shown.current = { key, group: null, offered: new Set() }
    const fresh = list.filter(item => !shown.current!.offered.has(item))
    if (!fresh.length) return
    fresh.forEach(item => shown.current!.offered.add(item))
    const id = record('offer', { surface, options: fresh, ...(shown.current.group ? { group: shown.current.group } : {}) })
    shown.current.group ??= id
    // `list` is read through its signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, key, signature])
  return useCallback((option: string, fields?: Fields) => pick(surface, option, shown.current?.group, fields), [surface])
}

// A number that is new each time the screen comes into focus, and null while it isn't: a key for
// useOffer, so each visit to a screen is its own showing.
let visits = 0
export function useVisit() {
  const [visit, setVisit] = useState<number | null>(null)
  useFocusEffect(useCallback(() => { setVisit(++visits); return () => setVisit(null) }, []))
  return visit
}

// Time in the background, to say how much of a screen's time was spent away from Mila.
let backgroundSince: number | null = AppState.currentState === 'active' ? null : Date.now()
let awayTotal = 0
AppState.addEventListener('change', state => {
  if (state === 'active') { if (backgroundSince !== null) awayTotal += Date.now() - backgroundSince; backgroundSince = null }
  else backgroundSince ??= Date.now()
})
const awayNow = () => awayTotal + (backgroundSince !== null ? Date.now() - backgroundSince : 0)

type NavState = { index?: number; routes: { key: string; name: string; state?: NavState }[] }
// The stack of screens as the deepest navigator on the focused path holds it.
function stackOf(state: NavState | undefined): { key: string; name: string }[] {
  let current = state
  while (current?.routes?.length) {
    const focused = current.routes[current.index ?? current.routes.length - 1]
    if (!focused?.state?.routes?.length) return current.routes.map(route => ({ key: route.key, name: route.name }))
    current = focused.state
  }
  return []
}
const isPrefix = (short: { key: string }[], long: { key: string }[]) => short.every((item, i) => long[i]?.key === item.key)

// Every screen change, from the navigation state (mounted once, in the root layout).
export function NavigationUsage() {
  const state = useRootNavigationState() as unknown as NavState | undefined
  const previous = useRef<{ stack: { key: string; name: string }[]; at: number; away: number } | null>(null)
  const stack = stackOf(state)
  const top = stack[stack.length - 1]
  useEffect(() => {
    if (!top) return
    const before = previous.current
    const old = before?.stack ?? []
    if (old[old.length - 1]?.key === top.key && old.length === stack.length) return
    const now = Date.now()
    const how = !before ? 'open'
      : stack.length > old.length && isPrefix(old, stack) ? 'push'
        : stack.length < old.length && isPrefix(stack, old) ? 'back'
          : 'replace'
    const after = lastPick && now - lastPick.at < CAUSED_WITHIN ? lastPick.option : null
    record('nav', {
      to: top.name, from: old[old.length - 1]?.name ?? null, how, depth: stack.length,
      ...(how === 'back' ? { popped: old.length - stack.length } : {}),
      ...(before ? { ms: now - before.at, away: awayNow() - before.away } : {}),
      ...(after ? { after } : {}),
    })
    previous.current = { stack, at: now, away: awayNow() }
    // The stack is read through its top and length.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top?.key, stack.length])
  return null
}

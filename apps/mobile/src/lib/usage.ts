import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect, useNavigationContainerRef } from 'expo-router'
import { studySession } from './study-log'
import { type Screen, screenChange, stackOf } from './nav-change'

// Usage events (DEBUG-2, 2026-11-26), for the developers' Usage view (/debug.html → Usage): how
// Mila is used, always on (no debug capture needed), as names and timings only, never text:
//   nav      a screen arrived at: `to`, `from`, `how` (open, push, back, replace, or unknown when
//            the stacks don't say: lib/nav-change.ts), how many screens went (`popped`) and came
//            (`pushed`), the navigation action behind it (`action`: POP, GO_BACK, NAVIGATE…), how
//            long the screen before was on (`ms`, and `away`, the part of it Mila was in the
//            background), and `after`, the control picked just before, when the move was that
//            control's doing rather than Back. `nv` is the tracker's version: 2 from the
//            navigation container's own state events (v1 read a state that never updated, so it
//            saw only the launch).
//   offer    a surface shown with the controls it had then, each one usable (`surface`,
//            `options`); `group` ties a showing's offers (more can appear while it is shown:
//            Details once explained) to the picks made on it, and `by` is the pick that brought it
//            up, when one did. A surface's group is new each time it is shown.
//   seen     a panel scrolled into view (`surface`, `panel`): on screen, not acted on.
//   pick     a control used, an explicit action (`surface`, `option`, `group`, sometimes `value`).
//   outcome  what came of something, where it isn't a screen change (`surface`, `outcome`).
// They go through the study events' queue (lib/study-log.ts) and the server keeps them apart,
// in usageEvents (functions/study-events.ts), so Learning Insights and the learner model never
// read them. Signed out, nothing is kept.
type Fields = Record<string, unknown>
type Kind = 'nav' | 'offer' | 'seen' | 'pick' | 'outcome'
let log: ReturnType<typeof studySession>['log'] | null = null
let owner: string | null = null
const record = (type: Kind, fields: Fields) => (log ? log(type, fields) : null)

// The account usage is kept for; one usage session per account per launch of the app.
export function startUsage(next: string | null) {
  if (next === owner) return
  owner = next
  log = next ? studySession(next).log : null
}

// The control picked last, to tell a screen change (or a panel) it caused from Back (or one that
// came up by itself).
let lastPick: { option: string; surface: string; at: number } | null = null
const CAUSED_WITHIN = 1500
const causedBy = () => (lastPick && Date.now() - lastPick.at < CAUSED_WITHIN ? lastPick : null)
// Each surface's showing, kept after it closes: a tap that lands as it goes (a double tap on a
// row that opens a screen) still belongs to it.
const lastGroup = new Map<string, string>()
export function pick(surface: string, option: string, group?: string | null, fields?: Fields) {
  lastPick = { option, surface, at: Date.now() }
  record('pick', { surface, option, group: group ?? lastGroup.get(surface) ?? null, ...fields })
}
export function outcome(surface: string, name: string, fields?: Fields) {
  record('outcome', { surface, outcome: name, ...fields })
}
export function seen(surface: string, panel: string) {
  record('seen', { surface, panel })
}

// A surface shown while `key` is not null (a new key, or null and back, is a new showing), with
// the controls usable now: leave out one that is hidden or disabled, so a showing counts as a
// chance to use it only when it could be used. Controls that become usable later in the same
// showing are added to it. Returns the way to log a pick on it.
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
    const by = !shown.current.group ? causedBy() : null
    const id = record('offer', {
      surface, options: fresh,
      ...(shown.current.group ? { group: shown.current.group } : {}),
      ...(by && by.surface !== surface ? { by: `${by.surface}: ${by.option}` } : {}),
    })
    if (!shown.current.group && id) { shown.current.group = id; lastGroup.set(surface, id) }
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

type Listen = (event: string, callback: (event: { data?: { action?: { type?: string }; noop?: boolean } }) => void) => () => void
// Every screen change, from the navigation container's own events (mounted once, in the root
// layout): its state after each change, and the action dispatched just before it.
export function NavigationUsage() {
  const navigation = useNavigationContainerRef()
  useEffect(() => {
    let previous: { stack: Screen[]; at: number; away: number } | null = null
    let action: { type: string; at: number } | null = null
    const onState = () => {
      const stack = stackOf(navigation.getRootState?.() as never)
      const change = screenChange(previous?.stack ?? null, stack)
      if (!change) { if (previous && stack.length) previous.stack = stack; return }
      const now = Date.now()
      const by = causedBy()
      const old = previous?.stack ?? []
      record('nav', {
        nv: 2, to: stack[stack.length - 1].name, from: old[old.length - 1]?.name ?? null, how: change.how, depth: stack.length,
        ...(change.popped ? { popped: change.popped } : {}), ...(change.pushed ? { pushed: change.pushed } : {}),
        ...(action && now - action.at < 1000 ? { action: action.type } : {}),
        ...(previous ? { ms: now - previous.at, away: awayNow() - previous.away } : {}),
        ...(by && change.how !== 'open' ? { after: by.option } : {}),
      })
      previous = { stack, at: now, away: awayNow() }
    }
    const listen = navigation.addListener as unknown as Listen
    const stopState = listen('state', onState)
    const stopAction = listen('__unsafe_action__', event => {
      if (event.data?.action?.type && !event.data.noop) action = { type: event.data.action.type, at: Date.now() }
    })
    if (navigation.isReady()) onState()
    return () => { stopState(); stopAction() }
  }, [navigation])
  return null
}

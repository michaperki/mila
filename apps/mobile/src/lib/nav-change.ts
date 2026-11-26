// What kind of screen change one navigation state is from the one before (lib/usage.ts records it):
// the two stacks of screens compared by their keys, from the bottom up.
//   push     screens added on top of what was there
//   back     screens taken off the top (`popped` of them)
//   replace  the top screen swapped for another
//   unknown  anything else (screens both taken off and added, a stack reset): recorded with how
//            many went and came, never guessed at
// null when it isn't a screen change: the same screen on top at the same depth (its params
// changed, or, at launch, the first state's keys settling into the real ones).
export type Screen = { key: string; name: string }
export type ScreenChange = { how: 'open' | 'push' | 'back' | 'replace' | 'unknown'; popped?: number; pushed?: number }

export function screenChange(before: Screen[] | null, now: Screen[]): ScreenChange | null {
  const top = now[now.length - 1]
  if (!top) return null
  if (!before?.length) return { how: 'open' }
  const was = before[before.length - 1]
  if (was.key === top.key && before.length === now.length) return null
  let common = 0
  while (common < before.length && common < now.length && before[common].key === now[common].key) common++
  const popped = before.length - common, pushed = now.length - common
  if (popped === 1 && pushed === 1 && was.name === top.name) return null
  if (!popped && pushed) return { how: 'push', ...(pushed > 1 ? { pushed } : {}) }
  if (popped && !pushed) return { how: 'back', popped }
  if (popped === 1 && pushed === 1) return { how: 'replace' }
  return { how: 'unknown', popped, pushed }
}

type NavState = { index?: number; routes?: { key: string; name: string; state?: NavState }[] }
// The stack of screens as the deepest navigator on the focused path holds it.
export function stackOf(state: NavState | undefined | null): Screen[] {
  let current = state
  while (current?.routes?.length) {
    const focused = current.routes[current.index ?? current.routes.length - 1]
    if (!focused?.state?.routes?.length) return current.routes.map(route => ({ key: route.key, name: route.name }))
    current = focused.state
  }
  return []
}

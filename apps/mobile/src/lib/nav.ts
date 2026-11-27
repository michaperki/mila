import { router as expoRouter } from 'expo-router'
import { onScreenChange, outcome } from './usage'

// The app's navigation (2026-11-27), expo-router's `router` with one guard: the same navigation
// asked for again within a second is ignored. A screen stays touchable while the next one slides
// in, so a double tap on a button or a row (seen in Preview: Your words opened twice, 490 ms apart,
// so it took three Backs to get home) pushed the same screen twice. Every push, replace, Back
// and dismiss goes through here; a different destination, or the same one after a Back, goes
// through as asked. Each ignored repeat is recorded (usage `outcome`: navigation, repeat ignored).
const AGAIN_WITHIN = 1000
let last: { key: string; at: number } | null = null
// After Back, going to the same place again is a retry, not a double tap.
onScreenChange(how => { if (how === 'back') last = null })

function once(method: string, href?: unknown) {
  const key = `${method} ${JSON.stringify(href ?? null)}`
  const now = Date.now()
  if (last && last.key === key && now - last.at < AGAIN_WITHIN) {
    outcome('navigation', 'repeat ignored', { method, ms: now - last.at, ...(typeof href === 'string' ? { to: href } : href && typeof href === 'object' && 'pathname' in href ? { to: String(href.pathname) } : {}) })
    return false
  }
  last = { key, at: now }
  return true
}

type Push = typeof expoRouter.push
type Replace = typeof expoRouter.replace
type DismissTo = typeof expoRouter.dismissTo
export const router = {
  push: ((...args: Parameters<Push>) => { if (once('push', args[0])) expoRouter.push(...args) }) as Push,
  replace: ((...args: Parameters<Replace>) => { if (once('replace', args[0])) expoRouter.replace(...args) }) as Replace,
  dismissTo: ((...args: Parameters<DismissTo>) => { if (once('dismissTo', args[0])) expoRouter.dismissTo(...args) }) as DismissTo,
  back: () => { if (once('back')) expoRouter.back() },
}

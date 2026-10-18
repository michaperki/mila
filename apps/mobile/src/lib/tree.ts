import { request } from './api'
import { getPref, setPref } from './prefs'
import type { Session } from './types'

// The learner's bonsai on Home. The server works it out from what was done each day
// (apps/web/netlify/functions/lib/tree.ts); the app reports activity and draws what comes back.
// Reading (sentences read, words saved) feeds its vitality, studying (cards graded) prunes it,
// and steady days grow it. Activity is counted here as it happens and sent when Home opens,
// so a session never waits on the network; what isn't sent yet is kept on the phone.
export type Tree = { growth: number; overgrowth: number; vitality: number; seed: number; planted: string; tendedToday: boolean }
export type Activity = { cards: number; sentences: number; saved: number }

// A young, healthy tree: before signing in, and until the first answer from the server.
export const SAPLING: Tree = { growth: 8, overgrowth: 0, vitality: 88, seed: 7, planted: '', tendedToday: false }

// The learner's own date, 'YYYY-MM-DD'.
export const localDay = (now = Date.now()) => {
  const date = new Date(now)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const EMPTY: Activity = { cards: 0, sentences: 0, saved: 0 }
let pending: Activity = { ...EMPTY }
let pendingDay = localDay()
const restored = getPref('treePending').then(value => {
  try {
    const saved = JSON.parse(value) as { day: string; activity: Activity }
    // Yesterday's unsent activity is dropped rather than credited to today.
    if (saved.day === localDay()) pending = { cards: pending.cards + saved.activity.cards, sentences: pending.sentences + saved.activity.sentences, saved: pending.saved + saved.activity.saved }
  } catch { /* nothing kept */ }
}).catch(() => {})
const keepPending = () => setPref('treePending', JSON.stringify({ day: pendingDay, activity: pending }))

// Set when a card is graded, so Home greets the tended tree with its quiet reaction once.
let tended = false
export const takeTended = () => { const was = tended; tended = false; return was }

// Counts something just done. Cheap: no network.
export function noteActivity(kind: keyof Activity, count = 1) {
  const today = localDay()
  if (today !== pendingDay) { pending = { ...EMPTY }; pendingDay = today }
  pending = { ...pending, [kind]: pending[kind] + count }
  if (kind === 'cards') tended = true
  keepPending()
}

// The tree last shown, so Home opens on it and then grows into the new one.
export async function lastTree(session: Session | null): Promise<Tree | null> {
  if (!session) return null
  try {
    const saved = JSON.parse(await getPref('tree')) as { owner: string; tree: Tree }
    return saved.owner === session.user.id ? saved.tree : null
  } catch { return null }
}
export const rememberTree = (session: Session, tree: Tree) => setPref('tree', JSON.stringify({ owner: session.user.id, tree }))

// Sends what is waiting and returns the tree as it stands. `due`: the cards waiting now.
export async function loadTree(session: Session, due: number): Promise<Tree> {
  await restored
  const day = localDay()
  const sending = pendingDay === day ? pending : { ...EMPTY }
  const any = sending.cards + sending.sentences + sending.saved > 0
  pending = { ...EMPTY }; pendingDay = day
  try {
    const { tree } = any
      ? await request<{ tree: Tree }>('tree', { token: session.token, body: { day, due, ...sending } })
      : await request<{ tree: Tree }>(`tree?day=${day}&due=${due}`, { token: session.token })
    keepPending()
    return tree
  } catch (failure) {
    // Kept for the next try.
    pending = { cards: pending.cards + sending.cards, sentences: pending.sentences + sending.sentences, saved: pending.saved + sending.saved }
    keepPending()
    throw failure
  }
}

// One quiet line under the tree: its state in words (and for VoiceOver).
export function treeLine(tree: Tree, due: number, hasWords: boolean, signedIn: boolean) {
  if (!signedIn) return 'A young tree. Sign in to tend it day by day.'
  if (!hasWords && tree.growth < 12 && !tree.tendedToday) return 'A young tree. Read a page to begin.'
  if (tree.overgrowth >= 45) return 'It has grown wild. A short study will shape it.'
  if (tree.overgrowth >= 15 && due > 0) return 'A few shoots need trimming.'
  if (tree.vitality < 45) return 'Quiet lately. A page of reading brings back its colour.'
  if (tree.tendedToday) return 'Tended today.'
  return 'Ready when you are.'
}

// "Planted 3 March 2026".
export const plantedOn = (tree: Tree) => {
  const [y, m, d] = tree.planted.split('-').map(Number)
  return y ? `Planted ${new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}` : ''
}

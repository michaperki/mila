import type { CardMemory } from './types'

// A card's memory, as the server works it out from every answer (apps/web/netlify/functions/lib/
// memory.ts, FSRS-5 with its published default parameters, kept in step with this): what the
// phone needs of it to say how likely the card is recalled now and what practising it now would
// do. Stability: days until recall would fall to 90%; recall falls with the days since the last
// answer. Shadow only: Study doesn't use it to choose (lib/scoring.ts).
export const MEMORY_VERSION = 'fsrs-5-default'
const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621]
const DECAY = -0.5
const FACTOR = 19 / 81
const DAY = 86_400_000

export const retrievability = (days: number, stability: number) => (1 + FACTOR * Math.max(0, days) / stability) ** DECAY
const clampD = (d: number) => Math.min(10, Math.max(1, d))
const initialD = (grade: number) => clampD(W[4] - Math.exp(W[5] * (grade - 1)) + 1)
export function review(memory: { s: number; d: number } | null, grade: 1 | 3, days: number): { s: number; d: number } {
  if (!memory) return { s: W[grade - 1], d: initialD(grade) }
  const { s, d } = memory
  const next = clampD(W[7] * initialD(4) + (1 - W[7]) * (d + (-W[6] * (grade - 3)) * (10 - d) / 9))
  if (days < 1) return { s: s * Math.exp(W[17] * (grade - 3 + W[18])), d: next }
  const r = retrievability(days, s)
  if (grade === 1) return { s: Math.min(s, W[11] * d ** -W[12] * ((s + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - r))), d: next }
  return { s: s * (Math.exp(W[8]) * (11 - d) * s ** -W[9] * (Math.exp(W[10] * (1 - r)) - 1) + 1), d: next }
}

// Recall now, and what practising now would add to recall HORIZON days on: with the answer right
// (as likely as recall now) or missed, against leaving the card alone. A card well known gains
// little (its recall stays high anyway), a card long forgotten gains little too (one answer won't
// hold), and one in between gains most: why recently introduced words are worth meeting again.
export const HORIZON = 30
export function practiceNow(memory: CardMemory, now: number) {
  const days = (now - memory.last) / DAY
  const r = retrievability(days, memory.s)
  const right = review(memory, 3, days), missed = review(memory, 1, days)
  const later = r * retrievability(HORIZON, right.s) + (1 - r) * retrievability(HORIZON, missed.s)
  const alone = retrievability(days + HORIZON, memory.s)
  return { r, gain: Math.max(0, later - alone), alone, later }
}

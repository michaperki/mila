// The learner's bonsai, worked out from what they did each day. Reading is sunlight and water
// (vitality), studying is pruning (it clears overgrowth), and coming back day after day is what
// grows the tree. The app only draws what this returns: three values from 0 to 100 and a seed.
// Pure and recomputed from the whole history on every request, so the rules can be retuned
// without touching anyone's saved data.

export type DayActivity = { day: string; cards?: number; sentences?: number; saved?: number }
export type TreeState = {
  growth: number; overgrowth: number; vitality: number
  // Which tree: the same learner always grows the same shape.
  seed: number
  // The day the tree was planted (the learner's first visit), 'YYYY-MM-DD'.
  planted: string
  // Today already counts as a day the tree was tended.
  tendedToday: boolean
}

export const TreeRules = {
  // A full day's credit, which is all a day can earn: more than this grows nothing more, so
  // steady days count and cramming doesn't.
  studyFull: 15, // cards answered
  readFull: 12, // sentences read
  savedWorth: 0.1, // each saved word, as a share of a reading day
  // A day with at least this much credit was a day the tree was tended.
  tended: 0.3,
  // Growth: a young tree from the start, quick at first and slower later, like a real one.
  // About 40 tended days to halfway, ~120 to near maturity. It never goes down.
  growthStart: 8,
  growthPace: 55,
  // Vitality: the last two weeks, the most recent counting most. Reading feeds it most.
  vitalityFloor: 20,
  vitalityWindow: 14,
  vitalityFade: 0.8,
  vitalityFull: 2.8,
  readWeight: 1.2,
  studyWeight: 1,
  // A new tree arrives healthy: its planting day counts like a few good days, fading as usual.
  plantedBoost: 2.4,
  // Overgrowth: days away beyond a short grace. Nothing is ever due, so nothing else counts.
  graceDays: 2,
  wildPace: 5,
}

export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const dayNumber = (day: string) => Math.round(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86400000)
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const round = (value: number) => Math.round(value * 10) / 10

const studyOf = (d: DayActivity) => clamp((d.cards ?? 0) / TreeRules.studyFull, 0, 1)
const readOf = (d: DayActivity) => clamp((d.sentences ?? 0) / TreeRules.readFull + (d.saved ?? 0) * TreeRules.savedWorth, 0, 1)
export const creditOf = (d: DayActivity) => Math.min(1, studyOf(d) + readOf(d))

// A small stable number from the user id, for the tree's shape.
export function seedOf(userId: string) {
  let h = 2166136261
  for (let i = 0; i < userId.length; i++) h = Math.imul(h ^ userId.charCodeAt(i), 16777619)
  return 1 + ((h >>> 0) % 9973)
}

export function treeState({ days, planted, today, userId }: { days: DayActivity[]; planted: string; today: string; userId: string }): TreeState {
  const R = TreeRules
  const now = dayNumber(today)
  const past = days.filter(d => DAY_PATTERN.test(d.day) && dayNumber(d.day) <= now)

  const points = past.reduce((sum, d) => sum + creditOf(d), 0)
  const growth = R.growthStart + (100 - R.growthStart) * (1 - Math.exp(-points / R.growthPace))

  let lively = 0
  const plantedAge = now - dayNumber(planted)
  if (plantedAge >= 0 && plantedAge < R.vitalityWindow) lively += R.plantedBoost * Math.pow(R.vitalityFade, plantedAge)
  for (const d of past) {
    const age = now - dayNumber(d.day)
    if (age >= R.vitalityWindow) continue
    lively += Math.pow(R.vitalityFade, age) * Math.min(1, studyOf(d) * R.studyWeight + readOf(d) * R.readWeight)
  }
  const vitality = R.vitalityFloor + (100 - R.vitalityFloor) * Math.min(1, lively / R.vitalityFull)

  let lastTended = dayNumber(planted)
  for (const d of past) if (creditOf(d) >= R.tended) lastTended = Math.max(lastTended, dayNumber(d.day))
  const wild = Math.max(0, now - lastTended - R.graceDays)
  const overgrowth = 100 * (1 - Math.exp(-wild / R.wildPace))

  const todays = past.find(d => d.day === today)
  return {
    growth: round(clamp(growth, 0, 100)), overgrowth: round(clamp(overgrowth, 0, 100)), vitality: round(clamp(vitality, 0, 100)),
    seed: seedOf(userId), planted, tendedToday: !!todays && creditOf(todays) >= R.tended,
  }
}

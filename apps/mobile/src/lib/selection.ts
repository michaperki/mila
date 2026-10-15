// Drag-to-select in the reader: which word is under the finger, given each word's box
// within its line. Lines wrap right-to-left, so the order of words is by index, not x.
export type Rect = { x: number; y: number; width: number; height: number }

export function wordAt(rects: ReadonlyMap<number, Rect>, x: number, y: number): number | undefined {
  let best: number | undefined
  let bestScore = Infinity
  for (const [index, rect] of rects) {
    // Off the row costs far more than off to the side, so a finger in the gap between
    // two words picks the nearer word on the same row.
    const dy = y < rect.y ? rect.y - y : y > rect.y + rect.height ? y - rect.y - rect.height : 0
    const dx = x < rect.x ? rect.x - x : x > rect.x + rect.width ? x - rect.x - rect.width : 0
    const score = dy * 1000 + dx
    if (score < bestScore) { bestScore = score; best = index }
  }
  return best
}

export const MAX_PHRASE_WORDS = 8

// The selected range from the word the drag started on to the one under the finger.
export function rangeOf(start: number, current: number) {
  const from = Math.min(start, current)
  const to = Math.min(Math.max(start, current), from + MAX_PHRASE_WORDS - 1)
  return start <= current ? { from, to } : { from: Math.max(from, start - MAX_PHRASE_WORDS + 1), to: start }
}

/** Small seeded PRNG (mulberry32) so a seed always grows the same tree. */
export function createRandom(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo: number, hi: number) => lo + (hi - lo) * next(),
    int: (lo: number, hi: number) => Math.floor(lo + (hi - lo + 1) * next()),
    sign: () => (next() < 0.5 ? -1 : 1),
    pick: <T,>(items: readonly T[]) => items[Math.floor(next() * items.length)],
  };
}

export type Random = ReturnType<typeof createRandom>;

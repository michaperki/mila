export function clamp(x: number, lo: number, hi: number) {
  'worklet';
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a: number, b: number, t: number) {
  'worklet';
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number) {
  'worklet';
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Deterministic pseudo-random in [0, 1) for a given integer-ish input. */
export function hash(n: number) {
  'worklet';
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Exponential approach factor for a time constant: x += (target - x) * approach(dt, tau). */
export function approach(dt: number, tau: number) {
  'worklet';
  return 1 - Math.exp(-dt / Math.max(0.0001, tau));
}

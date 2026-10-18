import { BonsaiConfig } from '../config';

type RGB = [number, number, number];

function hex(h: string): RGB {
  return [
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  ];
}

const c = BonsaiConfig.colors;
const pair = (p: string[]) => [hex(p[0]), hex(p[1])] as [RGB, RGB];

/** Parsed once on the JS thread; worklets capture these plain arrays. */
export const Palette = {
  foliageDark: pair(c.foliageDark),
  foliageBase: pair(c.foliageBase),
  foliageLight: pair(c.foliageLight),
  foliageSpec: pair(c.foliageSpec),
  newGrowth: pair(c.newGrowth),
  bark: hex(c.bark),
  barkDark: hex(c.barkDark),
  barkLight: hex(c.barkLight),
  shootWood: hex(c.shootWood),
  potBody: hex(c.potBody),
  potDark: hex(c.potDark),
  potLight: hex(c.potLight),
  potRim: hex(c.potRim),
  soil: hex(c.soil),
  moss: hex(c.moss),
  fallenLeaf: hex(c.fallenLeaf),
};

/** Linear mix of two RGB colors, with brightness multiplier and alpha. */
export function mix(a: number[], b: number[], t: number, shade = 1, alpha = 1): Float32Array {
  'worklet';
  return new Float32Array([
    Math.min(1, (a[0] + (b[0] - a[0]) * t) * shade),
    Math.min(1, (a[1] + (b[1] - a[1]) * t) * shade),
    Math.min(1, (a[2] + (b[2] - a[2]) * t) * shade),
    alpha,
  ]);
}

export function rgba(a: number[], shade = 1, alpha = 1): Float32Array {
  'worklet';
  return new Float32Array([
    Math.min(1, a[0] * shade),
    Math.min(1, a[1] * shade),
    Math.min(1, a[2] * shade),
    alpha,
  ]);
}

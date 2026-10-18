import type { Tree } from '../geometry/generateTree';

export const PARTICLE_LEAF = 0;
export const PARTICLE_SPARKLE = 1;
export const PARTICLE_CLIPPING = 2;

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  maxLife: number;
  kind: number;
  size: number;
  phase: number;
  landed: boolean;
}

/** Inputs the host controls (0..1 except flags). Written from JS, read on the UI thread. */
export interface SimTargets {
  growth: number;
  overgrowth: number;
  vitality: number;
  ambient: boolean;
  debug: boolean;
}

/**
 * Everything that changes frame to frame. Lives in one shared value on the UI
 * thread and is mutated in place (sv.modify) so nothing is copied per frame.
 */
export interface SimState {
  seed: number;
  time: number;
  /** Smoothed condition actually being drawn. */
  g: number;
  o: number;
  v: number;
  /** Smoothed 0..1 multiplier for wind (ambient toggle). */
  ambient: number;
  energy: number;
  /** Per node: spring angle offset, angular velocity, last angular acceleration. */
  ang: number[];
  vel: number[];
  acc: number[];
  /** Per node: visible fraction, posed end point and absolute angle (actual and at rest). */
  vis: number[];
  px: number[];
  py: number[];
  pa: number[];
  ra: number[];
  /** Per node display radius (end of segment). */
  rad: number[];
  baseX: number;
  baseY: number;
  /** Per pad rustle energy from touch. */
  rustle: number[];
  /** Per limb highest visible fraction seen recently (for pruning clippings). */
  limbPeak: number[];
  pot: number;
  potVel: number;
  pulse: number;
  particles: Particle[];
  leafFallAcc: number;
  counter: number;
  fps: number;
  lastHit: number;
}

export function createSimState(tree: Tree, t: SimTargets): SimState {
  'worklet';
  const n = tree.nodes.length;
  const zeros = () => {
    const a: number[] = [];
    for (let i = 0; i < n; i++) a.push(0);
    return a;
  };
  const rustle: number[] = [];
  for (let i = 0; i < tree.pads.length; i++) rustle.push(0);
  const limbPeak: number[] = [];
  for (let i = 0; i < tree.limbs.length; i++) limbPeak.push(0);
  return {
    seed: tree.seed,
    time: 0,
    g: t.growth,
    o: t.overgrowth,
    v: t.vitality,
    ambient: t.ambient ? 1 : 0,
    energy: 1,
    ang: zeros(),
    vel: zeros(),
    acc: zeros(),
    vis: zeros(),
    px: zeros(),
    py: zeros(),
    pa: zeros(),
    ra: zeros(),
    rad: zeros(),
    baseX: 0,
    baseY: 0,
    rustle,
    limbPeak,
    pot: 0,
    potVel: 0,
    pulse: 0,
    particles: [],
    leafFallAcc: 0,
    counter: 1,
    fps: 60,
    lastHit: 0,
  };
}

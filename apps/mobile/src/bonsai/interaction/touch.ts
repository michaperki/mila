import { BonsaiConfig } from '../config';
import { KIND_TRUNK, Tree } from '../geometry/generateTree';
import { hash } from '../math';
import { PARTICLE_LEAF, SimState } from '../sim/state';
import { padPose, spawnParticle } from '../sim/step';

/** What a tap landed on, reported to JS (haptics, analytics, host callbacks). */
export const HIT_NONE = 0;
export const HIT_FOLIAGE = 1;
export const HIT_BRANCH = 2;
export const HIT_POT = 3;

/** Spin node `j` (and its ancestors, fading) as if pushed with force (fx, fy) at (x, y). */
function push(s: SimState, tree: Tree, j: number, x: number, y: number, fx: number, fy: number, gain: number, depth: number) {
  'worklet';
  let node = j;
  let falloff = 1;
  for (let d = 0; d < depth && node >= 0; d++) {
    const pi = tree.nodes[node].parent;
    const ox = pi < 0 ? s.baseX : s.px[pi];
    const oy = pi < 0 ? s.baseY : s.py[pi];
    const rx = x - ox;
    const ry = y - oy;
    const r2 = Math.max(400, rx * rx + ry * ry);
    // Angular impulse = (r x F) / |r|^2, so distant pushes turn less per unit force.
    s.vel[node] += ((rx * fy - ry * fx) / r2) * gain * falloff * 60;
    falloff *= 0.45;
    node = pi;
  }
}

export function applyTap(s: SimState, tree: Tree, x: number, y: number): number {
  'worklet';
  const cfg = BonsaiConfig;
  const T = cfg.touch;

  // Pot: squash, and the whole tree gets a little jolt.
  const pad = T.potHitPadding;
  if (x > 272 - pad && x < 728 + pad && y > cfg.world.baseY - 6 && y < 892 + pad) {
    s.potVel += 2.6;
    for (let i = 0; i < tree.nodes.length; i++) {
      if (tree.nodes[i].kind === KIND_TRUNK) s.vel[i] += (x < 500 ? 1 : -1) * 0.25;
    }
    for (let i = 0; i < s.rustle.length; i++) s.rustle[i] = Math.min(1.4, s.rustle[i] + 0.5);
    return HIT_POT;
  }

  // Foliage, topmost pad first.
  for (let pi = tree.pads.length - 1; pi >= 0; pi--) {
    const p = tree.pads[pi];
    const pose = padPose(s, p);
    if (pose[2] < 0.15) continue;
    const ex = (x - pose[0]) / (p.rx * pose[2] * 1.1 + 6);
    const ey = (y - pose[1]) / (p.ry * pose[2] * 1.5 + 6);
    if (ex * ex + ey * ey < 1) {
      s.rustle[pi] = Math.min(1.6, s.rustle[pi] + 1);
      const fx = (pose[0] - x) * 0.6 + (hash(s.counter++) - 0.5) * 30;
      const fy = 25;
      push(s, tree, p.node, x, y, fx, fy, T.padImpulse, 3);
      const n = 1 + Math.floor(hash(s.counter++) * 3);
      for (let k = 0; k < n; k++) {
        spawnParticle(
          s, PARTICLE_LEAF,
          x + (hash(s.counter++) - 0.5) * 40, y + (hash(s.counter++) - 0.5) * 20,
          (hash(s.counter++) - 0.5) * 140, -60 - hash(s.counter++) * 60, 9, 5
        );
      }
      return HIT_FOLIAGE;
    }
  }

  // Wood: the nearest visible node.
  let best = -1;
  let bestD = 1e9;
  for (let i = 0; i < tree.nodes.length; i++) {
    if (s.vis[i] < 0.2) continue;
    const pi = tree.nodes[i].parent;
    const ax = pi < 0 ? s.baseX : s.px[pi];
    const ay = pi < 0 ? s.baseY : s.py[pi];
    // Distance to the segment, not just its end point.
    const sx = s.px[i] - ax;
    const sy = s.py[i] - ay;
    const l2 = sx * sx + sy * sy || 1;
    let u = ((x - ax) * sx + (y - ay) * sy) / l2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const d = Math.hypot(x - (ax + sx * u), y - (ay + sy * u)) - s.rad[i];
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best >= 0 && bestD < 22) {
    const isTrunk = tree.nodes[best].kind === KIND_TRUNK;
    const dir = x < s.px[best] ? 1 : -1;
    push(s, tree, best, x, y, dir * 40, 30, T.branchImpulse * (isTrunk ? 0.5 : 1), isTrunk ? 9 : 3);
    // A knock on wood makes nearby foliage shiver.
    for (let pi = 0; pi < tree.pads.length; pi++) {
      const pp = padPose(s, tree.pads[pi]);
      const d = Math.hypot(pp[0] - x, pp[1] - y);
      if (d < 220) s.rustle[pi] = Math.min(1.4, s.rustle[pi] + 0.7 * (1 - d / 220));
    }
    return HIT_BRANCH;
  }
  return HIT_NONE;
}

/** Finger dragging through the tree: push everything near it along the motion. */
export function applyDrag(s: SimState, tree: Tree, x: number, y: number, dx: number, dy: number) {
  'worklet';
  const T = BonsaiConfig.touch;
  const R = T.dragRadius;
  const speed = Math.hypot(dx, dy);
  if (speed < 0.01) return;
  for (let i = 0; i < tree.nodes.length; i++) {
    if (s.vis[i] < 0.1) continue;
    const d = Math.hypot(s.px[i] - x, s.py[i] - y);
    if (d > R) continue;
    const f = 1 - d / R;
    push(s, tree, i, x, y, dx * f, dy * f, T.dragImpulse * 18, 1);
  }
  for (let pi = 0; pi < tree.pads.length; pi++) {
    const p = tree.pads[pi];
    const pose = padPose(s, p);
    const d = Math.hypot(pose[0] - x, pose[1] - y) - p.rx * pose[2] * 0.6;
    if (d < R && pose[2] > 0.1) {
      s.rustle[pi] = Math.min(1.6, s.rustle[pi] + speed * 0.012 * (1 - Math.max(0, d) / R));
      if (hash(s.counter++) < speed * 0.004) {
        spawnParticle(s, PARTICLE_LEAF, x, y, dx * 4, dy * 4 - 30, 9, 5);
      }
    }
  }
}

/** A study session: a warm pulse, sparkles rising from the canopy, a happy shiver. */
export function celebrate(s: SimState, tree: Tree) {
  'worklet';
  // Quiet on purpose: a soft warm light and one breath of wind through the canopy.
  s.pulse = 0.6;
  for (let i = 0; i < tree.nodes.length; i++) {
    if (tree.nodes[i].kind !== KIND_TRUNK) s.vel[i] += (0.35 + 0.3 * hash(s.counter++)) * (i % 2 ? 1 : 0.6);
  }
  for (let i = 0; i < s.rustle.length; i++) s.rustle[i] = Math.min(1, s.rustle[i] + 0.35);
}

import { BonsaiConfig } from '../config';
import { KIND_BRANCH, KIND_SHOOT, KIND_TRUNK, KIND_TWIG, Pad, Tree } from '../geometry/generateTree';
import { approach, clamp, hash, lerp, smoothstep } from '../math';
import {
  createSimState,
  PARTICLE_CLIPPING,
  PARTICLE_LEAF,
  PARTICLE_SPARKLE,
  SimState,
  SimTargets,
} from './state';

const UP = -Math.PI / 2;
export const POT_BOTTOM_Y = 880;

function integrate(s: SimState, tree: Tree, h: number) {
  'worklet';
  const W = BonsaiConfig.sway;
  const T = s.time;
  const omega = W.baseFrequency * Math.PI * 2;
  // Slow breathing of the wind, plus a periodic gust that rolls through.
  let gust = 0.72 + 0.28 * Math.sin(T * 0.31) * Math.sin(T * 0.173 + 1.1);
  const cyc = T / W.gustEvery;
  const idx = Math.floor(cyc);
  const ph = cyc - idx;
  if (ph < 0.32) {
    gust *= 1 + Math.sin((ph / 0.32) * Math.PI) * (0.4 + 0.6 * hash(idx + s.seed)) * W.gustStrength;
  }
  const e = s.energy;
  const nodes = tree.nodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const k = n.kind;
    if (s.vis[i] <= 0.001 && k !== KIND_TRUNK) {
      s.ang[i] *= 0.9;
      s.vel[i] *= 0.9;
      s.acc[i] = 0;
      continue;
    }
    const x = s.px[i];
    const fx = gust * (0.3 + 0.55 * Math.sin(omega * T - x * 0.006 + n.phase * 0.25) + 0.15 * Math.sin(omega * 2.3 * T + n.phase));
    const fy = gust * 0.45 * Math.sin(omega * 1.7 * T + n.phase * 1.3 - x * 0.004);
    const a = s.pa[i];
    const torque = Math.cos(a) * fy - Math.sin(a) * fx;
    const parentAcc = n.parent >= 0 ? s.acc[n.parent] : 0;
    const acc =
      W.windGain[k] * e * torque -
      W.stiffness[k] * s.ang[i] -
      W.damping[k] * s.vel[i] -
      W.whip * parentAcc;
    s.vel[i] += acc * h;
    s.ang[i] = clamp(s.ang[i] + s.vel[i] * h, -0.7, 0.7);
    s.acc[i] = acc;
  }
}

/** Forward kinematics: where every node is this frame, and how much of it exists. */
function pose(s: SimState, tree: Tree) {
  'worklet';
  const cfg = BonsaiConfig;
  const g = s.g;
  const o = s.o;
  const v = s.v;
  const squash = 1 - 0.06 * s.pot;
  s.baseX = cfg.world.baseX;
  s.baseY = POT_BOTTOM_Y - (POT_BOTTOM_Y - cfg.world.baseY) * squash;
  const trunkLen = lerp(cfg.trunk.youngLengthScale, 1, g);
  const limbLen = lerp(0.55, 1, g) * (1 + cfg.overgrowth.legginess * o);
  const radScale = lerp(cfg.trunk.youngRadiusScale, 1, g);
  const droop = cfg.vitality.droop * (1 - v);
  const nodes = tree.nodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const pi = n.parent;
    let own: number;
    if (n.ogBirth >= 0) own = smoothstep(n.ogBirth, n.ogBirth + n.span, o);
    else own = n.birth < 0 ? 1 : smoothstep(n.birth, n.birth + n.span, g);
    const pv = pi < 0 ? 1 : s.vis[pi];
    const vis = own * pv;
    s.vis[i] = vis;
    const parentA = pi < 0 ? UP : s.pa[pi];
    const parentRest = pi < 0 ? UP : s.ra[pi];
    let bend = 0;
    if (n.kind !== KIND_TRUNK) {
      // Gravity pulls weak branches down: +angle for right-pointing, -angle for left.
      bend = droop * Math.cos(parentRest + n.rel) * (n.kind === KIND_SHOOT ? 1.8 : 1);
    }
    s.ra[i] = parentRest + n.rel + bend;
    const a = parentA + n.rel + bend + s.ang[i];
    s.pa[i] = a;
    let len = n.len * vis;
    if (n.kind === KIND_TRUNK) len *= trunkLen;
    else if (n.kind === KIND_BRANCH || n.kind === KIND_TWIG) len *= limbLen;
    const bx = pi < 0 ? s.baseX : s.px[pi];
    const by = pi < 0 ? s.baseY : s.py[pi];
    s.px[i] = bx + Math.cos(a) * len;
    s.py[i] = by + Math.sin(a) * len;
    s.rad[i] = n.kind === KIND_SHOOT ? n.r * (0.4 + 0.6 * vis) : n.r * radScale * (0.35 + 0.65 * vis);
  }
}

/** [centerX, centerY, scale, tiltRadians] of a foliage pad this frame. */
export function padPose(s: SimState, pad: Pad): [number, number, number, number] {
  'worklet';
  const cfg = BonsaiConfig;
  const scale =
    s.vis[pad.node] * lerp(0.7, 1, s.g) * lerp(cfg.vitality.minVolume, 1, s.v);
  const tilt =
    cfg.sway.padTiltFollow * (s.pa[pad.node] - s.ra[pad.node]) +
    Math.sin(s.time * 0.9 + pad.phase) * 0.02 * s.energy;
  return [s.px[pad.node], s.py[pad.node] - pad.ry * 0.32 * scale, scale, tilt];
}

export function spawnParticle(
  s: SimState, kind: number, x: number, y: number, vx: number, vy: number, size: number, life: number
) {
  'worklet';
  if (s.particles.length >= BonsaiConfig.particles.max) s.particles.shift();
  s.particles.push({
    x, y, vx, vy,
    rot: hash(s.counter++) * Math.PI * 2,
    vr: (hash(s.counter++) - 0.5) * 5,
    life, maxLife: life, kind,
    size: size * (0.8 + hash(s.counter++) * 0.4),
    phase: hash(s.counter++) * 6.28,
    landed: false,
  });
}

function updateParticles(s: SimState, dt: number) {
  'worklet';
  const P = BonsaiConfig.particles;
  const soilY = BonsaiConfig.world.baseY + 4;
  const next = [];
  for (let i = 0; i < s.particles.length; i++) {
    const p = s.particles[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    if (p.kind === PARTICLE_SPARKLE) {
      p.vy -= 18 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.97;
    } else if (!p.landed) {
      // A falling leaf: light gravity, air drag, and a side-to-side tumble.
      p.vy += P.gravity * dt;
      p.vx += Math.sin(s.time * 3.1 + p.phase) * 70 * dt;
      p.vx *= Math.pow(P.drag, dt * 10);
      p.vy *= Math.pow(P.drag, dt * 6);
      p.rot += (p.vr + p.vx * 0.02) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const onSoil = Math.abs(p.x - 500) < 190 && p.y > soilY && p.y < soilY + 20;
      if (onSoil || p.y > 905) {
        p.landed = true;
        p.life = Math.min(p.life, 2.2);
      }
    }
    next.push(p);
  }
  s.particles = next;
}

/** Advance the living tree by dt seconds: ease state, wind + springs, pose, particles. */
export function stepSim(s: SimState, tree: Tree, targets: SimTargets, dt: number) {
  'worklet';
  const cfg = BonsaiConfig;
  if (s.seed !== tree.seed || s.ang.length !== tree.nodes.length) {
    const fresh = createSimState(tree, targets);
    Object.assign(s, fresh);
  }
  dt = clamp(dt, 0.001, 0.05);
  s.fps = lerp(s.fps, 1 / dt, 0.05);

  // ---- Ease the drawn condition toward the requested one.
  const tr = cfg.transition;
  s.g += (targets.growth - s.g) * approach(dt, tr.growthTau);
  s.o += (targets.overgrowth - s.o) * approach(dt, tr.overgrowthTau);
  s.v += (targets.vitality - s.v) * approach(dt, tr.vitalityTau);
  s.ambient += ((targets.ambient ? 1 : 0) - s.ambient) * approach(dt, 0.6);
  const er = cfg.sway.energyRange;
  s.energy = cfg.sway.wind * s.ambient * lerp(er[0], er[1], s.v);

  // ---- Physics in fixed-ish substeps for stability.
  const steps = Math.ceil(dt / (1 / 60) - 0.01);
  const h = dt / steps;
  for (let k = 0; k < steps; k++) {
    s.time += h;
    integrate(s, tree, h);
  }

  // ---- Pot squash spring.
  s.potVel += (-260 * s.pot - 11 * s.potVel) * dt;
  s.pot += s.potVel * dt;

  pose(s, tree);

  // ---- Touch rustle decays.
  for (let i = 0; i < s.rustle.length; i++) {
    s.rustle[i] *= Math.exp(-dt * cfg.touch.rustleDecay);
  }
  s.pulse = Math.max(0, s.pulse - dt * 0.55);

  // ---- Pruning: shoots that pull back drop clippings.
  for (let li = 0; li < tree.limbs.length; li++) {
    const limb = tree.limbs[li];
    if (limb.kind !== KIND_SHOOT) continue;
    const tip = limb.nodes[limb.nodes.length - 1];
    const v = s.vis[limb.nodes[0]];
    if (v > s.limbPeak[li]) {
      s.limbPeak[li] = v;
    } else if (s.limbPeak[li] - v > 0.3) {
      s.limbPeak[li] = v;
      const n = 1 + Math.floor(hash(s.counter++) * 2);
      for (let c = 0; c < n; c++) {
        spawnParticle(s, PARTICLE_CLIPPING, s.px[tip], s.py[tip], (hash(s.counter++) - 0.5) * 80, -40 - hash(s.counter++) * 50, 10, 3.2);
      }
    }
  }

  // ---- Low vitality sheds the occasional leaf.
  const fall = cfg.vitality.leafFallRate * (1 - s.v) * (1 - s.v) * (0.3 + 0.7 * s.ambient);
  s.leafFallAcc += fall * dt;
  while (s.leafFallAcc >= 1) {
    s.leafFallAcc -= 1;
    const pad = tree.pads[Math.floor(hash(s.counter++) * tree.pads.length)];
    const p = padPose(s, pad);
    if (p[2] > 0.2) {
      spawnParticle(
        s, PARTICLE_LEAF,
        p[0] + (hash(s.counter++) - 0.5) * pad.rx * 1.4 * p[2],
        p[1] + pad.ry * 0.3 * p[2],
        (hash(s.counter++) - 0.3) * 30, 5, 9, 6
      );
    }
  }

  updateParticles(s, dt);
}

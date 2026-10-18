import { BonsaiConfig } from '../config';
import { createRandom, Random } from './random';

/**
 * Deterministic bonsai skeleton. Generated once per seed on the JS thread and
 * then handed to UI-thread worklets as plain data. Nothing here animates; the
 * renderer poses this skeleton every frame (forward kinematics) and decides how
 * much of it is visible from the current growth / overgrowth / vitality.
 */

export const KIND_TRUNK = 0;
export const KIND_BRANCH = 1;
export const KIND_TWIG = 2;
export const KIND_SHOOT = 3;

export interface TreeNode {
  /** Parent node index; -1 means the trunk base. Parents always come first. */
  parent: number;
  /** Rest angle relative to the parent's absolute angle. */
  rel: number;
  /** Length at full growth. */
  len: number;
  /** Radius at the end of this segment, at full growth. */
  r: number;
  kind: number;
  /** Growth value at which this segment starts to appear (structure nodes). */
  birth: number;
  /** Overgrowth value at which this segment starts to appear (shoots), else -1. */
  ogBirth: number;
  span: number;
  phase: number;
  /** -1 left, +1 right, 0 behind. Used for droop and debug. */
  side: number;
}

export interface Limb {
  nodes: number[];
  /** Radius where the limb leaves its parent, at full growth. */
  startRadius: number;
  kind: number;
  back: boolean;
}

export interface Puff {
  x: number;
  y: number;
  r: number;
  /** Unit direction the puff drifts as the pad gets overgrown. */
  dx: number;
  dy: number;
  /** -1 for a groomed puff; otherwise the overgrowth at which this stray appears. */
  og: number;
  top: boolean;
}

export interface Scallop {
  puff: number;
  x: number;
  y: number;
  r: number;
  top: boolean;
  phase: number;
  /** Thinned away when vitality is low (higher = goes first). */
  thin: number;
}

export interface Pad {
  node: number;
  rx: number;
  ry: number;
  puffs: Puff[];
  scallops: Scallop[];
  back: boolean;
  phase: number;
}

export interface ShootLeaf {
  node: number;
  /** Position along the segment, 0..1. */
  t: number;
  side: number;
  size: number;
  angle: number;
  phase: number;
}

export interface Root {
  angle: number;
  len: number;
  r: number;
}

export interface Tree {
  seed: number;
  nodes: TreeNode[];
  limbs: Limb[];
  pads: Pad[];
  shootLeaves: ShootLeaf[];
  roots: Root[];
  moss: { x: number; r: number; tone: number }[];
}

const UP = -Math.PI / 2;

export function generateTree(seed: number): Tree {
  const cfg = BonsaiConfig;
  const rng = createRandom(seed * 9973 + 17);
  const nodes: TreeNode[] = [];
  const limbs: Limb[] = [];
  const pads: Pad[] = [];
  const shootLeaves: ShootLeaf[] = [];
  /** Absolute rest angle of every node, used only while generating. */
  const abs: number[] = [];

  const addNode = (
    parent: number,
    absAngle: number,
    n: Omit<TreeNode, 'parent' | 'rel' | 'phase'>
  ) => {
    const parentAbs = parent < 0 ? UP : abs[parent];
    nodes.push({ ...n, parent, rel: absAngle - parentAbs, phase: rng.range(0, Math.PI * 2) });
    abs.push(absAngle);
    return nodes.length - 1;
  };

  // ---- Trunk: an S-curved informal upright (moyogi), balanced over the base.
  const t = cfg.trunk;
  const curvePhase = rng.range(-0.6, 0.6);
  const trunkDirs: number[] = [];
  const trunkLens: number[] = [];
  for (let k = 0; k < t.segments; k++) {
    const damp = 1 - (0.35 * k) / t.segments;
    trunkDirs.push(UP + t.curveAmplitude * damp * Math.sin(k * t.curveFrequency + curvePhase));
    trunkLens.push((t.firstSegmentLength - t.lengthFalloff * k) * rng.range(0.92, 1.08));
  }
  // Lean the whole trunk so the apex sits roughly over the roots.
  let dx = 0;
  let total = 0;
  trunkDirs.forEach((d, k) => {
    dx += Math.cos(d) * trunkLens[k];
    total += trunkLens[k];
  });
  const lean = -Math.asin(Math.max(-0.5, Math.min(0.5, dx / total))) * 0.85 + rng.range(-0.04, 0.04);

  const trunk: number[] = [];
  let prev = -1;
  for (let k = 0; k < t.segments; k++) {
    const f = Math.pow(k / (t.segments - 1), 0.85);
    const young = k < t.youngSegments;
    prev = addNode(prev, trunkDirs[k] + lean, {
      len: trunkLens[k],
      r: t.baseRadius + (t.tipRadius - t.baseRadius) * f,
      kind: KIND_TRUNK,
      birth: young ? -1 : (k - t.youngSegments + 1) * 0.11,
      ogBirth: -1,
      span: 0.16,
      side: 0,
    });
    trunk.push(prev);
  }
  limbs.push({ nodes: trunk, startRadius: t.baseRadius * 1.08, kind: KIND_TRUNK, back: false });

  // ---- Primary branches and twigs, each ending in a foliage pad.
  const b = cfg.branches;
  const padNodes: { node: number; kind: 'primary' | 'twig' | 'apex'; back: boolean; dir: number }[] = [];
  b.layout.forEach((spec, i) => {
    const trunkNode = trunk[spec.at];
    const back = spec.side === 0;
    const side = back ? rng.sign() : spec.side;
    const lowness = 1 - i / (b.layout.length - 1);
    let length = (b.highLength + (b.lowLength - b.highLength) * lowness) * rng.range(0.9, 1.1);
    if (back) length *= b.backScale;
    // Lower branches run nearly level, higher ones lift; back branches rise steeply.
    const lift = back ? rng.range(0.45, 0.7) : 0.06 + (1 - lowness) * 0.32 + rng.range(-0.06, 0.06);
    let dir = side > 0 ? -lift : Math.PI + lift;
    const segShare = [0.42, 0.33, 0.25];
    const parentR = nodes[trunkNode].r;
    const startR = Math.min(parentR * 0.62, 20 * (0.6 + lowness * 0.5));
    const limb: number[] = [];
    let p = trunkNode;
    segShare.forEach((share, j) => {
      // Gentle zig-zag, with the tip turning up toward the light.
      const wiggle = (j % 2 === 0 ? 1 : -1) * rng.range(0.1, 0.24) * side;
      dir += j === 0 ? 0 : wiggle - side * 0.08 * j;
      const r = startR * (1 - (j + 1) * 0.24);
      p = addNode(p, dir, {
        len: length * share,
        r,
        kind: KIND_BRANCH,
        birth: spec.birth + j * 0.04,
        ogBirth: -1,
        span: 0.14,
        side,
      });
      limb.push(p);
      // Secondary twigs from the inner nodes.
      if (j < 2 && rng.next() < b.twigChance) {
        const upward = side > 0 ? -1 : 1; // rotate toward "up" for this side
        const twigDir = dir + upward * rng.range(0.5, 0.9);
        const twigLen = rng.range(b.twigLength[0], b.twigLength[1]) * (back ? 0.7 : 1);
        const tb = spec.birth + 0.12 + rng.range(0.05, 0.3);
        const t1 = addNode(p, twigDir, {
          len: twigLen * 0.55, r: r * 0.55, kind: KIND_TWIG, birth: tb, ogBirth: -1, span: 0.14, side,
        });
        const t2 = addNode(t1, twigDir - upward * rng.range(0.1, 0.3), {
          len: twigLen * 0.45, r: r * 0.35, kind: KIND_TWIG, birth: tb + 0.04, ogBirth: -1, span: 0.14, side,
        });
        limbs.push({ nodes: [t1, t2], startRadius: r * 0.75, kind: KIND_TWIG, back });
        padNodes.push({ node: t2, kind: 'twig', back, dir: twigDir });
      }
    });
    limbs.push({ nodes: limb, startRadius: startR, kind: KIND_BRANCH, back });
    padNodes.push({ node: p, kind: 'primary', back, dir });
  });

  // ---- Apex: the trunk tip plus two small crown twigs.
  const tip = trunk[trunk.length - 1];
  padNodes.push({ node: tip, kind: 'apex', back: false, dir: UP });
  [-1, 1].forEach((s) => {
    const d = UP + s * rng.range(0.6, 0.95);
    const n1 = addNode(tip, d, {
      len: rng.range(38, 55), r: t.tipRadius * 0.55, kind: KIND_TWIG, birth: 0.5 + rng.range(0, 0.2),
      ogBirth: -1, span: 0.14, side: s,
    });
    limbs.push({ nodes: [n1], startRadius: t.tipRadius * 0.7, kind: KIND_TWIG, back: false });
    padNodes.push({ node: n1, kind: 'twig', back: false, dir: d });
  });

  // ---- Foliage pads.
  for (const pn of padNodes) {
    const size = cfg.pads[pn.kind];
    const scale = rng.range(0.9, 1.1);
    pads.push(makePad(rng, pn.node, size.rx * scale, size.ry * scale, pn.back));
  }
  // Back pads first, apex last, so the painter's order reads front-to-back.
  pads.sort((a, c) => (a.back === c.back ? 0 : a.back ? -1 : 1));

  // ---- Overgrowth shoots: whips from pads, leaders extending branches, water sprouts.
  const og = cfg.overgrowth;
  const addShoot = (from: number, dir: number, length: number, birth: number, side: number) => {
    const segs = 3;
    const limb: number[] = [];
    let p = from;
    let d = dir;
    for (let j = 0; j < segs; j++) {
      d += rng.range(-0.32, 0.32) - (j > 0 ? 0.06 * Math.cos(d) : 0);
      p = addNode(p, d, {
        len: (length / segs) * rng.range(0.85, 1.15),
        r: 2.6 * (1 - (j + 1) * 0.26),
        kind: KIND_SHOOT,
        birth: -1,
        ogBirth: birth + j * 0.05,
        span: 0.12,
        side,
      });
      limb.push(p);
      const leaves = j === 0 ? 1 : 2;
      for (let l = 0; l < leaves; l++) {
        shootLeaves.push({
          node: p,
          t: leaves === 1 ? 0.8 : 0.45 + l * 0.5,
          side: l % 2 === 0 ? 1 : -1,
          size: rng.range(9, 14) * (j === segs - 1 ? 0.8 : 1),
          angle: rng.range(0.55, 0.95),
          phase: rng.range(0, Math.PI * 2),
        });
      }
    }
    limbs.push({ nodes: limb, startRadius: 3, kind: KIND_SHOOT, back: false });
  };

  for (const pn of padNodes) {
    const count = rng.int(og.shootsPerPad[0], og.shootsPerPad[1]);
    for (let s = 0; s < count; s++) {
      // Mostly upward/outward whips; the first shoot of a primary pad extends the branch.
      const leader = pn.kind === 'primary' && s === 0;
      const dir = leader
        ? pn.dir + rng.range(-0.2, 0.15)
        : UP + rng.range(-1.25, 1.25);
      const len = rng.range(og.shootLength[0], og.shootLength[1]) * (leader ? 1.2 : 1);
      addShoot(pn.node, dir, len, rng.range(0.08, 0.85), Math.cos(dir) > 0 ? 1 : -1);
    }
  }
  for (let w = 0; w < og.waterSprouts; w++) {
    const at = trunk[1 + w];
    addShoot(at, UP + rng.range(-0.5, 0.5), rng.range(70, 120), rng.range(0.5, 0.85), rng.sign());
  }

  // ---- Surface roots (nebari) and moss on the soil.
  const roots: Root[] = [];
  [-1, 1].forEach((s) => {
    roots.push({ angle: s > 0 ? rng.range(0.05, 0.2) : Math.PI - rng.range(0.05, 0.2), len: rng.range(70, 95), r: 20 });
    roots.push({ angle: s > 0 ? rng.range(0.25, 0.45) : Math.PI - rng.range(0.25, 0.45), len: rng.range(40, 60), r: 13 });
  });
  const moss = Array.from({ length: 16 }, () => ({
    x: rng.range(-190, 190),
    r: rng.range(7, 16),
    tone: rng.next(),
  }));

  return { seed, nodes, limbs, pads, shootLeaves, roots, moss };
}

function makePad(rng: Random, node: number, rx: number, ry: number, back: boolean): Pad {
  const cfg = BonsaiConfig.pads;
  const puffs: Puff[] = [];
  const addPuff = (x: number, y: number, r: number, og: number, top: boolean) => {
    // Drift outward from the pad's centre, with some randomness.
    let ddx = x / rx + rng.range(-0.4, 0.4);
    let ddy = (y + ry * 0.1) / ry - rng.range(0.2, 0.7);
    const m = Math.hypot(ddx, ddy) || 1;
    ddx /= m;
    ddy /= m;
    puffs.push({ x, y, r, dx: ddx, dy: ddy, og, top });
  };

  const nBottom = Math.max(3, Math.round(rx / 17));
  for (let i = 0; i < nBottom; i++) {
    const u = -1 + (2 * i) / (nBottom - 1);
    addPuff(u * rx * 0.76 + rng.range(-3, 3), ry * 0.14 + rng.range(-3, 3), ry * rng.range(0.56, 0.7) * (1 - 0.22 * Math.abs(u)), -1, false);
  }
  const nTop = Math.max(2, nBottom - 1);
  for (let i = 0; i < nTop; i++) {
    const u = -1 + (2 * i) / (nTop - 1);
    addPuff(u * rx * 0.48 + rng.range(-4, 4), -ry * 0.3 + rng.range(-3, 3), ry * rng.range(0.62, 0.78), -1, true);
  }
  addPuff(rng.range(-0.2, 0.2) * rx, -ry * 0.62, ry * rng.range(0.5, 0.62), -1, true);

  for (let i = 0; i < cfg.strayPuffs; i++) {
    const a = rng.range(-Math.PI * 1.05, Math.PI * 0.05);
    const d = rng.range(0.8, 1.08);
    addPuff(Math.cos(a) * rx * d, Math.sin(a) * ry * d * 1.4 - ry * 0.15, ry * rng.range(0.34, 0.52), rng.range(0.12, 0.92), true);
  }

  // Small leaf clumps on the outer edge of each puff give the silhouette its
  // scalloped, leafy texture (and are what flutters).
  const scallops: Scallop[] = [];
  puffs.forEach((p, pi) => {
    const out = Math.atan2(p.y + ry * 0.1, p.x);
    const count = p.og < 0 ? 6 : 4;
    for (let k = 0; k < count; k++) {
      const a = out + rng.range(-1.5, 1.5);
      const x = p.x + Math.cos(a) * p.r * 0.9;
      const y = p.y + Math.sin(a) * p.r * 0.9;
      const hidden = puffs.some(
        (o, oi) => oi !== pi && o.og < 0 && Math.hypot(x - o.x, y - o.y) < o.r * 0.82
      );
      if (hidden && p.og < 0) continue;
      scallops.push({
        puff: pi,
        x: x - p.x,
        y: y - p.y,
        r: rng.range(cfg.scallopRadius[0], cfg.scallopRadius[1]),
        top: y < -ry * 0.12,
        phase: rng.range(0, Math.PI * 2),
        thin: rng.next(),
      });
    }
  });

  return { node, rx, ry, puffs, scallops, back, phase: rng.range(0, Math.PI * 2) };
}

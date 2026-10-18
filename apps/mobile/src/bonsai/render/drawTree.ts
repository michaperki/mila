import {
  PaintStyle,
  SkCanvas,
  SkPaint,
  SkPath,
  Skia,
  StrokeCap,
  TileMode,
} from '@shopify/react-native-skia';
import { BonsaiConfig } from '../config';
import { KIND_SHOOT, KIND_TRUNK, Tree } from '../geometry/generateTree';
import { lerp, smoothstep } from '../math';
import { PARTICLE_CLIPPING, PARTICLE_SPARKLE, SimState } from '../sim/state';
import { padPose } from '../sim/step';
import { drawMoss, drawPot } from './drawPot';
import { mix, Palette, rgba } from './palette';

const LIGHT_X = -0.6;
const LIGHT_Y = -0.8;

// ---------------------------------------------------------------- wood

/**
 * Closed outline between two offsets (a, b in units of local radius) along a
 * smoothed centerline: (-1, 1) is the full limb, narrower bands are shading.
 */
function bandPath(
  xs: number[], ys: number[], nx: number[], ny: number[], tx: number[], ty: number[],
  rs: number[], a: number, b: number, cap: boolean, upTo: number
): SkPath {
  'worklet';
  const path = Skia.PathBuilder.Make();
  const n = upTo;
  const L = n - 1;
  path.moveTo(xs[0] + nx[0] * rs[0] * b, ys[0] + ny[0] * rs[0] * b);
  for (let i = 1; i < n; i++) {
    const x = xs[i] + nx[i] * rs[i] * b;
    const y = ys[i] + ny[i] * rs[i] * b;
    if (i < L) {
      const x2 = xs[i + 1] + nx[i + 1] * rs[i + 1] * b;
      const y2 = ys[i + 1] + ny[i + 1] * rs[i + 1] * b;
      path.quadTo(x, y, (x + x2) / 2, (y + y2) / 2);
    } else path.lineTo(x, y);
  }
  const ax = xs[L] + nx[L] * rs[L] * a;
  const ay = ys[L] + ny[L] * rs[L] * a;
  if (cap) {
    const m = (a + b) / 2;
    path.quadTo(
      xs[L] + tx[L] * rs[L] * 1.5 + nx[L] * rs[L] * m,
      ys[L] + ty[L] * rs[L] * 1.5 + ny[L] * rs[L] * m,
      ax, ay
    );
  } else path.lineTo(ax, ay);
  for (let i = L - 1; i >= 0; i--) {
    const x = xs[i] + nx[i] * rs[i] * a;
    const y = ys[i] + ny[i] * rs[i] * a;
    if (i > 0) {
      const x2 = xs[i - 1] + nx[i - 1] * rs[i - 1] * a;
      const y2 = ys[i - 1] + ny[i - 1] * rs[i - 1] * a;
      path.quadTo(x, y, (x + x2) / 2, (y + y2) / 2);
    } else path.lineTo(x, y);
  }
  path.close();
  return path.build();
}

function linePath(xs: number[], ys: number[], nx: number[], ny: number[], rs: number[], off: number, from: number, to: number): SkPath {
  'worklet';
  const path = Skia.PathBuilder.Make();
  path.moveTo(xs[from] + nx[from] * rs[from] * off, ys[from] + ny[from] * rs[from] * off);
  for (let i = from + 1; i < to; i++) {
    const x = xs[i] + nx[i] * rs[i] * off;
    const y = ys[i] + ny[i] * rs[i] * off;
    const x2 = xs[i + 1] + nx[i + 1] * rs[i + 1] * off;
    const y2 = ys[i + 1] + ny[i + 1] * rs[i + 1] * off;
    path.quadTo(x, y, (x + x2) / 2, (y + y2) / 2);
  }
  return path.build();
}

function drawLimb(canvas: SkCanvas, tree: Tree, s: SimState, li: number, paint: SkPaint) {
  'worklet';
  const P = Palette;
  const limb = tree.limbs[li];
  const first = limb.nodes[0];
  if (s.vis[first] < 0.004) return;
  const isShoot = limb.kind === KIND_SHOOT;
  const isTrunk = limb.kind === KIND_TRUNK;
  const radScale = lerp(BonsaiConfig.trunk.youngRadiusScale, 1, s.g);

  const xs: number[] = [];
  const ys: number[] = [];
  const rs: number[] = [];
  const pi = tree.nodes[first].parent;
  xs.push(pi < 0 ? s.baseX : s.px[pi]);
  ys.push(pi < 0 ? s.baseY + 4 : s.py[pi]);
  const v0 = s.vis[first];
  rs.push(isShoot ? limb.startRadius * (0.4 + 0.6 * v0) : limb.startRadius * radScale * (0.35 + 0.65 * v0) * (isTrunk ? 1.2 : 1));
  for (let k = 0; k < limb.nodes.length; k++) {
    const nd = limb.nodes[k];
    if (s.vis[nd] < 0.004) break;
    const lx = xs[xs.length - 1];
    const ly = ys[ys.length - 1];
    if (Math.abs(s.px[nd] - lx) + Math.abs(s.py[nd] - ly) < 0.8) continue;
    xs.push(s.px[nd]);
    ys.push(s.py[nd]);
    rs.push(s.rad[nd]);
  }
  const n = xs.length;
  if (n < 2) return;

  const nx: number[] = [];
  const ny: number[] = [];
  const tx: number[] = [];
  const ty: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i > 0 ? i - 1 : 0;
    const b = i < n - 1 ? i + 1 : n - 1;
    let dx = xs[b] - xs[a];
    let dy = ys[b] - ys[a];
    const m = Math.hypot(dx, dy) || 1;
    dx /= m;
    dy /= m;
    tx.push(dx);
    ty.push(dy);
    nx.push(-dy);
    ny.push(dx);
  }
  // Which side of this limb faces the light (upper left).
  let ax = xs[n - 1] - xs[0];
  let ay = ys[n - 1] - ys[0];
  const am = Math.hypot(ax, ay) || 1;
  ax /= am;
  ay /= am;
  const lit = -ay * LIGHT_X + ax * LIGHT_Y > 0 ? 1 : -1;

  const shade = limb.back ? 0.72 : 1;
  paint.setStyle(PaintStyle.Fill);
  if (isShoot) {
    paint.setColor(mix(P.shootWood, P.newGrowth[1], 0.25, 0.9 + 0.2 * s.v));
    canvas.drawPath(bandPath(xs, ys, nx, ny, tx, ty, rs, -1, 1, true, n), paint);
    return;
  }
  paint.setColor(rgba(P.bark, shade));
  canvas.drawPath(bandPath(xs, ys, nx, ny, tx, ty, rs, -1, 1, true, n), paint);
  paint.setColor(rgba(P.barkDark, shade, 0.9));
  canvas.drawPath(bandPath(xs, ys, nx, ny, tx, ty, rs, -lit, -lit * 0.4, false, n), paint);
  paint.setColor(rgba(P.barkLight, shade, 0.85));
  canvas.drawPath(bandPath(xs, ys, nx, ny, tx, ty, rs, lit * 0.12, lit * 0.62, false, n), paint);

  if (isTrunk && n > 3) {
    // Bark ridges, more pronounced as the tree matures.
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeCap(StrokeCap.Round);
    paint.setStrokeWidth(1.4 + 1.4 * s.g);
    const to = Math.max(2, Math.floor(n * 0.75));
    paint.setColor(rgba(P.barkDark, 1, 0.22 + 0.25 * s.g));
    canvas.drawPath(linePath(xs, ys, nx, ny, rs, -0.5 * lit, 0, to), paint);
    canvas.drawPath(linePath(xs, ys, nx, ny, rs, 0.02 * lit, 1, to - 1), paint);
    paint.setColor(rgba(P.barkLight, 1.1, 0.25 + 0.2 * s.g));
    canvas.drawPath(linePath(xs, ys, nx, ny, rs, 0.4 * lit, 0, Math.max(2, to - 2)), paint);
    paint.setStyle(PaintStyle.Fill);
  }
}

/** Surface roots (nebari) flaring over the soil. */
function drawRoots(canvas: SkCanvas, tree: Tree, s: SimState, paint: SkPaint) {
  'worklet';
  const P = Palette;
  const radScale = lerp(BonsaiConfig.trunk.youngRadiusScale, 1, s.g);
  const show = 0.45 + 0.55 * s.g;
  for (let ri = 0; ri < tree.roots.length; ri++) {
    const r = tree.roots[ri];
    const len = r.len * show;
    const rad = r.r * radScale;
    const ex = s.baseX + Math.cos(r.angle) * len;
    const ey = s.baseY + 6 + Math.abs(Math.sin(r.angle)) * len * 0.12;
    const dir = Math.cos(r.angle) > 0 ? 1 : -1;
    const path = Skia.PathBuilder.Make();
    path.moveTo(s.baseX, s.baseY - rad * 1.6);
    path.quadTo(s.baseX + dir * len * 0.35, s.baseY - rad * 0.3, ex, ey);
    path.quadTo(s.baseX + dir * len * 0.4, s.baseY + rad * 0.9, s.baseX, s.baseY + rad * 0.5);
    path.close();
    paint.setColor(rgba(P.bark, 0.95));
    canvas.drawPath(path.build(), paint);
    const top = Skia.PathBuilder.Make();
    top.moveTo(s.baseX, s.baseY - rad * 1.5);
    top.quadTo(s.baseX + dir * len * 0.35, s.baseY - rad * 0.25, ex, ey);
    top.quadTo(s.baseX + dir * len * 0.3, s.baseY - rad * 0.05, s.baseX, s.baseY - rad * 0.6);
    top.close();
    paint.setColor(rgba(P.barkLight, 0.95, 0.7));
    canvas.drawPath(top.build(), paint);
  }
}

// ---------------------------------------------------------------- foliage

function drawPad(canvas: SkCanvas, tree: Tree, s: SimState, pi: number, paint: SkPaint) {
  'worklet';
  const P = Palette;
  const cfg = BonsaiConfig;
  const pad = tree.pads[pi];
  const pose = padPose(s, pad);
  const sc = pose[2];
  if (sc < 0.02) return;
  const v = s.v;
  const o = s.o;
  const t = s.time;
  const rustle = s.rustle[pi];
  const shade = pad.back ? 0.78 : 1;
  const drift = cfg.overgrowth.puffDrift * o;
  const flutterAmp = (0.9 + 1.6 * s.energy) * cfg.sway.flutter + rustle * 5;
  const flutterFreq = 2.2 + 2.2 * v + rustle * 9;
  const breathe = 1 + Math.sin(t * 1.3 + pad.phase) * 0.012 * s.energy;
  const thinCut = 0.35 + 0.8 * v;

  canvas.save();
  canvas.translate(pose[0], pose[1]);
  canvas.rotate(((pose[3] + Math.sin(t * 13 + pad.phase) * 0.04 * rustle) * 180) / Math.PI, 0, 0);
  canvas.scale(sc * (1 + rustle * 0.03), sc * breathe);

  const dark = mix(P.foliageDark[0], P.foliageDark[1], v, shade);
  const base = mix(P.foliageBase[0], P.foliageBase[1], v, shade);
  const light = mix(P.foliageLight[0], P.foliageLight[1], v, shade);
  const spec = mix(P.foliageSpec[0], P.foliageSpec[1], v, shade, 0.9);
  const fresh = mix(P.newGrowth[0], P.newGrowth[1], v, shade);
  const puffs = pad.puffs;
  const rx = pad.rx;

  // Resolve each puff's current position and size once.
  const pxs: number[] = [];
  const pys: number[] = [];
  const prs: number[] = [];
  for (let i = 0; i < puffs.length; i++) {
    const p = puffs[i];
    const grow = p.og < 0 ? 1 : smoothstep(p.og, p.og + 0.18, o);
    pxs.push(p.x + p.dx * drift * rx * 0.5);
    pys.push(p.y + p.dy * drift * pad.ry * 0.7);
    prs.push(p.r * grow * (p.og < 0 ? 1 + 0.12 * o : 1));
  }

  // 1. shadow underside
  paint.setColor(dark);
  for (let i = 0; i < puffs.length; i++) {
    if (prs[i] < 0.5) continue;
    canvas.drawCircle(pxs[i], pys[i] + prs[i] * 0.22, prs[i] * 1.04, paint);
  }
  // 2. leafy clumps on the lower edge
  const sc0 = pad.scallops;
  for (let k = 0; k < sc0.length; k++) {
    const c = sc0[k];
    if (c.top || c.thin > thinCut || prs[c.puff] < 0.5) continue;
    const f = Math.sin(t * flutterFreq + c.phase);
    canvas.drawCircle(
      pxs[c.puff] + c.x + f * flutterAmp * 0.6,
      pys[c.puff] + c.y + Math.cos(t * flutterFreq * 0.8 + c.phase) * flutterAmp * 0.4,
      c.r * (prs[c.puff] / puffs[c.puff].r), paint
    );
  }
  // 3. body
  for (let i = 0; i < puffs.length; i++) {
    if (prs[i] < 0.5) continue;
    paint.setColor(puffs[i].og < 0 ? base : fresh);
    canvas.drawCircle(pxs[i], pys[i], prs[i], paint);
  }
  // 4. lit clumps on the upper edge
  paint.setColor(light);
  for (let k = 0; k < sc0.length; k++) {
    const c = sc0[k];
    if (!c.top || c.thin > thinCut || prs[c.puff] < 0.5) continue;
    const f = Math.sin(t * flutterFreq + c.phase);
    canvas.drawCircle(
      pxs[c.puff] + c.x + f * flutterAmp * 0.7,
      pys[c.puff] + c.y + Math.cos(t * flutterFreq * 0.9 + c.phase) * flutterAmp * 0.5,
      c.r * (prs[c.puff] / puffs[c.puff].r), paint
    );
  }
  // 5. top-lit highlights and specular flecks
  for (let i = 0; i < puffs.length; i++) {
    if (!puffs[i].top || prs[i] < 0.5) continue;
    paint.setColor(puffs[i].og < 0 ? light : mix(P.newGrowth[0], P.newGrowth[1], v, 1.15 * shade));
    canvas.drawCircle(pxs[i] - prs[i] * 0.18, pys[i] - prs[i] * 0.26, prs[i] * 0.6, paint);
  }
  paint.setColor(spec);
  const specCut = 0.4 + 0.6 * v;
  for (let i = 0; i < puffs.length; i++) {
    if (!puffs[i].top || prs[i] < 0.5 || (i * 0.37) % 1 > specCut) continue;
    const tw = 1 + Math.sin(t * 2 + i) * 0.08 * s.energy;
    canvas.drawCircle(pxs[i] - prs[i] * 0.32, pys[i] - prs[i] * 0.44, prs[i] * 0.2 * tw, paint);
  }
  canvas.restore();
}

function drawShootLeaves(canvas: SkCanvas, tree: Tree, s: SimState, paint: SkPaint) {
  'worklet';
  const P = Palette;
  const lit = Skia.PathBuilder.Make();
  const shadow = Skia.PathBuilder.Make();
  const t = s.time;
  const e = s.energy;
  const leaves = tree.shootLeaves;
  for (let i = 0; i < leaves.length; i++) {
    const lf = leaves[i];
    const vis = s.vis[lf.node];
    const grow = smoothstep(lf.t * 0.5, lf.t * 0.5 + 0.5, vis);
    if (grow < 0.05) continue;
    const pi = tree.nodes[lf.node].parent;
    const bx = s.px[pi] + (s.px[lf.node] - s.px[pi]) * lf.t;
    const by = s.py[pi] + (s.py[lf.node] - s.py[pi]) * lf.t;
    const flutter = Math.sin(t * (5 + 2 * s.v) + lf.phase) * 0.22 * (0.4 + e) + s.vel[lf.node] * 0.08;
    const droop = (1 - s.v) * 0.5;
    const a = s.pa[lf.node] + lf.side * (lf.angle + flutter) + droop * Math.cos(s.pa[lf.node]);
    const L = lf.size * grow;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const w = L * 0.36;
    const path = lf.side > 0 ? lit : shadow;
    path.moveTo(bx, by);
    path.quadTo(bx + ca * L * 0.5 - sa * w, by + sa * L * 0.5 + ca * w, bx + ca * L, by + sa * L);
    path.quadTo(bx + ca * L * 0.5 + sa * w, by + sa * L * 0.5 - ca * w, bx, by);
  }
  paint.setStyle(PaintStyle.Fill);
  paint.setColor(mix(P.newGrowth[0], P.newGrowth[1], s.v, 0.82));
  canvas.drawPath(shadow.build(), paint);
  paint.setColor(mix(P.newGrowth[0], P.newGrowth[1], s.v, 1.08));
  canvas.drawPath(lit.build(), paint);
}

// ---------------------------------------------------------------- effects

function drawGlow(canvas: SkCanvas, s: SimState, paint: SkPaint) {
  'worklet';
  if (s.pulse <= 0.01) return;
  const a = smoothstep(0, 0.25, s.pulse) * s.pulse;
  paint.setShader(
    Skia.Shader.MakeRadialGradient(
      Skia.Point(500, 430),
      420,
      [new Float32Array([1, 0.93, 0.66, 0.55 * a]), new Float32Array([1, 0.93, 0.66, 0])],
      null,
      TileMode.Clamp
    )
  );
  canvas.drawCircle(500, 430, 420, paint);
  paint.setShader(null);
}

function drawParticles(canvas: SkCanvas, s: SimState, paint: SkPaint) {
  'worklet';
  const P = Palette;
  if (s.particles.length === 0) return;
  const leaf = Skia.PathBuilder.Make()
    .moveTo(-1, 0)
    .quadTo(0, -0.42, 1, 0)
    .quadTo(0, 0.42, -1, 0)
    .close()
    .build();
  for (let i = 0; i < s.particles.length; i++) {
    const p = s.particles[i];
    const fade = Math.min(1, p.life / Math.min(1, p.maxLife * 0.5));
    if (p.kind === PARTICLE_SPARKLE) {
      const tw = 0.6 + 0.4 * Math.sin(s.time * 14 + p.phase);
      const r = p.size * tw * fade;
      paint.setColor(new Float32Array([1, 0.95, 0.75, 0.9 * fade]));
      canvas.drawOval(Skia.XYWHRect(p.x - r, p.y - r * 0.18, r * 2, r * 0.36), paint);
      canvas.drawOval(Skia.XYWHRect(p.x - r * 0.18, p.y - r, r * 0.36, r * 2), paint);
      paint.setColor(new Float32Array([1, 1, 1, fade]));
      canvas.drawCircle(p.x, p.y, r * 0.22, paint);
      continue;
    }
    const color =
      p.kind === PARTICLE_CLIPPING
        ? mix(P.newGrowth[0], P.newGrowth[1], s.v, 1, fade)
        : mix(P.fallenLeaf, P.foliageLight[1], s.v * s.v, 1, fade);
    paint.setColor(color);
    canvas.save();
    canvas.translate(p.x, p.y);
    canvas.rotate((p.rot * 180) / Math.PI, 0, 0);
    const tumble = p.landed ? 0.5 : Math.cos(s.time * 5 + p.phase);
    canvas.scale(p.size, p.size * (0.35 + 0.65 * Math.abs(tumble)));
    canvas.drawPath(leaf, paint);
    canvas.restore();
  }
}

function drawDebug(canvas: SkCanvas, tree: Tree, s: SimState, paint: SkPaint) {
  'worklet';
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(1.5);
  const colors = [
    new Float32Array([0.9, 0.2, 0.2, 0.9]),
    new Float32Array([0.95, 0.6, 0.1, 0.9]),
    new Float32Array([0.2, 0.5, 0.95, 0.9]),
    new Float32Array([0.8, 0.2, 0.8, 0.9]),
  ];
  for (let i = 0; i < tree.nodes.length; i++) {
    if (s.vis[i] < 0.01) continue;
    const n = tree.nodes[i];
    const ax = n.parent < 0 ? s.baseX : s.px[n.parent];
    const ay = n.parent < 0 ? s.baseY : s.py[n.parent];
    paint.setColor(colors[n.kind]);
    canvas.drawLine(ax, ay, s.px[i], s.py[i], paint);
    canvas.drawCircle(s.px[i], s.py[i], 2.5, paint);
  }
  paint.setColor(new Float32Array([0.1, 0.6, 0.3, 0.8]));
  for (let i = 0; i < tree.pads.length; i++) {
    const p = tree.pads[i];
    const pose = padPose(s, p);
    if (pose[2] < 0.02) continue;
    const w = p.rx * pose[2] * 1.1 + 6;
    const h = p.ry * pose[2] * 1.5 + 6;
    canvas.drawOval(Skia.XYWHRect(pose[0] - w, pose[1] - h, w * 2, h * 2), paint);
  }
  paint.setColor(new Float32Array([0.2, 0.3, 0.9, 0.5]));
  canvas.drawRect(Skia.XYWHRect(260, BonsaiConfig.world.baseY - 6, 480, 132), paint);
  paint.setStyle(PaintStyle.Fill);
}

/** Paint the whole bonsai for the current sim state. Pure drawing; no state changes. */
export function drawBonsai(canvas: SkCanvas, tree: Tree, s: SimState, debug: boolean) {
  'worklet';
  const paint = Skia.Paint();
  paint.setAntiAlias(true);

  drawPot(canvas, s, paint);
  drawGlow(canvas, s, paint);

  const limbs = tree.limbs;
  for (let i = 0; i < limbs.length; i++) {
    if (limbs[i].back && limbs[i].kind !== KIND_SHOOT) drawLimb(canvas, tree, s, i, paint);
  }
  for (let i = 0; i < tree.pads.length; i++) if (tree.pads[i].back) drawPad(canvas, tree, s, i, paint);

  drawRoots(canvas, tree, s, paint);
  for (let i = 0; i < limbs.length; i++) {
    if (!limbs[i].back && limbs[i].kind !== KIND_SHOOT) drawLimb(canvas, tree, s, i, paint);
  }
  drawMoss(canvas, tree, s, paint);
  for (let i = 0; i < tree.pads.length; i++) if (!tree.pads[i].back) drawPad(canvas, tree, s, i, paint);

  for (let i = 0; i < limbs.length; i++) {
    if (limbs[i].kind === KIND_SHOOT) drawLimb(canvas, tree, s, i, paint);
  }
  drawShootLeaves(canvas, tree, s, paint);
  drawParticles(canvas, s, paint);
  if (debug) drawDebug(canvas, tree, s, paint);
}

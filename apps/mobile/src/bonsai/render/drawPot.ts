import { BlurStyle, PaintStyle, SkCanvas, SkPaint, Skia, TileMode } from '@shopify/react-native-skia';
import type { Tree } from '../geometry/generateTree';
import type { SimState } from '../sim/state';
import { POT_BOTTOM_Y } from '../sim/step';
import { Palette, rgba } from './palette';

const CX = 500;
const RIM_Y = 772;
const RIM_RX = 228;
const RIM_RY = 26;
const K = 0.5523; // cubic ellipse constant

/**
 * Glazed oval bonsai pot with soil, drawn before the tree. The pot squashes
 * around its foot when tapped (s.pot), and the tree base rides with it.
 */
export function drawPot(canvas: SkCanvas, s: SimState, paint: SkPaint) {
  'worklet';
  const P = Palette;
  const sq = s.pot;

  // Soft contact shadow on the table.
  paint.setStyle(PaintStyle.Fill);
  paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 12, true));
  paint.setColor(new Float32Array([0.35, 0.22, 0.14, 0.22]));
  canvas.drawOval(Skia.XYWHRect(CX - 280 - sq * 8, POT_BOTTOM_Y - 4, 560 + sq * 16, 34), paint);
  paint.setColor(new Float32Array([0.3, 0.18, 0.1, 0.25]));
  canvas.drawOval(Skia.XYWHRect(CX - 220, POT_BOTTOM_Y + 2, 440, 14), paint);
  paint.setMaskFilter(null);

  canvas.save();
  canvas.translate(CX, POT_BOTTOM_Y);
  canvas.scale(1 + 0.035 * sq, 1 - 0.06 * sq);
  canvas.translate(-CX, -POT_BOTTOM_Y);

  // Feet.
  paint.setColor(rgba(P.potDark));
  for (let fi = 0; fi < 2; fi++) {
    const fx = fi === 0 ? 320 : 680;
    const f = Skia.PathBuilder.Make();
    f.moveTo(fx - 30, 868);
    f.lineTo(fx + 30, 868);
    f.lineTo(fx + 24, 889);
    f.quadTo(fx, 892, fx - 24, 889);
    f.close();
    canvas.drawPath(f.build(), paint);
  }

  // Body: from the front of the rim down to a slightly rounded foot.
  const L = CX - RIM_RX;
  const R = CX + RIM_RX;
  const bodyB = Skia.PathBuilder.Make();
  bodyB.moveTo(L, RIM_Y);
  bodyB.cubicTo(L, RIM_Y + RIM_RY * K, CX - RIM_RX * K, RIM_Y + RIM_RY, CX, RIM_Y + RIM_RY);
  bodyB.cubicTo(CX + RIM_RX * K, RIM_Y + RIM_RY, R, RIM_Y + RIM_RY * K, R, RIM_Y);
  bodyB.lineTo(R, RIM_Y + 14);
  bodyB.cubicTo(R - 4, 830, R - 14, 858, R - 34, 872);
  bodyB.cubicTo(CX + 130, 886, CX - 130, 886, L + 34, 872);
  bodyB.cubicTo(L + 14, 858, L + 4, 830, L, RIM_Y + 14);
  bodyB.close();
  const body = bodyB.build();
  paint.setShader(
    Skia.Shader.MakeLinearGradient(
      Skia.Point(L, 0),
      Skia.Point(R, 0),
      [rgba(P.potLight), rgba(P.potBody), rgba(P.potBody, 0.92), rgba(P.potDark)],
      [0, 0.28, 0.62, 1],
      TileMode.Clamp
    )
  );
  canvas.drawPath(body, paint);
  paint.setShader(null);

  // Ambient occlusion toward the foot.
  paint.setShader(
    Skia.Shader.MakeLinearGradient(
      Skia.Point(0, 820),
      Skia.Point(0, 884),
      [new Float32Array([0, 0, 0, 0]), new Float32Array([0.05, 0.08, 0.12, 0.35])],
      null,
      TileMode.Clamp
    )
  );
  canvas.drawPath(body, paint);
  paint.setShader(null);

  // Shadow under the lip and a carved band.
  paint.setStyle(PaintStyle.Stroke);
  const lipShadow = Skia.PathBuilder.Make();
  lipShadow.moveTo(L + 1, RIM_Y + 16);
  lipShadow.cubicTo(L + 1, RIM_Y + 16 + RIM_RY * K, CX - RIM_RX * K, RIM_Y + RIM_RY + 16, CX, RIM_Y + RIM_RY + 16);
  lipShadow.cubicTo(CX + RIM_RX * K, RIM_Y + RIM_RY + 16, R - 1, RIM_Y + 16 + RIM_RY * K, R - 1, RIM_Y + 16);
  paint.setStrokeWidth(5);
  paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 2.5, true));
  paint.setColor(new Float32Array([0.04, 0.08, 0.12, 0.45]));
  canvas.drawPath(lipShadow.build(), paint);
  paint.setMaskFilter(null);
  const band = Skia.PathBuilder.Make();
  band.moveTo(L + 8, 842);
  band.cubicTo(L + 60, 862, R - 60, 862, R - 8, 842);
  paint.setStrokeWidth(2);
  paint.setColor(new Float32Array([0.06, 0.1, 0.15, 0.3]));
  canvas.drawPath(band.build(), paint);
  paint.setStyle(PaintStyle.Fill);

  // Glaze highlight.
  paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 9, true));
  paint.setColor(new Float32Array([1, 1, 1, 0.2]));
  canvas.drawOval(Skia.XYWHRect(L + 46, 806, 26, 52), paint);
  paint.setColor(new Float32Array([1, 1, 1, 0.08]));
  canvas.drawOval(Skia.XYWHRect(L + 90, 812, 90, 34), paint);
  paint.setMaskFilter(null);

  // Rim top, the shaded inner wall, then the soil.
  paint.setColor(rgba(P.potRim, 1.18));
  canvas.drawOval(Skia.XYWHRect(L, RIM_Y - RIM_RY, RIM_RX * 2, RIM_RY * 2), paint);
  paint.setColor(rgba(P.potDark, 0.85));
  canvas.drawOval(Skia.XYWHRect(CX - 214, RIM_Y - 21, 428, 42), paint);
  paint.setColor(rgba(P.soil));
  canvas.drawOval(Skia.XYWHRect(CX - 208, RIM_Y - 15, 416, 36), paint);
  paint.setColor(rgba(P.soil, 1.25));
  canvas.drawOval(Skia.XYWHRect(CX - 170, RIM_Y - 6, 340, 22), paint);

  // Rim specular along the front edge.
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(2.5);
  paint.setColor(new Float32Array([1, 1, 1, 0.28]));
  const spec = Skia.PathBuilder.Make();
  spec.moveTo(L + 18, RIM_Y + 12);
  spec.cubicTo(L + 70, RIM_Y + RIM_RY + 1, CX - 60, RIM_Y + RIM_RY + 1, CX + 10, RIM_Y + RIM_RY);
  canvas.drawPath(spec.build(), paint);
  paint.setStyle(PaintStyle.Fill);

  canvas.restore();
}

/** Moss cushions on the soil, drawn after the trunk so they tuck around the roots. */
export function drawMoss(canvas: SkCanvas, tree: Tree, s: SimState, paint: SkPaint) {
  'worklet';
  const P = Palette;
  const squash = 1 - 0.06 * s.pot;
  const y0 = POT_BOTTOM_Y - (POT_BOTTOM_Y - RIM_Y) * squash;
  const vit = 0.7 + 0.3 * s.v;
  for (let layer = 0; layer < 2; layer++) {
    paint.setColor(rgba(P.moss, layer === 0 ? 0.72 * vit : 1.12 * vit));
    for (let mi = 0; mi < tree.moss.length; mi++) {
      const m = tree.moss[mi];
      const edge = Math.sqrt(Math.max(0, 1 - (m.x / 206) * (m.x / 206)));
      const y = y0 + 3 + (m.tone * 2 - 1) * 12 * edge;
      const r = m.r * (layer === 0 ? 1 : 0.62);
      canvas.drawOval(
        Skia.XYWHRect(CX + m.x - r - (layer ? 2 : 0), y - r * 0.45 - (layer ? 2 : 0), r * 2, r * 0.9),
        paint
      );
    }
  }
}

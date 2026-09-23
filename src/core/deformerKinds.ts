import { colorOf } from './cellBuffer';
import type {
  ColorRampDeformer,
  DeformContext,
  Deformer,
  GlyphPose,
  JitterDeformer,
  ScaleFalloffDeformer,
  TwistDeformer,
  WaveDeformer,
} from './deformers';
import { hashNoise } from './effects';
import { xOf, yOf } from './grid';

const TAU = Math.PI * 2;

function wave(poses: GlyphPose[], d: WaveDeformer, ctx: DeformContext): void {
  const phase = (TAU * ctx.time) / Math.max(1, d.period);
  const length = Math.max(0.01, d.wavelength);
  for (const p of poses) {
    // Смещение вдоль оси, а бежит волна поперёк: флаг колышется вверх-вниз, волна идёт вбок.
    const along = d.axis === 'y' ? p.x : p.y;
    const offset = d.amplitude * Math.sin((TAU * along) / length - phase);
    if (d.axis === 'y') p.y += offset;
    else p.x += offset;
  }
}

function jitter(poses: GlyphPose[], d: JitterDeformer, ctx: DeformContext): void {
  const tick = Math.floor(ctx.time / Math.max(1, d.period));
  const salt = Math.imul(d.seed | 0, 7919);
  for (const p of poses) {
    const x = xOf(p.key);
    const y = yOf(p.key);
    const noise = (n: number): number => hashNoise(x, y, tick * 3 + n + salt) * 2 - 1;
    p.x += d.amplitude * noise(0);
    p.y += d.amplitude * noise(1);
    p.rot += d.angle * noise(2);
  }
}

function twist(poses: GlyphPose[], d: TwistDeformer, ctx: DeformContext): void {
  const { x: cx, y: cy } = ctx.center;
  for (const p of poses) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const angle = d.strength * Math.hypot(dx, dy);
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    p.x = cx + dx * cos - dy * sin;
    p.y = cy + dx * sin + dy * cos;
    p.rot += angle;
  }
}

function scaleFalloff(poses: GlyphPose[], d: ScaleFalloffDeformer, ctx: DeformContext): void {
  const radius = Math.max(0.01, d.radius);
  for (const p of poses) {
    const u = Math.min(1, Math.hypot(p.x - ctx.center.x, p.y - ctx.center.y) / radius);
    const s = d.inner + (d.outer - d.inner) * u;
    p.sx *= s;
    p.sy *= s;
  }
}

function colorRamp(poses: GlyphPose[], d: ColorRampDeformer, ctx: DeformContext): void {
  const from = colorOf(d.from);
  const to = colorOf(d.to);
  const length = Math.max(0.01, d.length);
  const shift = d.period > 0 ? ctx.time / d.period : 0;
  const amount = Math.min(1, Math.max(0, d.amount));
  for (const p of poses) {
    const dx = xOf(p.key) + 0.5 - ctx.center.x;
    const dy = yOf(p.key) + 0.5 - ctx.center.y;
    const along = d.axis === 'x' ? dx : d.axis === 'y' ? dy : Math.hypot(dx, dy);
    const u = along / length - shift;
    // Туда и обратно: градиент замыкается, и бегущий цвет не прыгает на стыке.
    const t = 1 - Math.abs(2 * (u - Math.floor(u)) - 1);
    const k = amount;
    p.fg = {
      r: p.fg.r + (from.r + (to.r - from.r) * t - p.fg.r) * k,
      g: p.fg.g + (from.g + (to.g - from.g) * t - p.fg.g) * k,
      b: p.fg.b + (from.b + (to.b - from.b) * t - p.fg.b) * k,
      a: p.fg.a,
    };
  }
}

export function applyDeformer(poses: GlyphPose[], deformer: Deformer, ctx: DeformContext): void {
  switch (deformer.kind) {
    case 'wave':
      return wave(poses, deformer, ctx);
    case 'jitter':
      return jitter(poses, deformer, ctx);
    case 'twist':
      return twist(poses, deformer, ctx);
    case 'scaleFalloff':
      return scaleFalloff(poses, deformer, ctx);
    case 'colorRamp':
      return colorRamp(poses, deformer, ctx);
  }
}

import { colorOf } from '../cellBuffer';
import { TRANSPARENT } from '../color';
import { FIRE_PALETTES, type FirePalette, hashNoise } from '../effects';
import { PERIOD_MAX, glyphsIn, glyphsOut, numIn } from './specs';
import { type GlyphPose, type NodeImpl, sample } from './types';

/** Ячейка в число: объект не ограничен холстом, поэтому ключ сетки с его нулём не годится. */
const cellId = (x: number, y: number): number => (y + 32768) * 65536 + (x + 32768);

interface Flame {
  value: number;
  readonly x: number;
  readonly y: number;
  readonly source: GlyphPose;
}

/** Настройки огня, у каждого символа кромки свои: входы могут быть полями. */
interface FireParams {
  readonly tick: number;
  readonly salt: number;
  readonly height: Float64Array;
  readonly wind: Float64Array;
  readonly decay: Float64Array;
  readonly width: Float64Array;
}

/**
 * Язык пламени над символом кромки `i`, в ячейках: жар падает с высотой по степени затухания,
 * язык качается по шуму на ширину и сносится ветром — чем выше, тем дальше.
 */
function tongue(s: GlyphPose, i: number, f: FireParams, heat: Map<number, Flame>): void {
  const cx = Math.floor(s.x);
  const cy = Math.floor(s.y);
  const height = Math.max(1, Math.round(f.height[i]));
  for (let d = 1; d <= height; d++) {
    const y = cy - d;
    const sway = hashNoise(cx, y, f.tick + f.salt) * 2 - 1;
    const x = cx + Math.round(sway * f.width[i] + f.wind[i] * d);
    const base = Math.pow(1 - d / (height + 1), Math.max(0.05, f.decay[i]));
    const value = base - hashNoise(x, y, f.tick + 7 + f.salt) * 0.45;
    if (value <= 0.05) continue;
    const id = cellId(x, y);
    const known = heat.get(id);
    if (!known) heat.set(id, { value, x, y, source: s });
    else known.value = Math.max(known.value, value);
  }
}

/**
 * Огонь без состояния, как огонь слоя: над каждым символом верхней кромки встаёт язык пламени,
 * кадр зависит только от такта времени, поэтому перемотка и экспорт дают то же, что проигрывание.
 * С нулевым зерном, шириной 1, без ветра и с затуханием 1 он совпадает с огнём слоя ячейка в
 * ячейку. Узел отдаёт только пламя и искры: объект сводит с ними «Объединить».
 */
export const fireNode: NodeImpl = {
  spec: {
    kind: 'fire',
    label: 'Огонь',
    category: 'generator',
    hint: 'Пламя над верхней кромкой символов: жар гаснет с высотой, языки качаются и сносятся ветром',
    inputs: [
      glyphsIn('glyphs', 'Откуда'),
      numIn('height', 'Высота', 6, 1, 32, true),
      numIn('period', 'Такт, мс', 90, 0, PERIOD_MAX),
      numIn('wind', 'Ветер', 0, -4, 4),
      numIn('decay', 'Затухание', 1, 0.25, 4),
      numIn('width', 'Ширина языков', 1, 0, 3),
      numIn('sparks', 'Искры', 0, 0, 1),
    ],
    outputs: [glyphsOut('glyphs', 'Пламя')],
    options: [
      {
        name: 'palette',
        label: 'Палитра',
        type: 'enum',
        default: 'fire',
        values: [
          { value: 'fire', label: 'огонь' },
          { value: 'ice', label: 'лёд' },
          { value: 'toxic', label: 'яд' },
        ],
      },
      { name: 'glyphs', label: 'Ряд символов', type: 'text', default: '.:*#%@', maxLength: 64 },
      {
        name: 'seed',
        label: 'Зерно',
        type: 'number',
        default: 0,
        min: 0,
        max: 2147483647,
        integer: true,
      },
    ],
  },
  run: (r) => {
    const sources = r.glyphs('glyphs').filter((p) => p.particle === null);
    const ramp = [...r.option<string>('glyphs')];
    if (sources.length === 0 || ramp.length === 0) return { glyphs: [] };
    const occupied = new Set(sources.map((p) => cellId(Math.floor(p.x), Math.floor(p.y))));
    const period = sample(r.num('period'), sources)[0];
    const [height, wind, decay, width, sparks] = ['height', 'wind', 'decay', 'width', 'sparks'].map(
      (n) => sample(r.num(n), sources),
    );
    const f: FireParams = {
      tick: period > 0 ? Math.floor(r.ctx.time / Math.max(1, period)) : 0,
      salt: Math.imul(r.option<number>('seed') | 0, 7919),
      height,
      wind,
      decay,
      width,
    };
    const heat = new Map<number, Flame>();
    const tops: number[] = [];
    sources.forEach((s, i) => {
      if (occupied.has(cellId(Math.floor(s.x), Math.floor(s.y) - 1))) return;
      tops.push(i);
      tongue(s, i, f, heat);
    });
    const palette = FIRE_PALETTES[r.option<FirePalette>('palette')];
    const out: GlyphPose[] = [];
    const push = (x: number, y: number, value: number, source: GlyphPose, glyph?: string) => {
      const level = (n: number): number => Math.min(n - 1, Math.floor(value * n));
      out.push({
        key: source.key,
        particle: out.length,
        glyph: glyph ?? ramp[level(ramp.length)],
        x: x + 0.5,
        y: y + 0.5,
        rot: 0,
        sx: 1,
        sy: 1,
        fg: colorOf(palette[level(palette.length)]),
        bg: TRANSPARENT,
        material: null,
      });
    };
    for (const flame of heat.values()) {
      if (!occupied.has(cellId(flame.x, flame.y)))
        push(flame.x, flame.y, flame.value, flame.source);
    }
    // Искры: мелкий символ ряда, но яркий, над языками; у каждого такта свои.
    for (const i of tops) {
      const s = sources[i];
      const cx = Math.floor(s.x);
      if (hashNoise(cx, f.tick, 13 + f.salt) >= sparks[i]) continue;
      const lift = Math.round(height[i]) + 1 + Math.floor(hashNoise(cx, f.tick, 17 + f.salt) * 3);
      const drift = Math.round(wind[i] * lift + hashNoise(cx, f.tick, 19 + f.salt) * 2 - 1);
      push(cx + drift, Math.floor(s.y) - lift, 0.95, s, ramp[0]);
    }
    return { glyphs: out };
  },
  animated: (node, linked) => linked('period') || (node.values.period ?? 90) > 0,
};

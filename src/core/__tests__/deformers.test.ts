import { describe, expect, it } from 'vitest';
import { TRANSPARENT } from '../color';
import {
  type Deformer,
  type GlyphPose,
  createDeformer,
  deform,
  hasActiveDeformers,
} from '../deformers';
import { keyOf } from '../grid';

const WHITE = { r: 1, g: 1, b: 1, a: 1 };

/** Символ ячейки (x, y) объекта в покое: центр ячейки, без поворота и масштаба. */
function pose(x: number, y: number): GlyphPose {
  return {
    key: keyOf(x, y),
    particle: null,
    glyph: '#',
    x: x + 0.5,
    y: y + 0.5,
    rot: 0,
    sx: 1,
    sy: 1,
    fg: WHITE,
    bg: TRANSPARENT,
  };
}

const row = (n: number): GlyphPose[] => Array.from({ length: n }, (_, x) => pose(x, 0));
const at = (time: number, center = { x: 0.5, y: 0.5 }) => ({ time, center });
const run = (
  poses: GlyphPose[],
  deformers: readonly Deformer[],
  time = 0,
  center?: { x: number; y: number },
) => deform(poses, deformers, at(time, center));

describe('деформеры', () => {
  it('волна смещает поперёк и бежит со временем', () => {
    const wave = { ...createDeformer('wave', 'w'), amplitude: 1, wavelength: 4, period: 1000 };
    const still = run(row(4), [wave]).map((p) => p.y - 0.5);
    // Центр символа x+0.5: синус от четверти волны и дальше.
    expect(still.map((v) => Math.round(v * 1000) / 1000)).toEqual([0.707, 0.707, -0.707, -0.707]);
    const later = run(row(4), [wave], 250).map((p) => p.y - 0.5);
    expect(later[0]).toBeCloseTo(Math.sin(Math.PI / 4 - Math.PI / 2), 6);
    expect(run(row(2), [{ ...wave, axis: 'x' }]).every((p) => p.y === 0.5)).toBe(true);
  });

  it('дрожание детерминировано зерном и тактом и не выходит за размах', () => {
    const jitter = { ...createDeformer('jitter', 'j'), amplitude: 0.5, angle: 20, period: 100 };
    const a = run(row(8), [jitter], 150);
    expect(run(row(8), [jitter], 199)).toEqual(a);
    expect(run(row(8), [jitter], 200)).not.toEqual(a);
    expect(run(row(8), [{ ...jitter, seed: 2 }], 150)).not.toEqual(a);
    for (const [i, p] of a.entries()) {
      expect(Math.abs(p.x - (i + 0.5))).toBeLessThanOrEqual(0.5);
      expect(Math.abs(p.rot)).toBeLessThanOrEqual(20);
    }
  });

  it('вихрь поворачивает дальние символы сильнее, центр не трогает', () => {
    const twist = { ...createDeformer('twist', 't'), strength: 90 };
    const [center, near] = run([pose(0, 0), pose(1, 0)], [twist]);
    expect([center.x, center.y, center.rot]).toEqual([0.5, 0.5, 0]);
    // Ячейка правее центра на единицу уходит на четверть оборота по часовой — вниз.
    expect(near.x).toBeCloseTo(0.5, 6);
    expect(near.y).toBeCloseTo(1.5, 6);
    expect(near.rot).toBe(90);
  });

  it('размер падает от центра к радиусу и дальше держится', () => {
    const falloff = { ...createDeformer('scaleFalloff', 's'), radius: 2, inner: 2, outer: 1 };
    const [c, mid, far] = run([pose(0, 0), pose(1, 0), pose(5, 0)], [falloff]);
    expect([c.sx, mid.sx, far.sx]).toEqual([2, 1.5, 1]);
  });

  it('градиент красит от первого цвета ко второму и обратно, со временем бежит', () => {
    const ramp = {
      ...createDeformer('colorRamp', 'c'),
      from: '#000000',
      to: '#ffffff',
      axis: 'x' as const,
      length: 4,
      period: 1000,
    };
    const greys = (time: number) =>
      run(row(5), [ramp], time, { x: 0.5, y: 0.5 }).map((p) => p.fg.r);
    expect(greys(0)).toEqual([0, 0.5, 1, 0.5, 0]);
    // Через четверть периода тёмное место сдвинулось на ячейку вправо: градиент бежит по оси.
    expect(greys(250)).toEqual([0.5, 0, 0.5, 1, 0.5]);
    expect(run(row(2), [{ ...ramp, amount: 0 }]).map((p) => p.fg)).toEqual([WHITE, WHITE]);
  });

  it('выключенный деформер пропускается, порядок в стеке важен', () => {
    const twist = { ...createDeformer('twist', 't'), strength: 45 };
    const wave = { ...createDeformer('wave', 'w'), amplitude: 1, wavelength: 3 };
    expect(run(row(3), [{ ...twist, enabled: false }])).toEqual(row(3));
    expect(run(row(3), [twist, wave], 0, { x: 1.5, y: 0.5 })).not.toEqual(
      run(row(3), [wave, twist], 0, { x: 1.5, y: 0.5 }),
    );
    expect(hasActiveDeformers([{ ...twist, enabled: false }])).toBe(false);
    expect(hasActiveDeformers([twist])).toBe(true);
  });
});

describe('изгиб, разлёт и символы по яркости', () => {
  it('изгиб кладёт строку на дугу и поворачивает символы поперёк неё', () => {
    const bend = { ...createDeformer('bend', 'b'), strength: 90 };
    const [center, side] = run([pose(0, 0), pose(1, 0)], [bend]);
    expect(center.x).toBe(0.5);
    expect(center.y).toBeCloseTo(0.5, 12);
    expect(center.rot).toBe(0);
    // Четверть оборота на ячейку: соседний символ уходит вниз по дуге радиусом 2/π.
    expect(side.x).toBeCloseTo(0.5 + 2 / Math.PI, 6);
    expect(side.y).toBeCloseTo(0.5 + 2 / Math.PI, 6);
    expect(side.rot).toBeCloseTo(90, 6);
    expect(run(row(3), [{ ...bend, strength: 0 }])).toEqual(row(3));
  });

  it('разлёт уводит символы от центра пропорционально силе', () => {
    const explode = { ...createDeformer('explode', 'e'), amount: 1, angle: 0 };
    const [c, far] = run([pose(0, 0), pose(2, 0)], [explode]);
    expect([c.x, far.x]).toEqual([0.5, 4.5]);
    expect(run(row(2), [{ ...explode, amount: 0 }])).toEqual(row(2));
  });

  it('символ по яркости цвета: тёмный — начало ряда, светлый — конец', () => {
    const ramp = { ...createDeformer('glyphRamp', 'g'), glyphs: '.o@' };
    const dark = { ...pose(0, 0), fg: { r: 0, g: 0, b: 0, a: 1 } };
    const mid = { ...pose(1, 0), fg: { r: 0.5, g: 0.5, b: 0.5, a: 1 } };
    expect(run([dark, mid, pose(2, 0)], [ramp]).map((p) => p.glyph)).toEqual(['.', 'o', '@']);
  });
});

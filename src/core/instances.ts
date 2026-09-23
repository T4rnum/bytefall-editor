import { type Affine, decomposeAffine, multiply } from './affine';
import { colorOf } from './cellBuffer';
import type { Cell } from './cell';
import { type Rgba, TRANSPARENT, tintColor, withAlpha } from './color';
import { type CellKey, xOf, yOf } from './grid';
import { deformedPoses, isDeformed, poseMatrix } from './deformObject';
import { tintOf } from './look';
import type { SceneObject } from './object';
import { glyphMatrix } from './transform';

/**
 * Поток символов вычисленного кадра — то, что DESIGN.md называет `GlyphInstance[]`, в форме,
 * удобной GPU и игровому движку: только числа, символ — индекс в таблице `glyphs`.
 *
 * Координаты в ячейках документа, ось Y вниз, центр символа. Угол в радианах, по часовой.
 */
export interface GlyphBatch {
  readonly count: number;
  /** По INSTANCE_FLOATS чисел на символ, раскладка — `INSTANCE`. */
  readonly data: Float32Array;
  readonly glyphs: readonly string[];
}

export const INSTANCE_FLOATS = 14;
/** Смещения полей внутри записи символа. Цвета — r, g, b, a долями 0..1. */
export const INSTANCE = { x: 0, y: 1, rot: 2, sx: 3, sy: 4, glyph: 5, fg: 6, bg: 10 } as const;

/** Символ потока объектом: для тестов и отладки, горячий путь читает `data` напрямую. */
export interface GlyphInstance {
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  readonly sx: number;
  readonly sy: number;
  readonly glyph: string;
  readonly fg: Rgba;
  readonly bg: Rgba;
}

export function readInstance(batch: GlyphBatch, index: number): GlyphInstance {
  const o = index * INSTANCE_FLOATS;
  const d = batch.data;
  const rgba = (at: number): Rgba => ({ r: d[at], g: d[at + 1], b: d[at + 2], a: d[at + 3] });
  return {
    x: d[o + INSTANCE.x],
    y: d[o + INSTANCE.y],
    rot: d[o + INSTANCE.rot],
    sx: d[o + INSTANCE.sx],
    sy: d[o + INSTANCE.sy],
    glyph: batch.glyphs[d[o + INSTANCE.glyph]],
    fg: rgba(o + INSTANCE.fg),
    bg: rgba(o + INSTANCE.bg),
  };
}

function writeRgba(d: Float32Array, at: number, c: Rgba): void {
  d[at] = c.r;
  d[at + 1] = c.g;
  d[at + 2] = c.b;
  d[at + 3] = c.a;
}

/** Собирает поток по мере обхода объектов. Память растёт удвоением. */
export class GlyphBatchBuilder {
  private data = new Float32Array(INSTANCE_FLOATS * 64);
  private count = 0;
  private readonly index = new Map<string, number>();
  private readonly glyphs: string[] = [];

  get size(): number {
    return this.count;
  }

  push(m: Affine, glyph: string, fg: Rgba, bg: Rgba, pose = decomposeAffine(m)): void {
    if ((this.count + 1) * INSTANCE_FLOATS > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    let id = this.index.get(glyph);
    if (id === undefined) {
      id = this.glyphs.length;
      this.glyphs.push(glyph);
      this.index.set(glyph, id);
    }
    const d = this.data;
    const o = this.count * INSTANCE_FLOATS;
    d[o + INSTANCE.x] = m.e;
    d[o + INSTANCE.y] = m.f;
    d[o + INSTANCE.rot] = pose.rot;
    d[o + INSTANCE.sx] = pose.sx;
    d[o + INSTANCE.sy] = pose.sy;
    d[o + INSTANCE.glyph] = id;
    writeRgba(d, o + INSTANCE.fg, fg);
    writeRgba(d, o + INSTANCE.bg, bg);
    this.count++;
  }

  finish(): GlyphBatch {
    return {
      count: this.count,
      data: this.data.subarray(0, this.count * INSTANCE_FLOATS),
      glyphs: this.glyphs.slice(),
    };
  }
}

/** Ключи правленых символов по порядку: при наложении порядок отрисовки не зависит от истории. */
const sortedCache = new WeakMap<ReadonlyMap<CellKey, unknown>, readonly CellKey[]>();
function sortedKeys(map: ReadonlyMap<CellKey, unknown>): readonly CellKey[] {
  let keys = sortedCache.get(map);
  if (!keys) {
    keys = [...map.keys()].sort((a, b) => a - b);
    sortedCache.set(map, keys);
  }
  return keys;
}

/**
 * Символы объекта с матрицей `world`. Непрозрачность слоя умножается в альфу обоих цветов.
 *
 * Символы без правок укладываются вплотную и не перекрываются, поэтому идут первыми и в любом
 * порядке. Правленые — повёрнутые, увеличенные — могут залезать на соседей и рисуются поверх,
 * в порядке ключей.
 */
export function pushObjectGlyphs(
  builder: GlyphBatchBuilder,
  obj: SceneObject,
  world: Affine,
  opacity: number,
  time = 0,
): void {
  const pose = decomposeAffine(world);
  const alpha = opacity * obj.opacity;
  const tint = tintOf(obj);
  const paint = (hex: string): Rgba => withAlpha(tintColor(colorOf(hex), tint), alpha);
  if (isDeformed(obj)) {
    const tinted = (c: Rgba): Rgba => withAlpha(tintColor(c, tint), alpha);
    for (const p of deformedPoses(obj, time)) {
      builder.push(poseMatrix(world, p), p.glyph, tinted(p.fg), tinted(p.bg));
    }
    return;
  }
  const fgOf = (cell: Cell): Rgba => paint(cell.fg);
  const bgOf = (cell: Cell): Rgba => (cell.bg === null ? TRANSPARENT : paint(cell.bg));
  for (const [key, cell] of obj.cells) {
    if (obj.overrides.has(key)) continue;
    const cx = xOf(key) + 0.5;
    const cy = yOf(key) + 0.5;
    const at: Affine = {
      ...world,
      e: world.a * cx + world.c * cy + world.e,
      f: world.b * cx + world.d * cy + world.f,
    };
    builder.push(at, cell.glyph, fgOf(cell), bgOf(cell), pose);
  }
  for (const key of sortedKeys(obj.overrides)) {
    const cell = obj.cells.get(key);
    if (!cell) continue;
    const at = multiply(world, glyphMatrix(key, obj.overrides.get(key)));
    builder.push(at, cell.glyph, fgOf(cell), bgOf(cell));
  }
}

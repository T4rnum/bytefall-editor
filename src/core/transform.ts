import { type Affine, multiply, rotateScaleAbout } from './affine';
import { MAX_DIMENSION } from './document';
import type { Point } from './geometry';
import { type CellGrid, type CellKey, gridBounds, xOf, yOf } from './grid';

/**
 * Трансформ объекта. Позиция — целая домашняя ячейка, остальное — модификаторы вида. Документ
 * хранит только целые координаты ячеек (DESIGN.md, раздел 2): поворот и масштаб меняют то, как
 * объект нарисован, а не то, в каких ячейках лежат его символы.
 */
export interface Transform2D {
  /** Домашняя ячейка в координатах родителя, у объекта без родителя — документа. Целые. */
  readonly x: number;
  readonly y: number;
  /** Визуальный сдвиг в ячейках: дробный, в пределах ±MAX_SHIFT. */
  readonly dx: number;
  readonly dy: number;
  /** Поворот в градусах по часовой стрелке. */
  readonly rot: number;
  /** Масштаб вдоль осей объекта. */
  readonly sx: number;
  readonly sy: number;
  /** Опорная точка поворота и масштаба в локальных координатах объекта. */
  readonly px: number;
  readonly py: number;
}

/** Правка вида одного символа: поворот и размер вокруг его центра, сдвиг. Ячейка та же. */
export interface GlyphOverride {
  readonly dx?: number;
  readonly dy?: number;
  readonly rot?: number;
  readonly sx?: number;
  readonly sy?: number;
}

/** Правки символов по ключу локальной ячейки объекта. */
export type GlyphOverrides = ReadonlyMap<CellKey, GlyphOverride>;

/** Дальше этого объект не сдвигается, а переезжает в другую домашнюю ячейку. */
export const MAX_SHIFT = 2;
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 32;
/** Десять оборотов в каждую сторону: запас для анимации вращения. */
export const MAX_ROTATION = 3600;
/** Опорная точка может лежать вне объекта, но не где угодно. */
export const MAX_PIVOT = 2 * MAX_DIMENSION;

export const emptyOverrides = (): GlyphOverrides => new Map();

/** Центр содержимого: вокруг него объект поворачивается, пока опору не передвинули. */
export function centerPivot(cells: CellGrid): Point {
  const bounds = gridBounds(cells);
  if (!bounds) return { x: 0.5, y: 0.5 };
  return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
}

export function createTransform(x: number, y: number, pivot: Point): Transform2D {
  return { x, y, dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, px: pivot.x, py: pivot.y };
}

/**
 * Число в пределах, без двоичных хвостов: 89.1 + 15 даёт 104.10000000000002, и такое число
 * ушло бы и в инспектор, и в файл. Шесть знаков после запятой — это миллионная доля ячейки или
 * градуса, глазу не видна.
 */
function bounded(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.round(Math.min(max, Math.max(min, value)) * 1e6) / 1e6;
}

/** Приводит трансформ к пределам формата: позиция целая, сдвиг и масштаб ограничены. */
export function normalizeTransform(t: Transform2D): Transform2D {
  return {
    x: Math.round(bounded(t.x, -MAX_DIMENSION, MAX_DIMENSION, 0)),
    y: Math.round(bounded(t.y, -MAX_DIMENSION, MAX_DIMENSION, 0)),
    dx: bounded(t.dx, -MAX_SHIFT, MAX_SHIFT, 0),
    dy: bounded(t.dy, -MAX_SHIFT, MAX_SHIFT, 0),
    rot: bounded(t.rot, -MAX_ROTATION, MAX_ROTATION, 0),
    sx: bounded(t.sx, MIN_SCALE, MAX_SCALE, 1),
    sy: bounded(t.sy, MIN_SCALE, MAX_SCALE, 1),
    px: bounded(t.px, -MAX_PIVOT, MAX_PIVOT, 0),
    py: bounded(t.py, -MAX_PIVOT, MAX_PIVOT, 0),
  };
}

const TRANSFORM_KEYS = ['x', 'y', 'dx', 'dy', 'rot', 'sx', 'sy', 'px', 'py'] as const;

export const sameTransform = (a: Transform2D, b: Transform2D): boolean =>
  TRANSFORM_KEYS.every((key) => a[key] === b[key]);

/** Трансформ ничего не меняет в виде: только позиция. */
export function isPlainTransform(t: Transform2D): boolean {
  return t.dx === 0 && t.dy === 0 && t.rot % 360 === 0 && t.sx === 1 && t.sy === 1;
}

/** Локальные координаты объекта в координаты родителя. */
export function transformMatrix(t: Transform2D): Affine {
  return rotateScaleAbout(
    t.rot,
    t.sx,
    t.sy,
    { x: t.px, y: t.py },
    { x: t.x + t.dx, y: t.y + t.dy },
  );
}

/**
 * Переносит опорную точку, не сдвигая объект на экране. Смена опоры у повёрнутого объекта
 * сдвинула бы его: поворот теперь шёл бы вокруг другой точки. Поэтому домашняя ячейка и сдвиг
 * подстраиваются так, чтобы матрица осталась прежней: целая часть уходит в ячейку, дробная — в
 * сдвиг, и он не выходит за полклетки.
 */
export function withPivot(t: Transform2D, pivot: Point): Transform2D {
  const m = transformMatrix(t);
  const ddx = t.px - pivot.x;
  const ddy = t.py - pivot.y;
  // Без поворота и масштаба поправка ровно ноль: целая позиция остаётся целой.
  const hx = t.x + t.dx + (ddx - (m.a * ddx + m.c * ddy));
  const hy = t.y + t.dy + (ddy - (m.b * ddx + m.d * ddy));
  const x = Math.round(hx);
  const y = Math.round(hy);
  return normalizeTransform({ ...t, px: pivot.x, py: pivot.y, x, y, dx: hx - x, dy: hy - y });
}

/** Правка без единого поля, отличного от «как есть», правкой не считается. */
export function normalizeOverride(o: GlyphOverride): GlyphOverride | null {
  const out: { dx?: number; dy?: number; rot?: number; sx?: number; sy?: number } = {};
  const dx = bounded(o.dx ?? 0, -MAX_SHIFT, MAX_SHIFT, 0);
  const dy = bounded(o.dy ?? 0, -MAX_SHIFT, MAX_SHIFT, 0);
  const rot = bounded(o.rot ?? 0, -MAX_ROTATION, MAX_ROTATION, 0);
  const sx = bounded(o.sx ?? 1, MIN_SCALE, MAX_SCALE, 1);
  const sy = bounded(o.sy ?? 1, MIN_SCALE, MAX_SCALE, 1);
  if (dx !== 0) out.dx = dx;
  if (dy !== 0) out.dy = dy;
  if (rot % 360 !== 0) out.rot = rot;
  if (sx !== 1) out.sx = sx;
  if (sy !== 1) out.sy = sy;
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Символ ячейки `key` в локальные координаты объекта. Символ живёт в квадрате [−0.5, 0.5]
 * вокруг своего начала: без правки это центр ячейки.
 */
export function glyphMatrix(key: CellKey, override: GlyphOverride | undefined): Affine {
  const center = { x: xOf(key) + 0.5, y: yOf(key) + 0.5 };
  if (!override) return { a: 1, b: 0, c: 0, d: 1, e: center.x, f: center.y };
  const shift = { x: center.x + (override.dx ?? 0), y: center.y + (override.dy ?? 0) };
  return rotateScaleAbout(
    override.rot ?? 0,
    override.sx ?? 1,
    override.sy ?? 1,
    { x: 0, y: 0 },
    shift,
  );
}

/** Символ ячейки в координаты документа при матрице объекта `world`. */
export function glyphWorldMatrix(
  world: Affine,
  key: CellKey,
  override: GlyphOverride | undefined,
): Affine {
  return multiply(world, glyphMatrix(key, override));
}

/** Правки только тех ячеек, что у объекта есть: стёртая ячейка уносит свою правку с собой. */
export function pruneOverrides(overrides: GlyphOverrides, cells: CellGrid): GlyphOverrides {
  let pruned: Map<CellKey, GlyphOverride> | null = null;
  for (const key of overrides.keys()) {
    if (cells.has(key)) continue;
    pruned ??= new Map(overrides);
    pruned.delete(key);
  }
  return pruned ?? overrides;
}

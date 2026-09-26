import { type Affine, applyAffine, invertAffine } from './affine';
import { deformedPoses, isDeformed, objectRig, poseMatrix } from './deformObject';
import type { Document } from './document';
import type { Point, Rect } from './geometry';
import { type CellKey, keyOf, xOf, yOf } from './grid';
import type { SceneObject } from './object';
import { objectMatrices } from './placement';
import { glyphWorldMatrix } from './transform';

/**
 * Выделение символов, а не клеток (ROADMAP, слой 10): символ ловится там, где его видно, —
 * повёрнутый, сдвинутый правкой, унесённый деформером или связью. Поэтому всё здесь считается
 * по матрицам символов в момент сцены, тем же путём, что и отрисовка потока символов.
 */

/** Символ объекта на экране: ключ его ячейки и матрица в координатах документа. */
export interface PlacedGlyph {
  readonly key: CellKey;
  /** Единичная ячейка символа в документ: центр — (e, f). */
  readonly matrix: Affine;
}

/** Символы объекта там, где они видны в момент `time`. Частицы не входят: у них нет ячейки. */
export function placedGlyphs(doc: Document, obj: SceneObject, time: number): PlacedGlyph[] {
  const matrices = objectMatrices(doc);
  const world = matrices.get(obj.id);
  if (!world) return [];
  if (isDeformed(obj)) {
    return deformedPoses(obj, time, objectRig(obj, matrices))
      .filter((p) => p.particle === null)
      .map((p) => ({ key: p.key, matrix: poseMatrix(world, p) }));
  }
  return [...obj.cells.keys()].map((key) => ({
    key,
    matrix: glyphWorldMatrix(world, key, obj.overrides.get(key)),
  }));
}

const centerOf = (g: PlacedGlyph): Point => ({ x: g.matrix.e, y: g.matrix.f });

/**
 * Символы, чьи центры внутри прямоугольника документа, включая край: рамку тянут по точкам, и
 * рамка от центра до центра берёт оба символа.
 */
export function glyphsInRect(placed: readonly PlacedGlyph[], rect: Rect): CellKey[] {
  return sortedKeys(
    placed.filter(({ matrix: m }) => {
      return m.e >= rect.x && m.e <= rect.x + rect.w && m.f >= rect.y && m.f <= rect.y + rect.h;
    }),
  );
}

/** Символы, чьи центры внутри многоугольника: лассо по точкам указателя. */
export function glyphsInPolygon(
  placed: readonly PlacedGlyph[],
  polygon: readonly Point[],
): CellKey[] {
  if (polygon.length < 3) return [];
  return sortedKeys(placed.filter((g) => insidePolygon(centerOf(g), polygon)));
}

/** Чётно-нечётное правило: луч вправо от точки пересекает контур нечётное число раз. */
function insidePolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Символ под точкой: последний по порядку отрисовки, как и видно на экране. */
export function glyphAt(placed: readonly PlacedGlyph[], point: Point): CellKey | null {
  for (let i = placed.length - 1; i >= 0; i--) {
    const inverse = invertAffine(placed[i].matrix);
    if (!inverse) continue;
    const local = applyAffine(inverse, point.x, point.y);
    if (Math.abs(local.x) <= 0.5 && Math.abs(local.y) <= 0.5) return placed[i].key;
  }
  return null;
}

/** Четыре угла символа в документе: для рамок выделенных символов. */
export function glyphQuad(matrix: Affine): Point[] {
  return [
    applyAffine(matrix, -0.5, -0.5),
    applyAffine(matrix, 0.5, -0.5),
    applyAffine(matrix, 0.5, 0.5),
    applyAffine(matrix, -0.5, 0.5),
  ];
}

/**
 * Похожие символы для волшебной палочки: тот же символ и цвет. Смежно — связная область по
 * четырём соседям в сетке объекта, иначе — все такие символы объекта.
 */
export function similarGlyphs(obj: SceneObject, start: CellKey, contiguous: boolean): CellKey[] {
  const origin = obj.cells.get(start);
  if (!origin) return [];
  const same = (key: CellKey): boolean => {
    const cell = obj.cells.get(key);
    return cell !== undefined && cell.glyph === origin.glyph && cell.fg === origin.fg;
  };
  if (!contiguous) return [...obj.cells.keys()].filter(same).sort((a, b) => a - b);
  const found = new Set<CellKey>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const key = stack.pop() as CellKey;
    const x = xOf(key);
    const y = yOf(key);
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0) continue;
      const next = keyOf(nx, ny);
      if (!found.has(next) && same(next)) {
        found.add(next);
        stack.push(next);
      }
    }
  }
  return [...found].sort((a, b) => a - b);
}

const sortedKeys = (glyphs: readonly PlacedGlyph[]): CellKey[] =>
  glyphs.map((g) => g.key).sort((a, b) => a - b);

/** Новое выделение символов с прежним: Shift добавляет, Alt вычитает, иначе заменяет. */
export function combineGlyphs(
  base: readonly CellKey[],
  next: readonly CellKey[],
  mode: 'replace' | 'add' | 'subtract',
): CellKey[] {
  if (mode === 'replace') return [...next].sort((a, b) => a - b);
  const set = new Set(base);
  for (const key of next) {
    if (mode === 'add') set.add(key);
    else set.delete(key);
  }
  return [...set].sort((a, b) => a - b);
}

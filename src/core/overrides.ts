import { type Affine, invertAffine } from './affine';
import type { Document } from './document';
import { intersectRects } from './geometry';
import { type CellKey, gridBounds } from './grid';
import { type SceneObject, findObject, updateObject } from './object';
import { coveringRect, sourceKey } from './rasterize';
import { type Selection, selectionContains } from './selection';
import { type GlyphOverride, type GlyphOverrides, normalizeOverride } from './transform';

/**
 * Символы объекта, которые видны в выделенных ячейках документа, — локальные ключи в порядке
 * возрастания. Ячейка документа отдаёт тот символ, что в ней нарисован: так же, как при
 * растеризации, поэтому у повёрнутого объекта выделяется ровно то, что видно под рамкой.
 * Обходится только пересечение выделения с рамкой объекта, а не весь холст.
 */
export function glyphsInSelection(
  obj: SceneObject,
  world: Affine,
  selection: Selection,
): CellKey[] {
  const bounds = gridBounds(obj.cells);
  const inverse = invertAffine(world);
  if (!bounds || !inverse) return [];
  const box = intersectRects(coveringRect(world, bounds), selection.bounds);
  if (!box) return [];
  const found = new Set<CellKey>();
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      if (!selectionContains(selection, x, y)) continue;
      const key = sourceKey(inverse, x, y);
      if (key !== null && obj.cells.has(key)) found.add(key);
    }
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Правит символы объекта по одному: `update` получает текущую правку символа, где пропущенные
 * поля заполнены значениями «как есть», и возвращает новую. Правка, которая после этого ничего
 * не меняет, удаляется: разреженный список правок не копит пустых записей. Если не поменялось
 * ничего, возвращается тот же документ.
 */
export function updateGlyphOverrides(
  doc: Document,
  id: string,
  keys: readonly CellKey[],
  update: (current: Required<GlyphOverride>) => GlyphOverride,
): Document {
  const obj = findObject(doc, id);
  if (!obj || keys.length === 0) return doc;
  const overrides = new Map(obj.overrides);
  for (const key of keys) {
    if (!obj.cells.has(key)) continue;
    const next = normalizeOverride(update(effectiveOverride(obj.overrides, key)));
    if (next) overrides.set(key, next);
    else overrides.delete(key);
  }
  return sameOverrides(overrides, obj.overrides) ? doc : updateObject(doc, id, { overrides });
}

function sameOverrides(a: GlyphOverrides, b: GlyphOverrides): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (!other || !sameOverride(value, other)) return false;
  }
  return true;
}

const OVERRIDE_KEYS = ['dx', 'dy', 'rot', 'sx', 'sy'] as const;
const sameOverride = (a: GlyphOverride, b: GlyphOverride): boolean =>
  OVERRIDE_KEYS.every((key) => a[key] === b[key]);

/** Правка символа, как её видит инспектор: отсутствующие поля — «как есть». */
export function effectiveOverride(
  overrides: GlyphOverrides,
  key: CellKey,
): Required<GlyphOverride> {
  const o = overrides.get(key);
  return { dx: o?.dx ?? 0, dy: o?.dy ?? 0, rot: o?.rot ?? 0, sx: o?.sx ?? 1, sy: o?.sy ?? 1 };
}

import type { Document } from './document';
import type { CellKey } from './grid';
import { findObject, updateObject } from './object';
import { type GlyphOverride, type GlyphOverrides, normalizeOverride } from './transform';

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

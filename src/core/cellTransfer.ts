import { type Affine, applyAffine, invertAffine } from './affine';
import type { Cell } from './cell';
import { inBounds } from './geometry';
import { type CellEdits, type CellGrid, type CellKey, keyOf, xOf, yOf } from './grid';
import type { PlacedGlyph } from './glyphPick';
import type { LocalEdit } from './objectEdit';
import { type Selection, selectionCells } from './selection';

/**
 * Ячейки между слоем и объектом без разборки объекта (ROADMAP, слой 10): выделенное на слое —
 * в объект, выделенные символы объекта — обратно в слой. Туда, где их видно: у повёрнутого
 * объекта ячейка слоя уходит в клетку его сетки под своим центром, а символ ложится в ячейку
 * слоя под своим центром.
 */

/** Перекраска: символы те же, цвет символа и фона — новые. Пустые ячейки не трогаются. */
export function recolorEdits(
  grid: CellGrid,
  keys: Iterable<CellKey>,
  fg: string,
  bg: string | null,
): Map<CellKey, Cell> {
  const edits = new Map<CellKey, Cell>();
  for (const key of keys) {
    const cell = grid.get(key);
    if (cell && (cell.fg !== fg || cell.bg !== bg)) edits.set(key, { ...cell, fg, bg });
  }
  return edits;
}

/** Выделенные ячейки слоя в клетки объекта и правки, которые очищают их на слое. */
export function cellsIntoObject(
  layerCells: CellGrid,
  selection: Selection,
  world: Affine,
): { readonly local: LocalEdit[]; readonly cleared: CellEdits } {
  const inverse = invertAffine(world);
  const local: LocalEdit[] = [];
  const cleared = new Map<CellKey, Cell | null>();
  if (!inverse) return { local, cleared };
  for (const { x, y } of selectionCells(selection)) {
    const key = keyOf(x, y);
    const cell = layerCells.get(key);
    if (!cell) continue;
    const p = applyAffine(inverse, x + 0.5, y + 0.5);
    local.push({ x: Math.floor(p.x), y: Math.floor(p.y), cell });
    cleared.set(key, null);
  }
  return { local, cleared };
}

/**
 * Выделенные символы объекта в ячейки слоя под их центрами — как их видно сейчас — и правки,
 * которые убирают их из объекта. Символ за краем холста пропадает, как и при разборке объекта;
 * `lost` говорит, сколько таких.
 */
export function glyphsIntoLayer(
  cells: CellGrid,
  placed: readonly PlacedGlyph[],
  keys: readonly CellKey[],
  width: number,
  height: number,
): { readonly layer: Map<CellKey, Cell>; readonly removed: LocalEdit[]; readonly lost: number } {
  const wanted = new Set(keys);
  const layer = new Map<CellKey, Cell>();
  const removed: LocalEdit[] = [];
  let lost = 0;
  for (const g of placed) {
    const cell = cells.get(g.key);
    if (!wanted.has(g.key) || !cell) continue;
    removed.push({ x: xOf(g.key), y: yOf(g.key), cell: null });
    const x = Math.floor(g.matrix.e);
    const y = Math.floor(g.matrix.f);
    if (inBounds(x, y, width, height)) layer.set(keyOf(x, y), cell);
    else lost += 1;
  }
  return { layer, removed, lost };
}

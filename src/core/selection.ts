import type { Cell } from './cell';
import { type Rect, inBounds, iterateRect } from './geometry';
import { type CellEdits, type CellGrid, type CellKey, keyOf, xOf, yOf } from './grid';

/** Буфер обмена: ячейки в локальных координатах от (0,0). */
export interface Clip {
  readonly width: number;
  readonly height: number;
  readonly cells: CellGrid;
}

export function copyRect(grid: CellGrid, rect: Rect): Clip {
  const cells = new Map<CellKey, Cell>();
  for (const p of iterateRect(rect)) {
    const cell = grid.get(keyOf(p.x, p.y));
    if (cell) cells.set(keyOf(p.x - rect.x, p.y - rect.y), cell);
  }
  return { width: rect.w, height: rect.h, cells };
}

/** Правки, очищающие все существующие ячейки прямоугольника. */
export function clearRectEdits(grid: CellGrid, rect: Rect): CellEdits {
  const edits = new Map<CellKey, Cell | null>();
  for (const p of iterateRect(rect)) {
    const key = keyOf(p.x, p.y);
    if (grid.has(key)) edits.set(key, null);
  }
  return edits;
}

/** Правки вставки буфера с левым верхним углом в (x, y), обрезанные по холсту. */
export function pasteEdits(
  clip: Clip,
  x: number,
  y: number,
  width: number,
  height: number,
): CellEdits {
  const edits = new Map<CellKey, Cell | null>();
  for (const [key, cell] of clip.cells) {
    const tx = x + xOf(key);
    const ty = y + yOf(key);
    if (inBounds(tx, ty, width, height)) edits.set(keyOf(tx, ty), cell);
  }
  return edits;
}

/** Перенос прямоугольника на (dx, dy): очистка источника плюс вставка в новое место. */
export function moveRectEdits(
  grid: CellGrid,
  rect: Rect,
  dx: number,
  dy: number,
  width: number,
  height: number,
): CellEdits {
  if (dx === 0 && dy === 0) return new Map();
  const clip = copyRect(grid, rect);
  const edits = new Map<CellKey, Cell | null>(clearRectEdits(grid, rect));
  for (const [key, cell] of pasteEdits(clip, rect.x + dx, rect.y + dy, width, height)) {
    edits.set(key, cell);
  }
  return edits;
}

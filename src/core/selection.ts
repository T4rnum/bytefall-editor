import type { Cell } from './cell';
import { type Point, type Rect, clampRect, inBounds } from './geometry';
import { type CellEdits, type CellGrid, type CellKey, keyOf, xOf, yOf } from './grid';

/** Значение выделенной ячейки в маске. Не 1: маска уходит в GPU как байт цвета. */
export const SELECTED = 255;

/**
 * Выделение — произвольный набор ячеек, а не прямоугольник: иначе лассо и волшебная палочка
 * невыразимы.
 *
 * Хранится плотной маской по всему холсту, а не набором ключей. Набор нагляднее, но выделение
 * во весь холст 1024×1024 строится 44 мс против 0.17 мс у маски, а тянуть рамку по холсту
 * приходится на каждое движение указателя. Маска ещё и уходит в текстуру одним копированием.
 *
 * Пустого выделения не существует: конструкторы возвращают `null`. Это избавляет потребителей
 * от второй проверки «выделение есть, но в нём ноль ячеек». После создания маска не меняется.
 */
export interface Selection {
  readonly width: number;
  readonly height: number;
  readonly mask: Uint8Array;
  /** Габарит выделенных ячеек: нужен рендеру, вставке и объектам. */
  readonly bounds: Rect;
  readonly size: number;
}

/** Что делает новый жест с прежним выделением: Shift добавляет, Alt вычитает. */
export type SelectionMode = 'replace' | 'add' | 'subtract';

/** Буфер обмена: ячейки в локальных координатах от (0,0). */
export interface Clip {
  readonly width: number;
  readonly height: number;
  readonly cells: CellGrid;
}

/** Габарит маски. null, если не выделено ничего. */
function scanBounds(mask: Uint8Array, width: number, height: number): Rect | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[row + x] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function make(
  mask: Uint8Array,
  width: number,
  height: number,
  bounds: Rect | null,
  size: number,
): Selection | null {
  if (size <= 0 || !bounds) return null;
  return { width, height, mask, bounds, size };
}

/** Выделение из ячеек. Всё, что вне холста, отбрасывается. */
export function selectionFromPoints(
  points: Iterable<Point>,
  width: number,
  height: number,
): Selection | null {
  if (width <= 0 || height <= 0) return null;
  const mask = new Uint8Array(width * height);
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  let size = 0;
  for (const p of points) {
    if (!inBounds(p.x, p.y, width, height)) continue;
    const index = p.y * width + p.x;
    if (mask[index] !== 0) continue;
    mask[index] = SELECTED;
    size += 1;
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return make(
    mask,
    width,
    height,
    x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    size,
  );
}

/** Выделение прямоугольником. Габарит известен заранее, поэтому маска заполняется строками. */
export function selectionFromRect(rect: Rect, width: number, height: number): Selection | null {
  if (width <= 0 || height <= 0) return null;
  const bounds = clampRect(rect, width, height);
  if (!bounds) return null;
  const mask = new Uint8Array(width * height);
  for (let y = bounds.y; y < bounds.y + bounds.h; y++) {
    const row = y * width;
    mask.fill(SELECTED, row + bounds.x, row + bounds.x + bounds.w);
  }
  return make(mask, width, height, bounds, bounds.w * bounds.h);
}

export const selectionContains = (selection: Selection, x: number, y: number): boolean =>
  inBounds(x, y, selection.width, selection.height) &&
  selection.mask[y * selection.width + x] !== 0;

/** Выделенные ячейки в порядке чтения. Обходится габарит, а не весь холст. */
export function* selectionCells(selection: Selection): Generator<Point> {
  const { mask, width, bounds } = selection;
  for (let y = bounds.y; y < bounds.y + bounds.h; y++) {
    const row = y * width;
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      if (mask[row + x] !== 0) yield { x, y };
    }
  }
}

const unionRect = (a: Rect, b: Rect): Rect => {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/** Применяет жест к прежнему выделению. Холсты у обоих одинаковые: оба строились по документу. */
export function combineSelection(
  base: Selection | null,
  next: Selection | null,
  mode: SelectionMode,
): Selection | null {
  if (mode === 'replace') return next;
  if (!base) return mode === 'add' ? next : null;
  if (!next || next.width !== base.width || next.height !== base.height) return base;

  const { width, height } = base;
  const mask = new Uint8Array(base.mask);
  let size = base.size;
  const add = mode === 'add';
  for (const p of selectionCells(next)) {
    const index = p.y * width + p.x;
    if (add && mask[index] === 0) {
      mask[index] = SELECTED;
      size += 1;
    } else if (!add && mask[index] !== 0) {
      mask[index] = 0;
      size -= 1;
    }
  }
  // При добавлении габарит очевиден, при вычитании он может сжаться где угодно.
  const bounds = add ? unionRect(base.bounds, next.bounds) : scanBounds(mask, width, height);
  return make(mask, width, height, bounds, size);
}

/** Сдвиг выделения. Ячейки, уехавшие за холст, теряются — как и содержимое под ними. */
export function translateSelection(
  selection: Selection,
  dx: number,
  dy: number,
  width: number,
  height: number,
): Selection | null {
  const moved: Point[] = [];
  for (const p of selectionCells(selection)) moved.push({ x: p.x + dx, y: p.y + dy });
  return selectionFromPoints(moved, width, height);
}

/** Ячейки выделения в локальных координатах от его левого верхнего угла. */
export function copySelection(grid: CellGrid, selection: Selection): Clip {
  const { bounds } = selection;
  const cells = new Map<CellKey, Cell>();
  for (const p of selectionCells(selection)) {
    const cell = grid.get(keyOf(p.x, p.y));
    if (cell) cells.set(keyOf(p.x - bounds.x, p.y - bounds.y), cell);
  }
  return { width: bounds.w, height: bounds.h, cells };
}

/** Правки, очищающие все существующие ячейки выделения. */
export function clearSelectionEdits(grid: CellGrid, selection: Selection): CellEdits {
  const edits = new Map<CellKey, Cell | null>();
  for (const p of selectionCells(selection)) {
    const key = keyOf(p.x, p.y);
    if (grid.has(key)) edits.set(key, null);
  }
  return edits;
}

/**
 * Правки, попавшие в выделение. Пока выделение есть, инструменты меняют только его ячейки:
 * это и есть смысл выделения в растровом редакторе. Пустой результат не доходит до истории —
 * коммит без изменений её не трогает.
 */
export function clipEditsToSelection(edits: CellEdits, selection: Selection): CellEdits {
  const clipped = new Map<CellKey, Cell | null>();
  for (const [key, cell] of edits) {
    if (selectionContains(selection, xOf(key), yOf(key))) clipped.set(key, cell);
  }
  return clipped;
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

/** Перенос выделения на (dx, dy): очистка источника плюс вставка в новое место. */
export function moveSelectionEdits(
  grid: CellGrid,
  selection: Selection,
  dx: number,
  dy: number,
  width: number,
  height: number,
): CellEdits {
  if (dx === 0 && dy === 0) return new Map();
  const clip = copySelection(grid, selection);
  const edits = new Map<CellKey, Cell | null>(clearSelectionEdits(grid, selection));
  for (const [key, cell] of pasteEdits(
    clip,
    selection.bounds.x + dx,
    selection.bounds.y + dy,
    width,
    height,
  )) {
    edits.set(key, cell);
  }
  return edits;
}

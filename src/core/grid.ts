import { type Cell, isBlankCell } from './cell';
import { type Point, type Rect, inBounds } from './geometry';

/** Ключ ячейки: y * 65536 + x. Координаты неотрицательные и меньше 65536. */
export type CellKey = number;

const STRIDE = 65536;

/** Отрицательная координата дала бы ключ другой ячейки, поэтому инвариант проверяется здесь. */
export function keyOf(x: number, y: number): CellKey {
  if (x < 0 || y < 0 || x >= STRIDE || y >= STRIDE) {
    throw new RangeError(`Cell coordinates out of range: ${x}, ${y}`);
  }
  return y * STRIDE + x;
}
export const xOf = (key: CellKey): number => key % STRIDE;
export const yOf = (key: CellKey): number => Math.floor(key / STRIDE);

/** Разреженная неизменяемая сетка: хранятся только непустые ячейки. */
export type CellGrid = ReadonlyMap<CellKey, Cell>;
/** Набор правок: null означает "очистить ячейку". */
export type CellEdits = ReadonlyMap<CellKey, Cell | null>;

export const emptyGrid = (): CellGrid => new Map();

export function getCell(grid: CellGrid, x: number, y: number): Cell | undefined {
  return grid.get(keyOf(x, y));
}

/** Возвращает новую сетку с применёнными правками. Исходная сетка не меняется. */
export function applyEdits(grid: CellGrid, edits: CellEdits): CellGrid {
  if (edits.size === 0) return grid;
  const next = new Map(grid);
  for (const [key, cell] of edits) {
    if (isBlankCell(cell)) next.delete(key);
    else next.set(key, cell as Cell);
  }
  return next;
}

export function editsFromPoints(points: Iterable<Point>, cell: Cell | null): CellEdits {
  const edits = new Map<CellKey, Cell | null>();
  for (const p of points) edits.set(keyOf(p.x, p.y), cell);
  return edits;
}

/** Ограничивающий прямоугольник непустых ячеек. null для пустой сетки. */
export function gridBounds(grid: CellGrid): Rect | null {
  if (grid.size === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const key of grid.keys()) {
    const x = xOf(key);
    const y = yOf(key);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Отбрасывает ячейки за пределами width×height. Нужно при изменении размера холста. */
/** Сдвигает сетку на (dx, dy) и отбрасывает всё, что вышло за холст. */
export function shiftGrid(
  grid: CellGrid,
  dx: number,
  dy: number,
  width: number,
  height: number,
): CellGrid {
  if (dx === 0 && dy === 0) return cropGrid(grid, width, height);
  const next = new Map<CellKey, Cell>();
  for (const [key, cell] of grid) {
    const x = xOf(key) + dx;
    const y = yOf(key) + dy;
    if (inBounds(x, y, width, height)) next.set(keyOf(x, y), cell);
  }
  return next;
}

export function cropGrid(grid: CellGrid, width: number, height: number): CellGrid {
  let next: Map<CellKey, Cell> | null = null;
  for (const key of grid.keys()) {
    if (xOf(key) >= width || yOf(key) >= height) {
      next ??= new Map(grid);
      next.delete(key);
    }
  }
  return next ?? grid;
}

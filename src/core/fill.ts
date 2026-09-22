import { cellsEqual } from './cell';
import { type Point, inBounds } from './geometry';
import { type CellGrid, getCell } from './grid';

/** Заливка 4-связной области ячеек, визуально равных стартовой. Пустота тоже область. */
export function floodFill(
  grid: CellGrid,
  width: number,
  height: number,
  startX: number,
  startY: number,
): Point[] {
  if (!inBounds(startX, startY, width, height)) return [];
  const target = getCell(grid, startX, startY);
  const visited = new Uint8Array(width * height);
  const result: Point[] = [];
  const stack: number[] = [startY * width + startX];
  visited[stack[0]] = 1;

  /** Сосед проверяется по индексу: массива координат на каждую ячейку заливка не переживает. */
  const visit = (index: number, x: number, y: number): void => {
    if (visited[index]) return;
    visited[index] = 1;
    if (cellsEqual(getCell(grid, x, y), target)) stack.push(index);
  };

  while (stack.length > 0) {
    const index = stack.pop() as number;
    const x = index % width;
    const y = (index - x) / width;
    result.push({ x, y });
    if (x > 0) visit(index - 1, x - 1, y);
    if (x + 1 < width) visit(index + 1, x + 1, y);
    if (y > 0) visit(index - width, x, y - 1);
    if (y + 1 < height) visit(index + width, x, y + 1);
  }
  return result;
}

/**
 * Все ячейки холста, визуально равные ячейке (x, y), независимо от связности: несмежный режим
 * волшебной палочки. Пустота тоже значение, поэтому по пустой ячейке выделяется весь фон.
 */
export function similarCells(
  grid: CellGrid,
  width: number,
  height: number,
  startX: number,
  startY: number,
): Point[] {
  if (!inBounds(startX, startY, width, height)) return [];
  const target = getCell(grid, startX, startY);
  const result: Point[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cellsEqual(getCell(grid, x, y), target)) result.push({ x, y });
    }
  }
  return result;
}

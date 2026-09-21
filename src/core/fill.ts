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

  while (stack.length > 0) {
    const index = stack.pop() as number;
    const x = index % width;
    const y = Math.floor(index / width);
    result.push({ x, y });
    const neighbours = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as const;
    for (const [nx, ny] of neighbours) {
      if (!inBounds(nx, ny, width, height)) continue;
      const ni = ny * width + nx;
      if (visited[ni]) continue;
      visited[ni] = 1;
      if (cellsEqual(getCell(grid, nx, ny), target)) stack.push(ni);
    }
  }
  return result;
}

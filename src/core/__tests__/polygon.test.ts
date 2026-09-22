import { describe, expect, it } from 'vitest';
import { polygonCells } from '../polygon';

const render = (cells: { x: number; y: number }[], w: number, h: number): string => {
  const grid = Array.from({ length: h }, () => '.'.repeat(w).split(''));
  for (const c of cells) grid[c.y][c.x] = '#';
  return grid.map((row) => row.join('')).join('\n');
};

describe('polygonCells', () => {
  it('заполняет треугольник вместе с контуром', () => {
    const cells = polygonCells(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 0, y: 4 },
      ],
      5,
      5,
    );
    expect(render(cells, 5, 5)).toBe(['#####', '####.', '###..', '##...', '#....'].join('\n'));
  });

  it('заполняет прямоугольный контур целиком', () => {
    const cells = polygonCells(
      [
        { x: 1, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 3 },
        { x: 1, y: 3 },
      ],
      5,
      5,
    );
    expect(render(cells, 5, 5)).toBe(['.....', '.###.', '.###.', '.###.', '.....'].join('\n'));
  });

  it('обрезает по холсту и не ходит за его край', () => {
    const cells = polygonCells(
      [
        { x: -3, y: -3 },
        { x: 2, y: -3 },
        { x: 2, y: 2 },
        { x: -3, y: 2 },
      ],
      4,
      4,
    );
    expect(render(cells, 4, 4)).toBe(['###.', '###.', '###.', '....'].join('\n'));
  });

  it('не выделяет ничего вне обведённой области', () => {
    const cells = polygonCells(
      [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 2, y: 2 },
        { x: 1, y: 2 },
      ],
      6,
      6,
    );
    expect(cells).toHaveLength(4);
  });

  it('вырожденные случаи дают контур, а не пустоту', () => {
    expect(polygonCells([], 4, 4)).toEqual([]);
    expect(polygonCells([{ x: 1, y: 1 }], 4, 4)).toEqual([{ x: 1, y: 1 }]);
    expect(
      polygonCells(
        [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
        ],
        4,
        4,
      ),
    ).toHaveLength(3);
  });

  it('петля в контуре не выворачивает выделение наизнанку', () => {
    // Восьмёрка: правило чётности оставляет обе петли выделенными.
    const cells = polygonCells(
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 2 },
        { x: 2, y: 2 },
      ],
      3,
      3,
    );
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => c.x >= 0 && c.x < 3 && c.y >= 0 && c.y < 3)).toBe(true);
  });
});

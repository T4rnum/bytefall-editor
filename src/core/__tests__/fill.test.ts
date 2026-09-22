import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import { floodFill, similarCells } from '../fill';
import { applyEdits, editsFromPoints, emptyGrid } from '../grid';
import { linePoints } from '../shapes';

describe('floodFill', () => {
  it('fills an empty region bounded by a wall', () => {
    const wall = applyEdits(emptyGrid(), editsFromPoints(linePoints(2, 0, 2, 4), makeCell('|')));
    const left = floodFill(wall, 5, 5, 0, 0);
    expect(left).toHaveLength(10);
    expect(left.every((p) => p.x < 2)).toBe(true);
  });

  it('fills only visually equal cells and can start on a wall', () => {
    const red = applyEdits(
      emptyGrid(),
      editsFromPoints(linePoints(0, 0, 4, 0), makeCell('#', '#ff0000')),
    );
    const grid = applyEdits(red, editsFromPoints([{ x: 2, y: 0 }], makeCell('#', '#00ff00')));
    expect(floodFill(grid, 5, 3, 0, 0)).toHaveLength(2);
    expect(floodFill(grid, 5, 3, 2, 0)).toHaveLength(1);
  });

  it('returns nothing for out-of-bounds start', () => {
    expect(floodFill(emptyGrid(), 3, 3, 3, 0)).toEqual([]);
  });
});

describe('similarCells', () => {
  it('берёт все похожие ячейки, даже разорванные стеной', () => {
    const wall = applyEdits(emptyGrid(), editsFromPoints(linePoints(2, 0, 2, 4), makeCell('|')));
    // Связной заливке стена мешает, несмежной — нет.
    expect(floodFill(wall, 5, 5, 0, 0)).toHaveLength(10);
    expect(similarCells(wall, 5, 5, 0, 0)).toHaveLength(20);
  });

  it('различает ячейки по виду, а не по месту', () => {
    const red = applyEdits(
      emptyGrid(),
      editsFromPoints(
        [
          { x: 0, y: 0 },
          { x: 4, y: 4 },
        ],
        makeCell('#', '#ff0000'),
      ),
    );
    const grid = applyEdits(red, editsFromPoints([{ x: 2, y: 2 }], makeCell('#', '#00ff00')));
    expect(similarCells(grid, 5, 5, 0, 0)).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 4 },
    ]);
    expect(similarCells(grid, 5, 5, 2, 2)).toEqual([{ x: 2, y: 2 }]);
  });

  it('за пределами холста не выделяет ничего', () => {
    expect(similarCells(emptyGrid(), 3, 3, 3, 0)).toEqual([]);
  });
});

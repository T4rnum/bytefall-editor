import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import {
  applyEdits,
  cropGrid,
  editsFromPoints,
  emptyGrid,
  getCell,
  gridBounds,
  keyOf,
  xOf,
  yOf,
} from '../grid';

describe('keys', () => {
  it('round-trips coordinates', () => {
    const key = keyOf(123, 456);
    expect(xOf(key)).toBe(123);
    expect(yOf(key)).toBe(456);
    expect(keyOf(0, 0)).toBe(0);
  });

  it('rejects coordinates that would alias another cell', () => {
    expect(() => keyOf(-1, 0)).toThrow(RangeError);
    expect(() => keyOf(0, -1)).toThrow(RangeError);
    expect(() => keyOf(65536, 0)).toThrow(RangeError);
  });
});

describe('applyEdits', () => {
  it('returns a new grid and leaves the original untouched', () => {
    const grid = emptyGrid();
    const next = applyEdits(grid, editsFromPoints([{ x: 1, y: 2 }], makeCell('@')));
    expect(grid.size).toBe(0);
    expect(getCell(next, 1, 2)?.glyph).toBe('@');
  });

  it('deletes cells for null and blank edits, returns same grid for empty edits', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    const grid = applyEdits(emptyGrid(), editsFromPoints(points, makeCell('#')));
    const cleared = applyEdits(
      grid,
      new Map([
        [keyOf(0, 0), null],
        [keyOf(1, 0), makeCell('')],
      ]),
    );
    expect(cleared.size).toBe(0);
    expect(applyEdits(grid, new Map())).toBe(grid);
  });
});

describe('gridBounds / cropGrid', () => {
  const points = [
    { x: 2, y: 3 },
    { x: 9, y: 9 },
  ];

  it('computes bounds of non-empty cells', () => {
    expect(gridBounds(emptyGrid())).toBeNull();
    const grid = applyEdits(emptyGrid(), editsFromPoints(points, makeCell('x')));
    expect(gridBounds(grid)).toEqual({ x: 2, y: 3, w: 8, h: 7 });
  });

  it('crops cells outside of the new size and keeps identity when nothing changes', () => {
    const grid = applyEdits(emptyGrid(), editsFromPoints(points, makeCell('x')));
    expect(cropGrid(grid, 10, 10)).toBe(grid);
    const cropped = cropGrid(grid, 5, 5);
    expect(cropped.size).toBe(1);
    expect(getCell(cropped, 2, 3)).toBeDefined();
  });
});

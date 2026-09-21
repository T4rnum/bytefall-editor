import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import { applyEdits, editsFromPoints, emptyGrid, keyOf } from '../grid';
import { clearRectEdits, copyRect, moveRectEdits, pasteEdits } from '../selection';

const points = [
  { x: 1, y: 1 },
  { x: 2, y: 1 },
  { x: 5, y: 5 },
];
const grid = applyEdits(emptyGrid(), editsFromPoints(points, makeCell('#')));

describe('copyRect / clearRectEdits', () => {
  it('copies cells into local coordinates and clears only existing cells', () => {
    const clip = copyRect(grid, { x: 1, y: 1, w: 2, h: 2 });
    expect(clip.width).toBe(2);
    expect([...clip.cells.keys()]).toEqual([keyOf(0, 0), keyOf(1, 0)]);
    const edits = clearRectEdits(grid, { x: 0, y: 0, w: 3, h: 3 });
    expect([...edits.entries()]).toEqual([
      [keyOf(1, 1), null],
      [keyOf(2, 1), null],
    ]);
  });
});

describe('pasteEdits / moveRectEdits', () => {
  it('pastes with offset and clips to the canvas', () => {
    const clip = copyRect(grid, { x: 1, y: 1, w: 2, h: 1 });
    const edits = pasteEdits(clip, 7, 0, 8, 8);
    expect([...edits.keys()]).toEqual([keyOf(7, 0)]);
  });

  it('moves a rectangle by clearing the source and writing the destination', () => {
    const edits = moveRectEdits(grid, { x: 1, y: 1, w: 2, h: 1 }, 1, 0, 8, 8);
    expect(edits.get(keyOf(1, 1))).toBeNull();
    expect(edits.get(keyOf(2, 1))?.glyph).toBe('#');
    expect(edits.get(keyOf(3, 1))?.glyph).toBe('#');
    expect(moveRectEdits(grid, { x: 1, y: 1, w: 2, h: 1 }, 0, 0, 8, 8).size).toBe(0);
  });
});

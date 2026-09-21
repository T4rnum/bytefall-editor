import { describe, expect, it } from 'vitest';
import { ellipsePoints, linePoints, rectPoints } from '../shapes';

const sorted = (points: { x: number; y: number }[]) =>
  [...points].sort((a, b) => a.y - b.y || a.x - b.x).map((p) => `${p.x},${p.y}`);

describe('linePoints', () => {
  it('includes both endpoints and has no gaps', () => {
    expect(linePoints(0, 0, 0, 0)).toEqual([{ x: 0, y: 0 }]);
    expect(linePoints(0, 0, 3, 0)).toHaveLength(4);
    const diag = linePoints(0, 0, 3, 3);
    expect(diag[0]).toEqual({ x: 0, y: 0 });
    expect(diag[3]).toEqual({ x: 3, y: 3 });
    expect(linePoints(5, 2, 0, 1)).toHaveLength(6);
    expect(linePoints(0, 4, 0, 0)).toHaveLength(5);
  });
});

describe('rectPoints', () => {
  it('produces outline and filled rectangles regardless of corner order', () => {
    expect(rectPoints({ x: 3, y: 3 }, { x: 0, y: 1 }, false)).toHaveLength(2 * 4 + 2 * 3 - 4);
    expect(rectPoints({ x: 0, y: 0 }, { x: 3, y: 2 }, true)).toHaveLength(12);
    expect(rectPoints({ x: 2, y: 2 }, { x: 2, y: 2 }, false)).toEqual([{ x: 2, y: 2 }]);
  });
});

describe('ellipsePoints', () => {
  it('handles degenerate and small sizes', () => {
    expect(ellipsePoints({ x: 1, y: 1 }, { x: 1, y: 1 }, false)).toEqual([{ x: 1, y: 1 }]);
    expect(ellipsePoints({ x: 0, y: 0 }, { x: 1, y: 1 }, true)).toHaveLength(4);
    expect(sorted(ellipsePoints({ x: 0, y: 0 }, { x: 2, y: 2 }, true))).toEqual([
      '1,0',
      '0,1',
      '1,1',
      '2,1',
      '1,2',
    ]);
  });

  it('draws a symmetric 5x5 circle whose outline is a subset of the fill', () => {
    const filled = ellipsePoints({ x: 0, y: 0 }, { x: 4, y: 4 }, true);
    const outline = ellipsePoints({ x: 4, y: 4 }, { x: 0, y: 0 }, false);
    const filledSet = new Set(sorted(filled));
    expect(outline.every((p) => filledSet.has(`${p.x},${p.y}`))).toBe(true);
    expect(outline.length).toBeLessThan(filled.length);
    expect(filledSet.has('0,0')).toBe(false);
    expect(filledSet.has('2,0')).toBe(true);
    expect(filledSet.has('2,2')).toBe(true);
    expect(outline.some((p) => p.x === 2 && p.y === 2)).toBe(false);
  });
});

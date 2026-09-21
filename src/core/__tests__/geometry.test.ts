import { describe, expect, it } from 'vitest';
import {
  clampRect,
  inBounds,
  iterateRect,
  rectContains,
  rectFromPoints,
  translateRect,
} from '../geometry';

describe('rectFromPoints / rectContains / translateRect', () => {
  it('normalizes corners and tests containment with exclusive far edges', () => {
    const rect = rectFromPoints({ x: 5, y: 7 }, { x: 2, y: 3 });
    expect(rect).toEqual({ x: 2, y: 3, w: 4, h: 5 });
    expect(rectContains(rect, 2, 3)).toBe(true);
    expect(rectContains(rect, 5, 7)).toBe(true);
    expect(rectContains(rect, 6, 7)).toBe(false);
    expect(rectContains(rect, 1, 3)).toBe(false);
    expect(translateRect(rect, -1, 2)).toEqual({ x: 1, y: 5, w: 4, h: 5 });
  });
});

describe('clampRect', () => {
  it('intersects with the canvas and returns null for empty intersections', () => {
    expect(clampRect({ x: -2, y: -2, w: 5, h: 5 }, 10, 10)).toEqual({ x: 0, y: 0, w: 3, h: 3 });
    expect(clampRect({ x: 8, y: 8, w: 5, h: 5 }, 10, 10)).toEqual({ x: 8, y: 8, w: 2, h: 2 });
    expect(clampRect({ x: 10, y: 0, w: 5, h: 5 }, 10, 10)).toBeNull();
    expect(clampRect({ x: 0, y: 0, w: 0, h: 5 }, 10, 10)).toBeNull();
  });
});

describe('inBounds / iterateRect', () => {
  it('checks bounds and iterates row by row', () => {
    expect(inBounds(0, 0, 1, 1)).toBe(true);
    expect(inBounds(1, 0, 1, 1)).toBe(false);
    expect(inBounds(-1, 0, 1, 1)).toBe(false);
    expect([...iterateRect({ x: 1, y: 1, w: 2, h: 2 })]).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ]);
  });
});

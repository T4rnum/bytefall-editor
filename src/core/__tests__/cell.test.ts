import { describe, expect, it } from 'vitest';
import { cellsEqual, isBlankCell, makeCell, parseAttrValue } from '../cell';

describe('makeCell', () => {
  it('validates colors and drops empty attrs', () => {
    expect(makeCell('#', '#ffffff', '#000000')).toEqual({
      glyph: '#',
      fg: '#ffffff',
      bg: '#000000',
    });
    expect(makeCell('#', '#ffffff', null, {})).not.toHaveProperty('attrs');
    expect(makeCell('#', '#ffffff', null, { glow: 1 }).attrs).toEqual({ glow: 1 });
    expect(() => makeCell('#', 'white')).toThrow(/foreground/);
    expect(() => makeCell('#', '#ffffff', 'black')).toThrow(/background/);
  });
});

describe('isBlankCell / cellsEqual', () => {
  it('treats missing, null and empty cells as blank and equal', () => {
    expect(isBlankCell(undefined)).toBe(true);
    expect(isBlankCell(makeCell(''))).toBe(true);
    expect(isBlankCell(makeCell('', '#ffffff', '#000000'))).toBe(false);
    expect(cellsEqual(null, makeCell(''))).toBe(true);
    expect(cellsEqual(null, makeCell('x'))).toBe(false);
  });

  it('ignores foreground for glyphless cells and compares attrs', () => {
    expect(cellsEqual(makeCell('', '#ff0000', '#000'), makeCell('', '#00ff00', '#000'))).toBe(true);
    expect(cellsEqual(makeCell('a', '#ff0000'), makeCell('a', '#00ff00'))).toBe(false);
    const withAttr = (k: number) => makeCell('a', '#fff', null, { k });
    expect(cellsEqual(withAttr(1), withAttr(2))).toBe(false);
    expect(cellsEqual(withAttr(1), withAttr(1))).toBe(true);
    expect(cellsEqual(withAttr(1), makeCell('a', '#fff'))).toBe(false);
  });
});

describe('parseAttrValue', () => {
  it('распознаёт логические значения и числа', () => {
    expect(parseAttrValue('true')).toBe(true);
    expect(parseAttrValue(' false ')).toBe(false);
    expect(parseAttrValue('12')).toBe(12);
    expect(parseAttrValue('-0.5')).toBe(-0.5);
  });

  it('остальное оставляет строкой как есть', () => {
    expect(parseAttrValue('стена')).toBe('стена');
    expect(parseAttrValue(' с пробелами ')).toBe(' с пробелами ');
    expect(parseAttrValue('')).toBe('');
    expect(parseAttrValue('Infinity')).toBe('Infinity');
    expect(parseAttrValue('True')).toBe('True');
  });
});

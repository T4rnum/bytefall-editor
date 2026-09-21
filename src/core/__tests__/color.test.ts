import { describe, expect, it } from 'vitest';
import { isHexColor, normalizeHex, over, parseHex, toHex, withAlpha } from '../color';

describe('parseHex', () => {
  it('parses short, long and alpha forms', () => {
    expect(parseHex('#fff')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseHex('#ff0000')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseHex('#00ff0080').a).toBeCloseTo(128 / 255);
    expect(parseHex('#0f08').a).toBeCloseTo(136 / 255);
  });

  it('throws on invalid input', () => {
    expect(() => parseHex('red')).toThrow(/Invalid hex/);
    expect(() => parseHex('#12345')).toThrow();
    expect(isHexColor('#abc')).toBe(true);
    expect(isHexColor(123)).toBe(false);
  });
});

describe('toHex / normalizeHex', () => {
  it('round-trips and omits alpha when opaque', () => {
    expect(toHex(parseHex('#1D2B53'))).toBe('#1d2b53');
    expect(toHex({ r: 1, g: 0, b: 0, a: 0.5 })).toBe('#ff000080');
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
  });
});

describe('over', () => {
  it('returns top when top is opaque and bottom when top is transparent', () => {
    const red = parseHex('#ff0000');
    const blue = parseHex('#0000ff');
    expect(over(red, blue)).toEqual(red);
    expect(over(withAlpha(red, 0), blue)).toEqual(blue);
  });

  it('blends half-transparent top over opaque bottom', () => {
    const result = over(withAlpha(parseHex('#ff0000'), 0.5), parseHex('#0000ff'));
    expect(result.a).toBe(1);
    expect(result.r).toBeCloseTo(0.5);
    expect(result.b).toBeCloseTo(0.5);
  });

  it('returns transparent when both are transparent', () => {
    expect(over(withAlpha(parseHex('#fff'), 0), withAlpha(parseHex('#000'), 0)).a).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { plural } from '../plural';

const frames = { one: 'кадр', few: 'кадра', many: 'кадров' };

describe('plural', () => {
  it('выбирает форму по последним цифрам, а не по величине', () => {
    expect(plural(1, frames)).toBe('1 кадр');
    expect(plural(2, frames)).toBe('2 кадра');
    expect(plural(5, frames)).toBe('5 кадров');
    expect(plural(11, frames)).toBe('11 кадров');
    expect(plural(21, frames)).toBe('21 кадр');
    expect(plural(22, frames)).toBe('22 кадра');
    expect(plural(111, frames)).toBe('111 кадров');
  });

  it('ноль — во множественном, дробь — как «несколько»', () => {
    expect(plural(0, frames)).toBe('0 кадров');
    expect(plural(1.5, frames)).toBe('1.5 кадра');
  });
});

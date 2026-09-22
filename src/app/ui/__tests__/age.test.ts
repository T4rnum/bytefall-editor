import { describe, expect, it } from 'vitest';
import { formatAge } from '../age';

describe('formatAge', () => {
  it('свежую запись называет «только что», без нуля минут', () => {
    expect(formatAge(0)).toBe('только что');
    expect(formatAge(59_000)).toBe('только что');
  });

  it('берёт самую крупную подходящую единицу и склоняет её', () => {
    expect(formatAge(5 * 60_000)).toBe('5 минут назад');
    expect(formatAge(2 * 3_600_000 + 5 * 60_000)).toBe('2 часа назад');
    expect(formatAge(3 * 86_400_000)).toBe('3 дня назад');
  });

  it('вчерашнее называет вчерашним', () => {
    expect(formatAge(86_400_000)).toBe('вчера');
  });
});

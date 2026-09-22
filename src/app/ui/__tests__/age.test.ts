import { describe, expect, it } from 'vitest';
import { formatAge } from '../age';

describe('formatAge', () => {
  it('свежую запись называет «только что», без нуля минут', () => {
    expect(formatAge(0)).toBe('just now');
    expect(formatAge(59_000)).toBe('just now');
  });

  it('берёт самую крупную подходящую единицу', () => {
    expect(formatAge(5 * 60_000)).toBe('5 minutes ago');
    expect(formatAge(2 * 3_600_000 + 5 * 60_000)).toBe('2 hours ago');
    expect(formatAge(3 * 86_400_000)).toBe('3 days ago');
  });

  it('вчерашнее называет вчерашним', () => {
    expect(formatAge(86_400_000)).toBe('yesterday');
  });
});

import { describe, expect, it } from 'vitest';
import {
  EASE_BACK,
  EASE_IN,
  EASE_IN_OUT,
  EASE_OUT,
  type Easing,
  ease,
  normalizeEasing,
  sameEasing,
} from '../easing';

/** Та же кривая перебором: точка кривой с ближайшей долей времени. Медленно, но наверняка. */
function bruteForce([x1, y1, x2, y2]: Easing, u: number): number {
  const at = (p1: number, p2: number, s: number): number =>
    3 * (1 - s) * (1 - s) * s * p1 + 3 * (1 - s) * s * s * p2 + s * s * s;
  let best = 0;
  let bestError = Infinity;
  for (let i = 0; i <= 20000; i++) {
    const s = i / 20000;
    const error = Math.abs(at(x1, x2, s) - u);
    if (error < bestError) {
      bestError = error;
      best = at(y1, y2, s);
    }
  }
  return best;
}

describe('кривые замедления', () => {
  it('начинаются в нуле и кончаются в единице, за краями держатся', () => {
    for (const curve of [EASE_IN_OUT, EASE_IN, EASE_OUT, EASE_BACK]) {
      expect(ease(curve, 0)).toBe(0);
      expect(ease(curve, 1)).toBe(1);
      expect(ease(curve, -0.5)).toBe(0);
      expect(ease(curve, 2)).toBe(1);
    }
  });

  it('совпадают с перебором по всей длине', () => {
    for (const curve of [
      EASE_IN_OUT,
      EASE_IN,
      EASE_OUT,
      EASE_BACK,
      [0.9, 0.1, 0.1, 0.9] as const,
    ]) {
      for (const u of [0.05, 0.2, 0.37, 0.5, 0.63, 0.8, 0.95]) {
        expect(ease(curve, u)).toBeCloseTo(bruteForce(curve, u), 3);
      }
    }
  });

  it('разгон медленный в начале, торможение — в конце, плавная симметрична', () => {
    expect(ease(EASE_IN, 0.25)).toBeLessThan(0.25);
    expect(ease(EASE_OUT, 0.25)).toBeGreaterThan(0.25);
    expect(ease(EASE_IN_OUT, 0.5)).toBeCloseTo(0.5, 6);
    expect(ease(EASE_IN_OUT, 0.2) + ease(EASE_IN_OUT, 0.8)).toBeCloseTo(1, 6);
  });

  it('кривая с перелётом проскакивает цель и возвращается', () => {
    const samples = Array.from({ length: 99 }, (_, i) => ease(EASE_BACK, (i + 1) / 100));
    expect(Math.max(...samples)).toBeGreaterThan(1);
  });

  it('вертикальная касательная на краю не ломает решение', () => {
    // Ньютон на такой кривой спотыкается о нулевой наклон: выручает деление пополам.
    const steep: Easing = [0, 1, 0, 1];
    expect(ease(steep, 0.001)).toBeGreaterThan(0.1);
    expect(ease(steep, 0.5)).toBeCloseTo(bruteForce(steep, 0.5), 3);
  });

  it('нормализация держит время в [0, 1] и ограничивает перелёт', () => {
    expect(normalizeEasing([-1, 9, 2, -9])).toEqual([0, 4, 1, -4]);
    expect(normalizeEasing([Number.NaN, 0, 0.5])).toEqual([0.42, 0, 0.5, 1]);
    expect(sameEasing(normalizeEasing([...EASE_IN]), EASE_IN)).toBe(true);
    expect(sameEasing(EASE_IN, EASE_OUT)).toBe(false);
  });
});

/**
 * Кривая замедления между двумя ключами — `cubic-bezier`, как в CSS. Концы кривой стоят в (0, 0)
 * и (1, 1), две опорные точки задают разгон и торможение. По оси времени точки держатся в
 * [0, 1], иначе время пошло бы назад; по оси значения могут выходить за край — так получаются
 * замах перед движением и перелёт с возвратом.
 */
export type Easing = readonly [x1: number, y1: number, x2: number, y2: number];

export const EASE_IN_OUT: Easing = [0.42, 0, 0.58, 1];
export const EASE_IN: Easing = [0.42, 0, 1, 1];
export const EASE_OUT: Easing = [0, 0, 0.58, 1];
/** Проскакивает цель и возвращается. */
export const EASE_BACK: Easing = [0.34, 1.56, 0.64, 1];

/** Насколько опорные точки могут выходить за край по оси значения. */
export const MAX_EASING_OVERSHOOT = 4;

const EPSILON = 1e-7;

/** Коэффициенты кубики ((a·s + b)·s + c)·s с концами в 0 и 1 и опорами p1, p2. */
function coefficients(p1: number, p2: number): readonly [number, number, number] {
  const c = 3 * p1;
  const b = 3 * (p2 - p1) - c;
  return [1 - c - b, b, c];
}

/**
 * Параметр кривой, при котором она проходит долю времени `u`. Метод Ньютона сходится за
 * несколько шагов там, где кривая не плоская; если он застрял или вышел за край, работает
 * деление пополам — медленнее, но наверняка.
 */
function solve(x1: number, x2: number, u: number): number {
  const [a, b, c] = coefficients(x1, x2);
  const x = (s: number): number => ((a * s + b) * s + c) * s;
  let s = u;
  for (let i = 0; i < 8; i++) {
    const error = x(s) - u;
    if (Math.abs(error) < EPSILON) return s;
    const slope = (3 * a * s + 2 * b) * s + c;
    if (Math.abs(slope) < 1e-6) break;
    s -= error / slope;
    if (s < 0 || s > 1) break;
  }
  let lo = 0;
  let hi = 1;
  while (hi - lo > EPSILON) {
    const mid = (lo + hi) / 2;
    if (x(mid) < u) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Доля пути в момент, когда прошла доля `u` времени между ключами. */
export function ease(curve: Easing, u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const [x1, y1, x2, y2] = curve;
  const [a, b, c] = coefficients(y1, y2);
  const s = solve(x1, x2, u);
  return ((a * s + b) * s + c) * s;
}

/** Кривая в пределах формата: время в [0, 1], значение — с ограниченным перелётом. */
export function normalizeEasing(curve: readonly number[]): Easing {
  const at = (i: number, min: number, max: number, fallback: number): number => {
    const v = curve[i];
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  };
  const over = MAX_EASING_OVERSHOOT;
  return [at(0, 0, 1, 0.42), at(1, -over, over, 0), at(2, 0, 1, 0.58), at(3, -over, over, 1)];
}

export const sameEasing = (a: Easing, b: Easing): boolean =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

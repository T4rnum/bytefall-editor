import type { Point } from './geometry';

/**
 * Аффинное преобразование плоскости документа: x' = a·x + c·y + e, y' = b·x + d·y + f.
 * Ось Y документа смотрит вниз, поэтому положительный угол поворачивает по часовой стрелке.
 */
export interface Affine {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Композиция: сначала `inner`, потом `outer`. */
export function multiply(outer: Affine, inner: Affine): Affine {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

export function applyAffine(m: Affine, x: number, y: number): Point {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

/** Обратное преобразование. null, если объект сжат в линию и обратить его нельзя. */
export function invertAffine(m: Affine): Affine | null {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return null;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

/**
 * Синус и косинус угла в градусах. Кратные 90° точные: `Math.cos(Math.PI / 2)` даёт 6e-17, и
 * повёрнутая на прямой угол ячейка вставала бы не ровно в ячейку.
 */
export function sinCosDeg(deg: number): { readonly sin: number; readonly cos: number } {
  const turn = ((deg % 360) + 360) % 360;
  if (turn === 0) return { sin: 0, cos: 1 };
  if (turn === 90) return { sin: 1, cos: 0 };
  if (turn === 180) return { sin: 0, cos: -1 };
  if (turn === 270) return { sin: -1, cos: 0 };
  const rad = (deg * Math.PI) / 180;
  return { sin: Math.sin(rad), cos: Math.cos(rad) };
}

/**
 * Масштаб вдоль осей и поворот вокруг опорной точки, затем сдвиг:
 * p ↦ shift + pivot + R·S·(p − pivot).
 */
export function rotateScaleAbout(
  deg: number,
  sx: number,
  sy: number,
  pivot: Point,
  shift: Point,
): Affine {
  const { sin, cos } = sinCosDeg(deg);
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  // Вклад опорной точки считается отдельно: без поворота и масштаба он ровно ноль, и целый
  // сдвиг остаётся целым без хвостов округления.
  return {
    a,
    b,
    c,
    d,
    e: shift.x + (pivot.x - (a * pivot.x + c * pivot.y)),
    f: shift.y + (pivot.y - (b * pivot.x + d * pivot.y)),
  };
}

/** Сдвиг на целое число ячеек без поворота и масштаба: такой объект рисуется прямо в сетку. */
export function integerOffset(m: Affine): Point | null {
  if (m.a !== 1 || m.b !== 0 || m.c !== 0 || m.d !== 1) return null;
  if (!Number.isInteger(m.e) || !Number.isInteger(m.f)) return null;
  return { x: m.e, y: m.f };
}

/**
 * Поворот и масштаб, которыми символ уходит на GPU. Матрица без перекоса восстанавливается
 * из них точно. Перекос появляется только при неравном масштабе родителя и повороте ребёнка;
 * тогда сохраняются направление оси X и площадь символа.
 */
export function decomposeAffine(m: Affine): {
  readonly rot: number;
  readonly sx: number;
  readonly sy: number;
} {
  const sx = Math.hypot(m.a, m.b);
  if (sx === 0) return { rot: 0, sx: 0, sy: 0 };
  return { rot: Math.atan2(m.b, m.a), sx, sy: (m.a * m.d - m.b * m.c) / sx };
}

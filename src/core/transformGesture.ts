import { type Affine, applyAffine, invertAffine } from './affine';
import type { Point } from './geometry';
import { type Transform2D, withPivot } from './transform';

/** Ручки рамки: стороны света относительно самого объекта, а не экрана. */
export type ScaleHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Точность жестов: хвосты вроде 29.999999° в инспекторе никому не нужны. */
const ANGLE_STEP = 0.1;
const SCALE_STEP = 0.01;
/** Опора прилипает к половинам ячеек: тогда поворот на прямой угол ставит ячейки в ячейки. */
const PIVOT_STEP = 0.5;

/** Округление до шага без двоичных хвостов: 0.1 · 3 должно дать 0.3, а не 0.30000000000000004. */
function roundTo(value: number, step: number): number {
  const decimals = step < 1 ? Math.ceil(-Math.log10(step)) : 0;
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

/** Угол в пределах (−180, 180]. */
export function normalizeAngle(deg: number): number {
  const turn = ((deg % 360) + 360) % 360;
  return turn > 180 ? turn - 360 : turn;
}

const angleOf = (center: Point, p: Point): number =>
  (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI;

/** Опорная точка объекта в координатах документа. */
export function pivotInDocument(t: Transform2D, world: Affine): Point {
  return applyAffine(world, t.px, t.py);
}

/**
 * Поворот жестом: объект доворачивается на угол, который указатель прошёл вокруг опоры.
 * `snap` — шаг в градусах, например 15 с зажатым Shift.
 */
export function rotateByGesture(
  start: Transform2D,
  pivot: Point,
  from: Point,
  to: Point,
  snap: number | null = null,
): number {
  const rot = normalizeAngle(start.rot + angleOf(pivot, to) - angleOf(pivot, from));
  return snap ? normalizeAngle(roundTo(rot, snap)) : roundTo(rot, ANGLE_STEP);
}

/** Какие оси тянет ручка: боковые — одну, угловые — обе. */
function axesOf(handle: ScaleHandle): { x: boolean; y: boolean } {
  return { x: handle !== 'n' && handle !== 's', y: handle !== 'e' && handle !== 'w' };
}

/**
 * Масштаб жестом за ручку рамки. Во сколько раз указатель ушёл от опоры вдоль оси объекта, во
 * столько же растёт масштаб по этой оси. `uniform` сохраняет пропорции: берётся одно отношение
 * по направлению от опоры к ручке.
 *
 * `world` — матрица объекта в начале жеста: оси считаются по ней, а не по текущему черновику.
 */
export function scaleByGesture(
  start: Transform2D,
  world: Affine,
  handle: ScaleHandle,
  from: Point,
  to: Point,
  uniform: boolean,
): { sx: number; sy: number } {
  const pivot = pivotInDocument(start, world);
  const a = { x: from.x - pivot.x, y: from.y - pivot.y };
  const b = { x: to.x - pivot.x, y: to.y - pivot.y };
  if (uniform) {
    const lengthSq = a.x * a.x + a.y * a.y;
    const k = lengthSq > 1e-9 ? (a.x * b.x + a.y * b.y) / lengthSq : 1;
    return { sx: roundTo(start.sx * k, SCALE_STEP), sy: roundTo(start.sy * k, SCALE_STEP) };
  }
  const ratio = (axis: Point): number => {
    const length = Math.hypot(axis.x, axis.y);
    const along = (v: Point): number => (v.x * axis.x + v.y * axis.y) / length;
    return Math.abs(along(a)) > 1e-9 ? along(b) / along(a) : 1;
  };
  const axes = axesOf(handle);
  return {
    sx: axes.x ? roundTo(start.sx * ratio({ x: world.a, y: world.b }), SCALE_STEP) : start.sx,
    sy: axes.y ? roundTo(start.sy * ratio({ x: world.c, y: world.d }), SCALE_STEP) : start.sy,
  };
}

/**
 * Опора в точку документа `point`, объект при этом стоит на месте. Точка прилипает к половинам
 * ячеек объекта. `world` — матрица объекта сейчас.
 */
export function pivotByGesture(t: Transform2D, world: Affine, point: Point): Transform2D {
  const inverse = invertAffine(world);
  if (!inverse) return t;
  const local = applyAffine(inverse, point.x, point.y);
  return withPivot(t, { x: roundTo(local.x, PIVOT_STEP), y: roundTo(local.y, PIVOT_STEP) });
}

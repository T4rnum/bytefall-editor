import type { Point } from '../../core/geometry';
import { MAX_SCENE_DURATION } from '../../core/time';

/**
 * Взгляд редактора кривых: какой отрезок времени (мс) и значений виден. Время идёт вправо,
 * значение — вверх, как в Graph Editor Blender. Масштабы осей независимы: у поворота сотни
 * градусов, у непрозрачности — доли единицы.
 */
export interface CurveView {
  readonly t0: number;
  readonly t1: number;
  /** Низ и верх поля. */
  readonly v0: number;
  readonly v1: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Что вписывать: моменты и значения кривых. */
export interface CurveBounds {
  readonly t0: number;
  readonly t1: number;
  readonly v0: number;
  readonly v1: number;
}

const MIN_TIME_SPAN = 50;
const MAX_TIME_SPAN = MAX_SCENE_DURATION * 2;
const MIN_VALUE_SPAN = 1e-3;
const MAX_VALUE_SPAN = 1e7;
/** Поле вокруг вписанных кривых, в пикселях. */
const FIT_MARGIN = 24;

export const toScreen = (view: CurveView, size: Size, t: number, v: number): Point => ({
  x: ((t - view.t0) / (view.t1 - view.t0)) * size.width,
  y: ((view.v1 - v) / (view.v1 - view.v0)) * size.height,
});

/** Экранная точка в момент (`x`) и значение (`y`). */
export const fromScreen = (view: CurveView, size: Size, x: number, y: number): Point => ({
  x: view.t0 + (x / size.width) * (view.t1 - view.t0),
  y: view.v1 - (y / size.height) * (view.v1 - view.v0),
});

/** Пикселей на миллисекунду: по нему липнут ключи, как в таймлайне. */
export const timeScale = (view: CurveView, size: Size): number => size.width / (view.t1 - view.t0);

const clampSpan = (span: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, span));

/**
 * Масштаб вокруг экранной точки: `fx` по времени, `fy` по значению, больше единицы — ближе.
 * Точка под указателем остаётся под ним.
 */
export function zoomView(
  view: CurveView,
  size: Size,
  at: Point,
  fx: number,
  fy: number,
): CurveView {
  const anchor = fromScreen(view, size, at.x, at.y);
  const tSpan = clampSpan((view.t1 - view.t0) / fx, MIN_TIME_SPAN, MAX_TIME_SPAN);
  const vSpan = clampSpan((view.v1 - view.v0) / fy, MIN_VALUE_SPAN, MAX_VALUE_SPAN);
  const t0 = anchor.x - (at.x / size.width) * tSpan;
  const v1 = anchor.y + (at.y / size.height) * vSpan;
  return { t0, t1: t0 + tSpan, v0: v1 - vSpan, v1 };
}

/** Сдвиг на экранные пиксели: поле едет за указателем. */
export function panView(view: CurveView, size: Size, dx: number, dy: number): CurveView {
  const dt = (dx / size.width) * (view.t1 - view.t0);
  const dv = (dy / size.height) * (view.v1 - view.v0);
  return { t0: view.t0 - dt, t1: view.t1 - dt, v0: view.v0 + dv, v1: view.v1 + dv };
}

/**
 * Взгляд, при котором кривые целиком видны с полем. Плоская кривая получает высоту в единицу
 * вокруг своего значения, одиночный ключ — секунду вокруг себя: иначе вписывать было бы нечего.
 */
export function fitCurves(bounds: CurveBounds | null, size: Size): CurveView {
  if (!bounds) return { t0: 0, t1: 2000, v0: -1, v1: 1 };
  let { t0, t1, v0, v1 } = bounds;
  if (t1 - t0 < MIN_TIME_SPAN) [t0, t1] = [t0 - 500, t1 + 500];
  if (v1 - v0 < MIN_VALUE_SPAN) [v0, v1] = [v0 - 0.5, v1 + 0.5];
  const room = (px: number): number => Math.max(1, px - 2 * FIT_MARGIN);
  const padT = ((t1 - t0) * FIT_MARGIN) / room(size.width);
  const padV = ((v1 - v0) * FIT_MARGIN) / room(size.height);
  return { t0: t0 - padT, t1: t1 + padT, v0: v0 - padV, v1: v1 + padV };
}

/**
 * Круглый шаг делений: 1, 2 или 5 на степень десяти, не чаще чем через `minPx` пикселей на
 * отрезке `span`, занимающем `pixels`.
 */
export function niceStep(span: number, pixels: number, minPx: number): number {
  const raw = (span * minPx) / Math.max(1, pixels);
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const k of [1, 2, 5, 10]) if (k * power >= raw) return k * power;
  return 10 * power;
}

/** Деления с шагом `step` внутри отрезка. */
export function ticksIn(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let i = Math.ceil(from / step); i * step <= to && out.length < 200; i++) {
    out.push(Number((i * step).toPrecision(12)));
  }
  return out;
}

/** Подпись значения по шагу делений: столько знаков, сколько различает шаг, с запятой. */
export function formatValue(value: number, step: number): string {
  const decimals = Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9)));
  return value
    .toFixed(decimals)
    .replace('.', ',')
    .replace(/^-(0(,0+)?)$/, '$1');
}

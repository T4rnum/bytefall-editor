import { roundTime } from '../../core/time';

/**
 * Геометрия таймлайна: миллисекунды в пиксели и обратно, деления линейки, привязка. Масштаб —
 * пикселей на миллисекунду.
 */

export const MIN_SCALE = 0.02;
export const MAX_SCALE = 2;

/** Шаги крупных делений линейки: круглые доли секунды и секунды. */
const STEPS = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 30000, 60000];
/** Крупное деление не уже этого: иначе подписи налезут друг на друга. */
const MIN_STEP_PX = 64;

export const clampScale = (scale: number): number =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number.isFinite(scale) ? scale : MIN_SCALE));

/** Шаг крупных делений для масштаба. */
export function rulerStep(scale: number): number {
  return STEPS.find((step) => step * scale >= MIN_STEP_PX) ?? STEPS[STEPS.length - 1];
}

export interface RulerTicks {
  readonly step: number;
  readonly major: readonly number[];
  readonly minor: readonly number[];
}

/** Деления линейки до `span`: крупные с подписью и по четыре мелких между ними. */
export function rulerTicks(scale: number, span: number): RulerTicks {
  const step = rulerStep(scale);
  const minorStep = step / 5;
  const major: number[] = [];
  const minor: number[] = [];
  for (let i = 0; i * minorStep <= span; i++) {
    const t = roundTime(i * minorStep);
    if (i % 5 === 0) major.push(t);
    else minor.push(t);
  }
  return { step, major, minor };
}

/** Секунды для подписи: без лишних нулей и с запятой, как принято в русском. */
export function formatSeconds(ms: number): string {
  const seconds = Math.round(ms) / 1000;
  return String(Number(seconds.toFixed(3))).replace('.', ',');
}

/**
 * Сколько времени показывает таймлайн: сцена, ключи и указатель с запасом справа, чтобы было
 * куда поставить следующий ключ. Не меньше секунды: короткая сцена не растягивается в линию.
 */
export function timelineSpan(sceneEnd: number, lastKey: number, time: number): number {
  return Math.max(1000, Math.round(Math.max(sceneEnd, lastKey, time) * 1.15));
}

/** Масштаб, при котором `span` помещается в `width` пикселей. */
export const fitScale = (width: number, span: number): number =>
  clampScale(width / Math.max(1, span));

export interface SnapTargets {
  /** Моменты, к которым тянет в первую очередь: ключи, начала кадров, указатель. */
  readonly points: readonly number[];
  /** Шаг сетки частоты кадров сцены. */
  readonly step: number;
  /** Насколько близко надо подвести, в миллисекундах. */
  readonly tolerance: number;
}

/**
 * Привязка момента. Ближайшая точка в пределах допуска побеждает, иначе момент встаёт на такт
 * частоты кадров, если тот рядом: ключ, поставленный на такт, попадает ровно в кадр экспорта.
 */
export function snapTime(time: number, targets: SnapTargets): number {
  let best = time;
  let distance = targets.tolerance;
  for (const point of targets.points) {
    const d = Math.abs(point - time);
    if (d <= distance) {
      best = point;
      distance = d;
    }
  }
  if (best !== time) return best;
  const tick = roundTime(Math.round(time / targets.step) * targets.step);
  return Math.abs(tick - time) <= targets.tolerance ? tick : roundTime(time);
}

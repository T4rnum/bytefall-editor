import { clamp01, parseHex, toHex } from './color';
import { type Layer, MAX_DIMENSION } from './document';
import { EFFECT_PARAM_SPECS, type LayerEffect, limitParam } from './effects';
import type { SceneObject } from './object';
import { MAX_ROTATION, MAX_SCALE, MAX_SHIFT, MIN_SCALE, normalizeTransform } from './transform';
import type { EffectParam, ObjectProperty, TrackTarget } from './tracks';

/**
 * Чтение и запись анимируемых свойств узлов как каналов чисел. Ключи, интерполяция и правка
 * вычисленного кадра работают с каналами и не знают, где свойство лежит в документе.
 */

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;
const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

/** Положение объекта: домашняя ячейка плюс сдвиг. Дальше этого объект за холст не уходит. */
const MAX_POSITION = MAX_DIMENSION + MAX_SHIFT;

export function tintChannels(tint: string | null): number[] {
  if (tint === null) return [0, 0, 0, 0];
  const c = parseHex(tint);
  return [c.r, c.g, c.b, c.a];
}

/** Оттенок из каналов. Нулевая сила — это отсутствие оттенка, а не чёрный оттенок. */
export function tintFromChannels(value: readonly number[]): string | null {
  const a = clamp01(value[3]);
  return a <= 0 ? null : toHex({ r: value[0], g: value[1], b: value[2], a });
}

/**
 * Положение — это домашняя ячейка вместе со сдвигом: `x + dx`. Анимация двигает объект
 * плавно, а документ по-прежнему хранит целую ячейку и сдвиг не больше половины клетки.
 */
export function readObjectValue(obj: SceneObject, property: ObjectProperty): number[] {
  const t = obj.transform;
  switch (property) {
    case 'position':
      return [round6(t.x + t.dx), round6(t.y + t.dy)];
    case 'rotation':
      return [t.rot];
    case 'scale':
      return [t.sx, t.sy];
    case 'opacity':
      return [obj.opacity];
    case 'tint':
      return tintChannels(obj.tint);
  }
}

export function writeObjectValue(
  obj: SceneObject,
  property: ObjectProperty,
  value: readonly number[],
): SceneObject {
  const t = obj.transform;
  switch (property) {
    case 'position': {
      const x = Math.round(value[0]);
      const y = Math.round(value[1]);
      const transform = { ...t, x, y, dx: value[0] - x, dy: value[1] - y };
      return { ...obj, transform: normalizeTransform(transform) };
    }
    case 'rotation':
      return { ...obj, transform: normalizeTransform({ ...t, rot: value[0] }) };
    case 'scale':
      return { ...obj, transform: normalizeTransform({ ...t, sx: value[0], sy: value[1] }) };
    case 'opacity':
      return { ...obj, opacity: round6(clamp01(value[0])) };
    case 'tint':
      return { ...obj, tint: tintFromChannels(value) };
  }
}

export const readLayerValue = (layer: Layer): number[] => [layer.opacity];

export const writeLayerValue = (layer: Layer, value: readonly number[]): Layer => ({
  ...layer,
  opacity: round6(clamp01(value[0])),
});

/** Параметр эффекта или null, если у эффекта этого вида такого параметра нет. */
export function readEffectValue(effect: LayerEffect, param: EffectParam): number[] | null {
  if (!EFFECT_PARAM_SPECS[effect.kind][param]) return null;
  return [(effect as unknown as Readonly<Record<string, number>>)[param]];
}

export function writeEffectValue(
  effect: LayerEffect,
  param: EffectParam,
  value: readonly number[],
): LayerEffect {
  const spec = EFFECT_PARAM_SPECS[effect.kind][param];
  return spec ? { ...effect, [param]: limitParam(spec, value[0]) } : effect;
}

/** Самые широкие пределы параметра среди всех эффектов: так проверяются ключи в файле. */
function paramLimits(param: EffectParam): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const specs of Object.values(EFFECT_PARAM_SPECS)) {
    const spec = specs[param];
    if (!spec) continue;
    min = Math.min(min, spec.min);
    max = Math.max(max, spec.max);
  }
  return { min, max };
}

/**
 * Значение ключа в пределах формата. Оттенок округляется до восьми бит, как любой цвет в файле:
 * иначе ключ, сохранённый и открытый снова, чуть отличался бы от записанного.
 */
export function normalizeValue(target: TrackTarget, value: readonly number[]): number[] {
  if (target.node === 'layer') return [round6(clamp01(value[0]))];
  if (target.node === 'effect') {
    const { min, max } = paramLimits(target.property);
    return [round6(clamp(value[0], min, max))];
  }
  switch (target.property) {
    case 'position':
      return value.slice(0, 2).map((v) => round6(clamp(v, -MAX_POSITION, MAX_POSITION)));
    case 'rotation':
      return [round6(clamp(value[0], -MAX_ROTATION, MAX_ROTATION))];
    case 'scale':
      return value.slice(0, 2).map((v) => round6(clamp(v, MIN_SCALE, MAX_SCALE)));
    case 'opacity':
      return [round6(clamp01(value[0]))];
    case 'tint':
      return value.slice(0, 4).map((v) => Math.round(clamp01(v) * 255) / 255);
  }
}

/** Пределы значения ключа для проверки файла, по каналу. */
export function valueLimits(target: TrackTarget): { min: number; max: number } {
  if (target.node === 'layer') return { min: 0, max: 1 };
  if (target.node === 'effect') return paramLimits(target.property);
  switch (target.property) {
    case 'position':
      return { min: -MAX_POSITION, max: MAX_POSITION };
    case 'rotation':
      return { min: -MAX_ROTATION, max: MAX_ROTATION };
    case 'scale':
      return { min: MIN_SCALE, max: MAX_SCALE };
    default:
      return { min: 0, max: 1 };
  }
}

export const sameValue = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

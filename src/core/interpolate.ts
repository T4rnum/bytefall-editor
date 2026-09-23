import { ease } from './easing';
import { type Key, type Track, type ValueKind, valueKind } from './tracks';

/** Индекс последнего ключа, чей момент не позже `time`. Ключи идут по возрастанию. */
function segmentAt(keys: readonly Key[], time: number): number {
  let lo = 0;
  let hi = keys.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keys[mid].time <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

/**
 * Смешивание двух значений. Цвет смешивается с учётом силы: иначе переход от «без оттенка»
 * к красному шёл бы через тёмно-красный — у «без оттенка» цвет чёрный, просто сила нулевая.
 */
export function mixValues(
  kind: ValueKind,
  a: readonly number[],
  b: readonly number[],
  u: number,
): number[] {
  if (kind !== 'color') return a.map((v, i) => lerp(v, b[i], u));
  const alpha = lerp(a[3], b[3], u);
  if (alpha <= 0) return [0, 0, 0, 0];
  const channel = (i: number): number => lerp(a[i] * a[3], b[i] * b[3], u) / alpha;
  return [channel(0), channel(1), channel(2), alpha];
}

/**
 * Значение трека в момент `time`. До первого ключа держится первое значение, после последнего —
 * последнее. Результат зависит только от ключей и момента, поэтому перемотка в любую точку
 * даёт то же, что проигрывание до неё.
 */
export function valueAt(track: Track, time: number): readonly number[] {
  const { keys } = track;
  if (time <= keys[0].time) return keys[0].value;
  const last = keys[keys.length - 1];
  if (time >= last.time) return last.value;
  const index = segmentAt(keys, time);
  const from = keys[index];
  const to = keys[index + 1];
  const u = (time - from.time) / (to.time - from.time);
  switch (from.interpolation) {
    case 'step':
      return from.value;
    case 'linear':
      return mixValues(valueKind(track), from.value, to.value, u);
    case 'bezier':
      return mixValues(valueKind(track), from.value, to.value, ease(from.easing, u));
  }
}

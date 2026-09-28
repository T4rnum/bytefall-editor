import { valueLimits } from './animated';
import { type Easing, normalizeEasing } from './easing';
import type { Point } from './geometry';
import { roundTime } from './time';
import { type Key, type Track, type TrackTarget, findTrack, replaceKeys } from './tracks';

/**
 * Кривые треков для редактора кривых (`docs/DESIGN.md`, раздел 4.2). Переход от ключа к
 * следующему — кривая прогресса `easing`. У канала с разностью значений Δv она же — кубическая
 * кривая Безье в осях (время, значение): опоры `(t₀ + x₁·Δt, v₀ + y₁·Δv)` и
 * `(t₀ + x₂·Δt, v₀ + y₂·Δv)`. Эти опоры редактор и показывает ручками. Точки здесь — `x` время
 * в миллисекундах, `y` значение канала.
 */

/** Ручка перехода: выходящая из ключа или входящая в следующий. */
export type HandleSide = 'out' | 'in';

/** Кривая прогресса, совпадающая с прямой: у равномерного перехода ручки стоят на третях. */
export const LINEAR_EASING: Easing = [1 / 3, 1 / 3, 2 / 3, 2 / 3];

/** Кривая перехода от ключа; у перехода скачком её нет. */
export function segmentEasing(key: Key): Easing | null {
  if (key.interpolation === 'step') return null;
  return key.interpolation === 'bezier' ? key.easing : LINEAR_EASING;
}

/** Ручки перехода от `from` к `to` по каналу `channel`; у перехода скачком их нет. */
export function segmentHandles(
  from: Key,
  to: Key,
  channel: number,
): { readonly out: Point; readonly in: Point } | null {
  const easing = segmentEasing(from);
  if (!easing) return null;
  const dt = to.time - from.time;
  const v0 = from.value[channel];
  const dv = to.value[channel] - v0;
  return {
    out: { x: from.time + easing[0] * dt, y: v0 + easing[1] * dv },
    in: { x: from.time + easing[2] * dt, y: v0 + easing[3] * dv },
  };
}

/**
 * Кривая перехода после того, как ручку `side` канала `channel` поставили в точку `at`. Время
 * ручки держится внутри перехода, значение — в пределах перелёта формата. У канала без разницы
 * значений ручка двигается только по времени: её вертикаль ничего не задаёт.
 */
export function easingWithHandle(
  from: Key,
  to: Key,
  channel: number,
  side: HandleSide,
  at: Point,
): Easing {
  const easing = segmentEasing(from) ?? LINEAR_EASING;
  const dt = to.time - from.time;
  const dv = to.value[channel] - from.value[channel];
  const i = side === 'out' ? 0 : 2;
  const next = [...easing];
  next[i] = dt > 0 ? (at.x - from.time) / dt : easing[i];
  if (Math.abs(dv) > 1e-9) next[i + 1] = (at.y - from.value[channel]) / dv;
  return normalizeEasing(next);
}

/** Ключи трека `target` после `update`; трека нет — треки как были. */
function withTrackKeys(
  tracks: readonly Track[],
  target: TrackTarget,
  update: (keys: readonly Key[]) => readonly Key[],
): readonly Track[] {
  const track = findTrack(tracks, target);
  return track ? replaceKeys(tracks, target, update(track.keys)) : tracks;
}

/** Переход от ключа трека в момент `time` идёт по кривой `easing`. */
export function setSegmentEasing(
  tracks: readonly Track[],
  target: TrackTarget,
  time: number,
  easing: Easing,
): readonly Track[] {
  const at = roundTime(time);
  return withTrackKeys(tracks, target, (keys) =>
    keys.map((k) => (k.time === at ? { ...k, interpolation: 'bezier' as const, easing } : k)),
  );
}

/**
 * Сдвигает канал `channel` у ключей трека в моменты `times` на `delta`. Значение не выходит за
 * пределы свойства — те же, что проверяет файл, иначе документ не открылся бы.
 */
export function offsetKeyChannel(
  tracks: readonly Track[],
  target: TrackTarget,
  times: readonly number[],
  channel: number,
  delta: number,
): readonly Track[] {
  if (delta === 0) return tracks;
  const moved = new Set(times.map(roundTime));
  const { min, max } = valueLimits(target);
  return withTrackKeys(tracks, target, (keys) =>
    keys.map((k) => {
      if (!moved.has(k.time)) return k;
      const value = k.value.slice();
      value[channel] = Math.min(max, Math.max(min, value[channel] + delta));
      return { ...k, value };
    }),
  );
}

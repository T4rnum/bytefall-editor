import { type HandleSide, segmentHandles } from '../../core/curves';
import type { Point } from '../../core/geometry';
import { valueAt } from '../../core/interpolate';
import { type KeyRef, trackKey, valueKind } from '../../core/tracks';
import type { CurveChannel } from './curveChannels';

/**
 * Геометрия кривых на экране: путь SVG канала, точки ключей и ручек, попадания. `map` переводит
 * момент и значение в пиксели редактора.
 */
export type ScreenMap = (t: number, v: number) => Point;
/** Перевод у каждого канала свой: с нормировкой у каждой кривой своя ось значений. */
export type MapOf = (channel: CurveChannel) => ScreenMap;

const px = (v: number): string => (Math.round(v * 10) / 10).toString();
const at = (p: Point): string => `${px(p.x)} ${px(p.y)}`;

/** Сколько точек на переход у цвета: его смешивание с альфой — не кривая Безье. */
const COLOR_SAMPLES = 16;

/**
 * Путь канала от `from` до `to` по времени. До первого ключа и после последнего значение
 * держится, как в `evaluate`. Кривая перехода — настоящая кривая Безье с теми же опорами, что
 * у ручек, прямая — прямая, скачок — ступенька. Цвет смешивается с учётом альфы, поэтому его
 * путь — ломаная по выборкам.
 */
export function channelPath(
  channel: CurveChannel,
  map: ScreenMap,
  from: number,
  to: number,
): string {
  const { track } = channel;
  const c = channel.channel;
  const keys = track.keys;
  const first = keys[0];
  const parts = [`M${at(map(Math.min(from, first.time), first.value[c]))}`];
  parts.push(`L${at(map(first.time, first.value[c]))}`);
  const color = valueKind(track) === 'color';
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (a.interpolation === 'step') {
      parts.push(`L${at(map(b.time, a.value[c]))}`, `L${at(map(b.time, b.value[c]))}`);
    } else if (color) {
      for (let s = 1; s <= COLOR_SAMPLES; s++) {
        const t = a.time + ((b.time - a.time) * s) / COLOR_SAMPLES;
        parts.push(`L${at(map(t, valueAt(track, t)[c]))}`);
      }
    } else if (a.interpolation === 'linear') {
      parts.push(`L${at(map(b.time, b.value[c]))}`);
    } else {
      const h = segmentHandles(a, b, c) as NonNullable<ReturnType<typeof segmentHandles>>;
      parts.push(
        `C${at(map(h.out.x, h.out.y))} ${at(map(h.in.x, h.in.y))} ${at(map(b.time, b.value[c]))}`,
      );
    }
  }
  const last = keys[keys.length - 1];
  parts.push(`L${at(map(Math.max(to, last.time), last.value[c]))}`);
  return parts.join(' ');
}

export interface KeyPoint {
  readonly ref: KeyRef;
  readonly channel: CurveChannel;
  readonly x: number;
  readonly y: number;
}

export interface HandlePoint {
  readonly channel: CurveChannel;
  /** Момент ключа, с которого начинается переход. */
  readonly time: number;
  readonly side: HandleSide;
  readonly x: number;
  readonly y: number;
  /** Ключ, к которому ручка привязана линией. */
  readonly anchor: Point;
}

export function keyPoints(channels: readonly CurveChannel[], mapOf: MapOf): KeyPoint[] {
  return channels.flatMap((channel) =>
    channel.track.keys.map((key) => {
      const p = mapOf(channel)(key.time, key.value[channel.channel]);
      return { ref: { track: trackKey(channel.track), time: key.time }, channel, ...p };
    }),
  );
}

const refId = (ref: KeyRef): string => `${ref.track}@${ref.time}`;

/**
 * Ручки выделенных ключей: выходящая — у перехода, который ключ начинает, входящая — у
 * перехода, который ключ заканчивает. У скачка ручек нет.
 */
export function handlePoints(
  channels: readonly CurveChannel[],
  selected: readonly KeyRef[],
  mapOf: MapOf,
): HandlePoint[] {
  const chosen = new Set(selected.map(refId));
  const out: HandlePoint[] = [];
  for (const channel of channels) {
    const map = mapOf(channel);
    const key = trackKey(channel.track);
    const keys = channel.track.keys;
    for (let i = 0; i + 1 < keys.length; i++) {
      const a = keys[i];
      const b = keys[i + 1];
      const h = segmentHandles(a, b, channel.channel);
      if (!h) continue;
      const base = { channel, time: a.time };
      if (chosen.has(refId({ track: key, time: a.time }))) {
        const anchor = map(a.time, a.value[channel.channel]);
        out.push({ ...base, side: 'out', ...map(h.out.x, h.out.y), anchor });
      }
      if (chosen.has(refId({ track: key, time: b.time }))) {
        const anchor = map(b.time, b.value[channel.channel]);
        out.push({ ...base, side: 'in', ...map(h.in.x, h.in.y), anchor });
      }
    }
  }
  return out;
}

/** Ближайшая к точке экрана в радиусе `reach` пикселей; последние в списке — сверху. */
export function nearest<T extends Point>(
  points: readonly T[],
  x: number,
  y: number,
  reach: number,
): T | null {
  let best: T | null = null;
  let distance = reach;
  for (let i = points.length - 1; i >= 0; i--) {
    const d = Math.hypot(points[i].x - x, points[i].y - y);
    if (d < distance) {
      best = points[i];
      distance = d;
    }
  }
  return best;
}

/** Ключи, чья точка хоть на одном канале попала в рамку; каждый ключ один раз. */
export function keysInBox(
  points: readonly KeyPoint[],
  box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
): KeyRef[] {
  const found = new Map<string, KeyRef>();
  for (const p of points) {
    if (p.x < box.x || p.x > box.x + box.w || p.y < box.y || p.y > box.y + box.h) continue;
    found.set(refId(p.ref), p.ref);
  }
  return [...found.values()];
}

import { EASE_IN_OUT, type Easing } from './easing';
import { MAX_SCENE_DURATION, roundTime } from './time';

/** Как значение идёт от ключа к следующему: скачком, равномерно или по кривой. */
export type Interpolation = 'step' | 'linear' | 'bezier';

export const INTERPOLATIONS: readonly Interpolation[] = ['step', 'linear', 'bezier'];

/** Ключ: значение свойства в момент времени и то, как оно пойдёт к следующему ключу. */
export interface Key {
  /** Миллисекунды от начала сцены. */
  readonly time: number;
  /** Каналы значения: одно число, пара (положение, масштаб) или RGBA оттенка. */
  readonly value: readonly number[];
  readonly interpolation: Interpolation;
  /** Кривая для `bezier`. У остальных хранится, чтобы переключение туда и обратно её не теряло. */
  readonly easing: Easing;
}

export type ObjectProperty = 'position' | 'rotation' | 'scale' | 'opacity' | 'tint';
export type LayerProperty = 'opacity';
export type EffectParam =
  'period' | 'amplitude' | 'spread' | 'wavelength' | 'density' | 'dx' | 'dy' | 'height';

/** Числовые параметры деформеров: их можно вести ключами. Зерно дрожания — нет. */
export type DeformerParam =
  | 'amplitude'
  | 'wavelength'
  | 'period'
  | 'angle'
  | 'strength'
  | 'radius'
  | 'inner'
  | 'outer'
  | 'length'
  | 'amount'
  | 'life'
  | 'speed'
  | 'spread'
  | 'gravity';

export const DEFORMER_PARAMS: readonly DeformerParam[] = [
  'amplitude',
  'wavelength',
  'period',
  'angle',
  'strength',
  'radius',
  'inner',
  'outer',
  'length',
  'amount',
  'life',
  'speed',
  'spread',
  'gravity',
];

export const OBJECT_PROPERTIES: readonly ObjectProperty[] = [
  'position',
  'rotation',
  'scale',
  'opacity',
  'tint',
];
export const EFFECT_PARAMS: readonly EffectParam[] = [
  'period',
  'amplitude',
  'spread',
  'wavelength',
  'density',
  'dx',
  'dy',
  'height',
];

/**
 * Что анимирует трек: узел документа и его свойство. Свойство — закрытый список, а не строка:
 * опечатка ловится при компиляции, а трек сериализуется без догадок.
 */
export type TrackTarget =
  | { readonly node: 'object'; readonly id: string; readonly property: ObjectProperty }
  | { readonly node: 'layer'; readonly id: string; readonly property: LayerProperty }
  | { readonly node: 'effect'; readonly id: string; readonly property: EffectParam }
  | { readonly node: 'deformer'; readonly id: string; readonly property: DeformerParam };

export type TrackNode = TrackTarget['node'];

/** Трек: цель и ключи по возрастанию времени, два ключа в один момент не встречаются. */
export type Track = TrackTarget & { readonly keys: readonly Key[] };

/** Ссылка на ключ из выделения в таймлайне. */
export interface KeyRef {
  readonly track: string;
  readonly time: number;
}

/** Больше ключей в одном треке файл не примет. */
export const MAX_KEYS_PER_TRACK = 4096;
export const MAX_TRACKS = 4096;

export type ValueKind = 'scalar' | 'vec2' | 'color';

export function valueKind(target: TrackTarget): ValueKind {
  if (target.node !== 'object') return 'scalar';
  if (target.property === 'position' || target.property === 'scale') return 'vec2';
  return target.property === 'tint' ? 'color' : 'scalar';
}

export const CHANNELS: Readonly<Record<ValueKind, number>> = { scalar: 1, vec2: 2, color: 4 };

/** Идентификатор трека для словарей и выделения. Никогда не разбирается обратно. */
export const trackKey = (target: TrackTarget): string =>
  `${target.node}:${target.id}:${target.property}`;

export const nodeKey = (node: TrackNode, id: string): string => `${node}:${id}`;

/** Цель без ключей: трек и ссылка на цель взаимозаменяемы там, где ключи не нужны. */
export function targetOf(target: TrackTarget): TrackTarget {
  return { node: target.node, id: target.id, property: target.property } as TrackTarget;
}

export function createKey(
  time: number,
  value: readonly number[],
  interpolation: Interpolation = 'linear',
  easing: Easing = EASE_IN_OUT,
): Key {
  return { time: roundTime(time), value, interpolation, easing };
}

export function findTrack(tracks: readonly Track[], target: TrackTarget): Track | undefined {
  const key = trackKey(target);
  return tracks.find((t) => trackKey(t) === key);
}

/** Треки узла по ключу `nodeKey`. Кэш по массиву треков: он неизменяемый. */
const byNodeCache = new WeakMap<readonly Track[], ReadonlyMap<string, readonly Track[]>>();

export function tracksByNode(tracks: readonly Track[]): ReadonlyMap<string, readonly Track[]> {
  let index = byNodeCache.get(tracks);
  if (!index) {
    const map = new Map<string, Track[]>();
    for (const track of tracks) {
      const key = nodeKey(track.node, track.id);
      const list = map.get(key);
      if (list) list.push(track);
      else map.set(key, [track]);
    }
    index = map;
    byNodeCache.set(tracks, index);
  }
  return index;
}

export function keyIndexAt(keys: readonly Key[], time: number): number {
  const at = roundTime(time);
  return keys.findIndex((k) => k.time === at);
}

/**
 * Ключи с новым значением в момент `time`. Ключ в тот же момент получает новое значение и
 * сохраняет свою интерполяцию; новый берёт её у соседа слева, чтобы вставка ключа посреди
 * плавного движения не делала его рывком.
 */
export function withKey(keys: readonly Key[], time: number, value: readonly number[]): Key[] {
  const at = roundTime(time);
  const index = keys.findIndex((k) => k.time >= at);
  const out = keys.slice();
  if (index !== -1 && keys[index].time === at) {
    out[index] = { ...keys[index], value };
    return out;
  }
  const neighbour = index > 0 ? keys[index - 1] : index === -1 ? keys[keys.length - 1] : keys[0];
  const key = neighbour
    ? createKey(at, value, neighbour.interpolation, neighbour.easing)
    : createKey(at, value);
  out.splice(index === -1 ? out.length : index, 0, key);
  return out;
}

/** Заменяет ключи трека; трек без ключей исчезает, трека ещё не было — появляется. */
export function replaceKeys(
  tracks: readonly Track[],
  target: TrackTarget,
  keys: readonly Key[],
): readonly Track[] {
  const key = trackKey(target);
  const index = tracks.findIndex((t) => trackKey(t) === key);
  if (index === -1) {
    return keys.length === 0 ? tracks : [...tracks, { ...targetOf(target), keys }];
  }
  if (keys.length === 0) return tracks.filter((_, i) => i !== index);
  const out = tracks.slice();
  out[index] = { ...tracks[index], keys };
  return out;
}

export function setKey(
  tracks: readonly Track[],
  target: TrackTarget,
  time: number,
  value: readonly number[],
): readonly Track[] {
  const keys = findTrack(tracks, target)?.keys ?? [];
  return replaceKeys(tracks, target, withKey(keys, time, value));
}

/** Выделенные ключи по трекам: множество моментов на трек. */
function groupRefs(refs: readonly KeyRef[]): ReadonlyMap<string, ReadonlySet<number>> {
  const out = new Map<string, Set<number>>();
  for (const ref of refs) {
    const set = out.get(ref.track);
    if (set) set.add(ref.time);
    else out.set(ref.track, new Set([ref.time]));
  }
  return out;
}

/** Убирает ключи; трек без ключей исчезает целиком. */
export function removeKeys(tracks: readonly Track[], refs: readonly KeyRef[]): readonly Track[] {
  const byTrack = groupRefs(refs);
  let out = tracks;
  for (const track of tracks) {
    const times = byTrack.get(trackKey(track));
    if (!times) continue;
    const keys = track.keys.filter((k) => !times.has(k.time));
    if (keys.length !== track.keys.length) out = replaceKeys(out, track, keys);
  }
  return out;
}

/**
 * Сдвигает выделенные ключи на `delta` миллисекунд. Сдвиг общий и ограничен так, чтобы ни один
 * ключ не ушёл за начало или за предел сцены: расстояния между выделенными сохраняются.
 * Ключ, на место которого встал сдвинутый, заменяется им, как в других редакторах.
 */
export function moveKeys(
  tracks: readonly Track[],
  refs: readonly KeyRef[],
  delta: number,
): { readonly tracks: readonly Track[]; readonly refs: readonly KeyRef[] } {
  if (refs.length === 0) return { tracks, refs };
  let first = Infinity;
  let last = -Infinity;
  for (const ref of refs) {
    first = Math.min(first, ref.time);
    last = Math.max(last, ref.time);
  }
  const shift = Math.min(MAX_SCENE_DURATION - last, Math.max(-first, delta));
  if (shift === 0) return { tracks, refs };
  const byTrack = groupRefs(refs);
  let out = tracks;
  for (const track of tracks) {
    const selected = byTrack.get(trackKey(track));
    if (!selected) continue;
    const moved = track.keys
      .filter((k) => selected.has(k.time))
      .map((k) => ({ ...k, time: roundTime(k.time + shift) }));
    const landing = new Set(moved.map((k) => k.time));
    const kept = track.keys.filter((k) => !selected.has(k.time) && !landing.has(k.time));
    out = replaceKeys(
      out,
      track,
      [...kept, ...moved].sort((a, b) => a.time - b.time),
    );
  }
  return { tracks: out, refs: refs.map((r) => ({ ...r, time: roundTime(r.time + shift) })) };
}

export function setKeysInterpolation(
  tracks: readonly Track[],
  refs: readonly KeyRef[],
  interpolation: Interpolation,
  easing?: Easing,
): readonly Track[] {
  const byTrack = groupRefs(refs);
  let out = tracks;
  for (const track of tracks) {
    const selected = byTrack.get(trackKey(track));
    if (!selected) continue;
    const keys = track.keys.map((k) =>
      selected.has(k.time) ? { ...k, interpolation, easing: easing ?? k.easing } : k,
    );
    out = replaceKeys(out, track, keys);
  }
  return out;
}

/** Что показывает кнопка ключа у свойства: не анимировано, анимировано, ключ ровно сейчас. */
export type KeyState = 'none' | 'animated' | 'key';

export function keyStateAt(tracks: readonly Track[], target: TrackTarget, time: number): KeyState {
  const track = findTrack(tracks, target);
  if (!track) return 'none';
  return keyIndexAt(track.keys, time) === -1 ? 'animated' : 'key';
}

/** Все моменты, где стоит хоть один ключ, по возрастанию. */
export function keyTimes(tracks: readonly Track[]): number[] {
  const set = new Set<number>();
  for (const track of tracks) for (const key of track.keys) set.add(key.time);
  return [...set].sort((a, b) => a - b);
}

/**
 * Копирует треки узлов под новыми идентификаторами: копия слоя или объекта двигается так же,
 * как оригинал. `ids` — старый идентификатор узла в новый.
 */
export function copyTracks(
  tracks: readonly Track[],
  node: TrackNode,
  ids: ReadonlyMap<string, string>,
): readonly Track[] {
  const copies = tracks
    .filter((t) => t.node === node && ids.has(t.id))
    .map((t) => ({ ...t, id: ids.get(t.id) as string }));
  return copies.length === 0 ? tracks : [...tracks, ...copies];
}

/** Сдвигает ключи положения перечисленных объектов: так холст меняет размер от якоря. */
export function shiftPositionKeys(
  tracks: readonly Track[],
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): readonly Track[] {
  if ((dx === 0 && dy === 0) || ids.size === 0) return tracks;
  return tracks.map((track) =>
    track.node === 'object' && track.property === 'position' && ids.has(track.id)
      ? {
          ...track,
          keys: track.keys.map((k) => ({ ...k, value: [k.value[0] + dx, k.value[1] + dy] })),
        }
      : track,
  );
}

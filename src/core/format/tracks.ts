import { z } from 'zod';
import { tintChannels, valueLimits } from '../animated';
import { toHex } from '../color';
import { EASE_IN_OUT, MAX_EASING_OVERSHOOT } from '../easing';
import { MAX_SCENE_DURATION } from '../time';
import {
  DEFORMER_PARAMS,
  type DeformerParam,
  EFFECT_PARAMS,
  type EffectParam,
  type Key,
  MAX_KEYS_PER_TRACK,
  MAX_TRACKS,
  OBJECT_PROPERTIES,
  type ObjectProperty,
  type Track,
  type TrackTarget,
  createKey,
  nodeKey,
  trackKey,
  valueKind,
} from '../tracks';
import { DocumentFormatError, hex, id } from './primitives';

const along = z.number().min(0).max(1);
const overshoot = z.number().min(-MAX_EASING_OVERSHOOT).max(MAX_EASING_OVERSHOOT);

/**
 * Ключ в файле: `t` — момент в миллисекундах, `v` — значение (число, пара чисел или цвет),
 * `i` — интерполяция, если не линейная, `e` — кривая для `bezier`.
 */
const keySchema = z.object({
  t: z.number().min(0).max(MAX_SCENE_DURATION),
  v: z.union([z.number().finite(), z.tuple([z.number().finite(), z.number().finite()]), hex]),
  i: z.enum(['step', 'linear', 'bezier']).optional(),
  e: z.tuple([along, overshoot, along, overshoot]).optional(),
});

const trackSchema = z.object({
  node: z.enum(['object', 'layer', 'effect', 'deformer']),
  id,
  property: z.string().max(32),
  keys: z.array(keySchema).min(1).max(MAX_KEYS_PER_TRACK),
});

/** Версия 6. */
export const tracksSchema = z.array(trackSchema).max(MAX_TRACKS);

type TrackFile = z.infer<typeof trackSchema>;
type KeyFile = z.infer<typeof keySchema>;

function targetFromFile(track: TrackFile): TrackTarget {
  const { node, id: target, property } = track;
  if (node === 'object' && OBJECT_PROPERTIES.includes(property as ObjectProperty)) {
    return { node, id: target, property: property as ObjectProperty };
  }
  if (node === 'layer' && property === 'opacity') return { node, id: target, property };
  if (node === 'effect' && EFFECT_PARAMS.includes(property as EffectParam)) {
    return { node, id: target, property: property as EffectParam };
  }
  if (node === 'deformer' && DEFORMER_PARAMS.includes(property as DeformerParam)) {
    return { node, id: target, property: property as DeformerParam };
  }
  throw new DocumentFormatError(`Unknown ${node} property: ${property}`);
}

/** Значение ключа по виду свойства: оттенок — цвет, положение и масштаб — пара, прочее — число. */
function valueFromFile(target: TrackTarget, v: KeyFile['v']): number[] {
  const kind = valueKind(target);
  const where = trackKey(target);
  if (kind === 'color') {
    if (typeof v !== 'string') throw new DocumentFormatError(`Track ${where} expects a color`);
    return tintChannels(v);
  }
  let numbers: number[];
  if (kind === 'vec2' && Array.isArray(v)) numbers = [...v];
  else if (kind === 'scalar' && typeof v === 'number') numbers = [v];
  else throw new DocumentFormatError(`Track ${where} has a value of the wrong shape`);
  const { min, max } = valueLimits(target);
  if (numbers.some((n) => n < min || n > max)) {
    throw new DocumentFormatError(`Track ${where} has a value out of range`);
  }
  return numbers;
}

function keysFromFile(target: TrackTarget, keys: readonly KeyFile[]): Key[] {
  let last = -Infinity;
  return keys.map((k) => {
    const key = createKey(k.t, valueFromFile(target, k.v), k.i ?? 'linear', k.e ?? EASE_IN_OUT);
    if (key.time <= last) {
      throw new DocumentFormatError(`Track ${trackKey(target)}: keys must go in increasing time`);
    }
    last = key.time;
    return key;
  });
}

/**
 * Треки из файла. `alive` — узлы, которые есть в анимации: трек без цели означал бы, что файл
 * испорчен, и молча выбрасывать его нельзя — так пропала бы чья-то анимация.
 */
export function tracksFromFile(tracks: readonly TrackFile[], alive: ReadonlySet<string>): Track[] {
  const seen = new Set<string>();
  return tracks.map((track) => {
    const target = targetFromFile(track);
    const key = trackKey(target);
    if (seen.has(key)) throw new DocumentFormatError(`Duplicate track: ${key}`);
    seen.add(key);
    if (!alive.has(nodeKey(target.node, target.id))) {
      throw new DocumentFormatError(`Track ${key} targets a missing ${target.node}`);
    }
    return { ...target, keys: keysFromFile(target, track.keys) };
  });
}

function valueToFile(target: TrackTarget, value: readonly number[]): KeyFile['v'] {
  switch (valueKind(target)) {
    case 'color':
      return toHex({ r: value[0], g: value[1], b: value[2], a: value[3] });
    case 'vec2':
      return [value[0], value[1]];
    case 'scalar':
      return value[0];
  }
}

export function tracksToFile(tracks: readonly Track[]): TrackFile[] {
  return tracks.map((track) => ({
    node: track.node,
    id: track.id,
    property: track.property,
    keys: track.keys.map((k) => ({
      t: k.time,
      v: valueToFile(track, k.value),
      ...(k.interpolation !== 'linear' ? { i: k.interpolation } : {}),
      ...(k.interpolation === 'bezier' ? { e: [...k.easing] as KeyFile['e'] } : {}),
    })),
  }));
}

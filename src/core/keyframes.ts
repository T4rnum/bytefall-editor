import {
  normalizeValue,
  readEffectValue,
  readLayerValue,
  readObjectValue,
  sameValue,
  writeEffectValue,
  writeLayerValue,
  writeObjectValue,
} from './animated';
import {
  type Animation,
  aliveNodes,
  frameDocument,
  mapFrames,
  withFrameDocument,
} from './animation';
import type { Document, Layer } from './document';
import type { LayerEffect } from './effects';
import { evaluate, readTarget } from './evaluate';
import { valueAt } from './interpolate';
import type { SceneObject } from './object';
import { frameIndexAt } from './timeline';
import { roundTime } from './time';
import {
  type KeyRef,
  type Track,
  type TrackTarget,
  findTrack,
  nodeKey,
  removeKeys,
  setKey,
  tracksByNode,
} from './tracks';

/**
 * Операции над ключами на уровне анимации: ключ из текущего значения, отказ от анимации и
 * главное — правка вычисленного кадра. Инструменты правят то, что видят на экране, а сюда
 * приходит результат, и здесь решается, что из него ключ, а что обычное значение.
 */

/** Ставит ключ в момент `time` со значением, которое цель имеет на экране в этот момент. */
export function keyCurrentValue(anim: Animation, target: TrackTarget, time: number): Animation {
  const value = readTarget(evaluate(anim, time), target);
  if (!value) return anim;
  return { ...anim, tracks: setKey(anim.tracks, target, time, normalizeValue(target, value)) };
}

/** Записывает значение цели как обычное, без ключей, во все кадры, где цель есть. */
function writeStatic(anim: Animation, target: TrackTarget, value: readonly number[]): Animation {
  return mapFrames(anim, (doc) => {
    switch (target.node) {
      case 'object': {
        const index = doc.objects.findIndex((o) => o.id === target.id);
        if (index === -1) return doc;
        const objects = doc.objects.slice();
        objects[index] = writeObjectValue(objects[index], target.property, value);
        return { ...doc, objects };
      }
      case 'layer':
        return mapLayers(doc, (l) => (l.id === target.id ? writeLayerValue(l, value) : l));
      case 'effect':
        return mapLayers(doc, (l) =>
          withEffect(l, target.id, (e) => writeEffectValue(e, target.property, value)),
        );
    }
  });
}

function mapLayers(doc: Document, fn: (layer: Layer) => Layer): Document {
  const layers = doc.layers.map(fn);
  return layers.every((l, i) => l === doc.layers[i]) ? doc : { ...doc, layers };
}

function withEffect(layer: Layer, id: string, fn: (e: LayerEffect) => LayerEffect): Layer {
  const index = layer.effects.findIndex((e) => e.id === id);
  if (index === -1) return layer;
  const effects = layer.effects.slice();
  effects[index] = fn(effects[index]);
  return { ...layer, effects };
}

/**
 * Меняет значение цели для панелей, которые правят анимацию целиком, а не сцену на экране:
 * у анимированной цели ставится ключ в момент `time`, у обычной — значение во всех кадрах.
 */
export function setTargetValue(
  anim: Animation,
  target: TrackTarget,
  time: number,
  value: readonly number[],
): Animation {
  if (!findTrack(anim.tracks, target)) return writeStatic(anim, target, value);
  return { ...anim, tracks: setKey(anim.tracks, target, time, normalizeValue(target, value)) };
}

/**
 * Перестаёт анимировать свойство. Значение, которое оно имело в момент `time`, становится
 * обычным значением во всех кадрах: объект остаётся там, где его видно, а не прыгает к тому,
 * что лежало в кадре до анимации.
 */
export function unanimate(anim: Animation, target: TrackTarget, time: number): Animation {
  const track = findTrack(anim.tracks, target);
  if (!track) return anim;
  const baked = writeStatic(anim, target, valueAt(track, time));
  return { ...baked, tracks: anim.tracks.filter((t) => t !== track) };
}

/** Удаляет ключи; свойство, у которого ключей не осталось, замирает в значении на момент `time`. */
export function deleteKeys(anim: Animation, refs: readonly KeyRef[], time: number): Animation {
  const tracks = removeKeys(anim.tracks, refs);
  if (tracks === anim.tracks) return anim;
  let out: Animation = { ...anim, tracks };
  for (const track of anim.tracks) {
    if (!findTrack(tracks, track)) out = writeStatic(out, track, valueAt(track, time));
  }
  return out;
}

/** Треки, чьей цели нет ни в одном кадре: объект удалили, слой или эффект убрали. */
export function pruneTracks(anim: Animation): Animation {
  if (anim.tracks.length === 0) return anim;
  const alive = aliveNodes(anim.frames);
  const tracks = anim.tracks.filter((t) => alive.has(nodeKey(t.node, t.id)));
  return tracks.length === anim.tracks.length ? anim : { ...anim, tracks };
}

interface EditContext {
  readonly time: number;
  readonly index: ReadonlyMap<string, readonly Track[]>;
  tracks: readonly Track[];
}

/**
 * Свойство тронутого узла: изменилось относительно экрана — ключ в текущий момент; в документ
 * возвращается то, что лежало в кадре. Анимированное значение хранят ключи, и кадр не должен
 * запоминать, где объект оказался в момент правки.
 */
function routeProperty<N>(
  ctx: EditContext,
  target: TrackTarget,
  read: (node: N) => number[] | null,
  write: (node: N, value: readonly number[]) => N,
  nodes: { readonly before: N; readonly after: N; readonly stored: N },
): N {
  const was = read(nodes.before);
  const now = read(nodes.after);
  const stored = read(nodes.stored);
  if (!was || !now || !stored) return nodes.after;
  if (!sameValue(was, now)) {
    ctx.tracks = setKey(ctx.tracks, target, ctx.time, normalizeValue(target, now));
  }
  return write(nodes.after, stored);
}

function routeObject(
  ctx: EditContext,
  obj: SceneObject,
  before: SceneObject | undefined,
  stored: SceneObject | undefined,
): SceneObject {
  if (!before || !stored) return obj;
  if (obj === before) return stored;
  let out = obj;
  for (const track of ctx.index.get(nodeKey('object', obj.id)) ?? []) {
    if (track.node !== 'object') continue;
    out = routeProperty(
      ctx,
      track,
      (o) => readObjectValue(o, track.property),
      (o, v) => writeObjectValue(o, track.property, v),
      { before, after: out, stored },
    );
  }
  return out;
}

function routeLayer(
  ctx: EditContext,
  layer: Layer,
  before: Layer | undefined,
  stored: Layer | undefined,
): Layer {
  if (!before || !stored) return layer;
  if (layer === before) return stored;
  let out = layer;
  for (const track of ctx.index.get(nodeKey('layer', layer.id)) ?? []) {
    if (track.node !== 'layer') continue;
    out = routeProperty(ctx, track, readLayerValue, writeLayerValue, {
      before,
      after: out,
      stored,
    });
  }
  if (out.effects === before.effects) return { ...out, effects: stored.effects };
  const effects = out.effects.map((effect) =>
    routeEffect(
      ctx,
      effect,
      before.effects.find((e) => e.id === effect.id),
      stored.effects.find((e) => e.id === effect.id),
    ),
  );
  return { ...out, effects };
}

function routeEffect(
  ctx: EditContext,
  effect: LayerEffect,
  before: LayerEffect | undefined,
  stored: LayerEffect | undefined,
): LayerEffect {
  if (!before || !stored) return effect;
  if (effect === before) return stored;
  let out = effect;
  for (const track of ctx.index.get(nodeKey('effect', effect.id)) ?? []) {
    if (track.node !== 'effect') continue;
    out = routeProperty(
      ctx,
      track,
      (e) => readEffectValue(e, track.property),
      (e, v) => writeEffectValue(e, track.property, v),
      { before, after: out, stored },
    );
  }
  return out;
}

const byId = <T extends { readonly id: string }>(items: readonly T[]): Map<string, T> =>
  new Map(items.map((item) => [item.id, item]));

/**
 * Записывает правку вычисленного кадра в анимацию. `evaluated` — то, что было на экране в
 * момент `time`, `edited` — он же после операции пользователя.
 *
 * Узел, которого операция не коснулась, возвращается в кадр таким, каким там лежал. У тронутого
 * анимированные свойства превращаются в ключи в текущий момент, остальное пишется как есть.
 * Так любая операция — перетаскивание, поле инспектора, смена родителя — ставит ключ сама,
 * а инструментам не нужно знать, что такое время.
 */
export function applyEdit(
  anim: Animation,
  time: number,
  evaluated: Document,
  edited: Document,
): Animation {
  if (edited === evaluated) return anim;
  const frameIndex = frameIndexAt(anim, time);
  const stored = frameDocument(anim, frameIndex);
  const ctx: EditContext = {
    time: roundTime(time),
    index: tracksByNode(anim.tracks),
    tracks: anim.tracks,
  };
  const beforeObjects = byId(evaluated.objects);
  const storedObjects = byId(stored.objects);
  const objects = edited.objects.map((obj) =>
    routeObject(ctx, obj, beforeObjects.get(obj.id), storedObjects.get(obj.id)),
  );
  const beforeLayers = byId(evaluated.layers);
  const storedLayers = byId(stored.layers);
  const layers = edited.layers.map((layer) =>
    routeLayer(ctx, layer, beforeLayers.get(layer.id), storedLayers.get(layer.id)),
  );
  const next = withFrameDocument({ ...anim, tracks: ctx.tracks }, frameIndex, {
    ...edited,
    objects,
    layers,
  });
  return pruneTracks(next);
}

import {
  readDeformerValue,
  readEffectValue,
  readLayerValue,
  readObjectValue,
  writeDeformerValue,
  writeEffectValue,
  writeLayerValue,
  writeObjectValue,
} from './animated';
import { type Animation, frameDocument } from './animation';
import { isTemporal } from './constraints';
import type { Document, Layer } from './document';
import type { LayerEffect } from './effects';
import { valueAt } from './interpolate';
import type { SceneObject } from './object';
import { temporalPose } from './pose';
import { roundTime } from './time';
import { frameIndexAt, sceneDuration } from './timeline';
import { type Track, type TrackTarget, nodeKey, tracksByNode } from './tracks';

/**
 * Сцена в момент `time`: активный кадр спрайт-трека, а поверх — значения всех треков. Одна
 * функция для экрана, миниатюр и экспорта, поэтому они не могут показать разное.
 *
 * Результат — обычный документ: инструменты, композитор и рендер работают с ним, ничего не
 * зная о времени. Дробные значения живут только в нём, в анимации лежат ключи.
 */
export function evaluate(anim: Animation, time: number): Document {
  return evaluateAt(anim, time, new Map(), 0);
}

/** Глубже связи из прошлого не заглядывают: такая цепочка уже читается как хвост. */
const MAX_POSE_DEPTH = 24;

/**
 * Сцена с позой рига. Связям из прошлого нужна сцена в другой момент — она считается так же,
 * со своей позой, и запоминается на один вызов: звенья цепочки с одной задержкой спрашивают
 * одни и те же моменты. Время заворачивается по длине сцены: в петле хвост в начале тянется
 * за тем, что было в конце, и на стыке петли не прыгает.
 */
function evaluateAt(
  anim: Animation,
  time: number,
  memo: Map<number, Document>,
  depth: number,
): Document {
  const known = memo.get(time);
  if (known) return known;
  const doc = applyTracks(frameDocument(anim, frameIndexAt(anim, time)), anim.tracks, time);
  const temporal =
    depth < MAX_POSE_DEPTH && doc.objects.some((o) => o.constraints.some((c) => isTemporal(o, c)));
  const pose = temporal
    ? temporalPose(doc, time, (t) => evaluateAt(anim, loopTime(anim, t), memo, depth + 1))
    : undefined;
  const out = pose ? { ...doc, pose } : doc;
  memo.set(time, out);
  return out;
}

/** Момент внутри петли сцены: прошлое до нуля — это конец предыдущего круга. */
function loopTime(anim: Animation, time: number): number {
  const length = sceneDuration(anim);
  return length > 0 ? roundTime(((time % length) + length) % length) : 0;
}

/** Применяет треки к документу кадра. Узлы без треков остаются теми же объектами. */
export function applyTracks(doc: Document, tracks: readonly Track[], time: number): Document {
  if (tracks.length === 0) return doc;
  const index = tracksByNode(tracks);
  const objects = patchAll(doc.objects, (obj) => patchObject(obj, index, time));
  const layers = patchAll(doc.layers, (layer) => patchLayer(layer, index, time));
  return objects === doc.objects && layers === doc.layers ? doc : { ...doc, objects, layers };
}

/** map, который возвращает тот же массив, если ни один элемент не изменился. */
function patchAll<T>(items: readonly T[], patch: (item: T) => T): readonly T[] {
  let out: T[] | null = null;
  items.forEach((item, i) => {
    const next = patch(item);
    if (next !== item) (out ??= items.slice())[i] = next;
  });
  return out ?? items;
}

function patchObject(
  obj: SceneObject,
  index: ReadonlyMap<string, readonly Track[]>,
  time: number,
): SceneObject {
  let out = obj;
  for (const track of index.get(nodeKey('object', obj.id)) ?? []) {
    if (track.node === 'object') out = writeObjectValue(out, track.property, valueAt(track, time));
  }
  const deformers = patchAll(obj.deformers, (deformer) => {
    let next = deformer;
    for (const track of index.get(nodeKey('deformer', deformer.id)) ?? []) {
      if (track.node === 'deformer') {
        next = writeDeformerValue(next, track.property, valueAt(track, time));
      }
    }
    return next;
  });
  return deformers === obj.deformers ? out : { ...out, deformers };
}

function patchLayer(
  layer: Layer,
  index: ReadonlyMap<string, readonly Track[]>,
  time: number,
): Layer {
  let out = layer;
  for (const track of index.get(nodeKey('layer', layer.id)) ?? []) {
    if (track.node === 'layer') out = writeLayerValue(out, valueAt(track, time));
  }
  const effects = patchAll(layer.effects, (effect) => {
    const own = index.get(nodeKey('effect', effect.id));
    return own ? patchEffect(effect, own, time) : effect;
  });
  return effects === layer.effects ? out : { ...out, effects };
}

/**
 * Эффект с вычисленными параметрами. Пока значения те же, возвращается тот же объект: кэш
 * эффектов узнаёт эффект по ссылке, и неподвижный параметр не заставит считать его заново.
 */
const effectMemo = new WeakMap<LayerEffect, { signature: string; out: LayerEffect }>();

function patchEffect(effect: LayerEffect, tracks: readonly Track[], time: number): LayerEffect {
  const values = tracks.map((track) => valueAt(track, time)[0]);
  const signature = tracks.map((track, i) => `${track.property}=${values[i]}`).join(',');
  const memo = effectMemo.get(effect);
  if (memo && memo.signature === signature) return memo.out;
  let out = effect;
  tracks.forEach((track, i) => {
    if (track.node === 'effect') out = writeEffectValue(out, track.property, [values[i]]);
  });
  effectMemo.set(effect, { signature, out });
  return out;
}

/** Эффект с таким идентификатором в документе, вместе с его слоем. */
export function findEffect(
  doc: Document,
  id: string,
): { readonly layer: Layer; readonly effect: LayerEffect } | undefined {
  for (const layer of doc.layers) {
    const effect = layer.effects.find((e) => e.id === id);
    if (effect) return { layer, effect };
  }
  return undefined;
}

/** Текущее значение цели в документе или null, если цели в нём нет. */
export function readTarget(doc: Document, target: TrackTarget): number[] | null {
  switch (target.node) {
    case 'object': {
      const obj = doc.objects.find((o) => o.id === target.id);
      return obj ? readObjectValue(obj, target.property) : null;
    }
    case 'layer': {
      const layer = doc.layers.find((l) => l.id === target.id);
      return layer ? readLayerValue(layer) : null;
    }
    case 'effect': {
      const found = findEffect(doc, target.id);
      return found ? readEffectValue(found.effect, target.property) : null;
    }
    case 'deformer': {
      for (const obj of doc.objects) {
        const deformer = obj.deformers.find((d) => d.id === target.id);
        if (deformer) return readDeformerValue(deformer, target.property);
      }
      return null;
    }
  }
}

import {
  readEffectValue,
  readLayerValue,
  readObjectValue,
  writeEffectValue,
  writeLayerValue,
  writeObjectValue,
} from './animated';
import { type Animation, frameDocument } from './animation';
import type { Document, Layer } from './document';
import type { LayerEffect } from './effects';
import { valueAt } from './interpolate';
import type { SceneObject } from './object';
import { frameIndexAt } from './timeline';
import { type Track, type TrackTarget, nodeKey, tracksByNode } from './tracks';

/**
 * Сцена в момент `time`: активный кадр спрайт-трека, а поверх — значения всех треков. Одна
 * функция для экрана, миниатюр и экспорта, поэтому они не могут показать разное.
 *
 * Результат — обычный документ: инструменты, композитор и рендер работают с ним, ничего не
 * зная о времени. Дробные значения живут только в нём, в анимации лежат ключи.
 */
export function evaluate(anim: Animation, time: number): Document {
  return applyTracks(frameDocument(anim, frameIndexAt(anim, time)), anim.tracks, time);
}

/** Применяет треки к документу кадра. Узлы без треков остаются теми же объектами. */
export function applyTracks(doc: Document, tracks: readonly Track[], time: number): Document {
  if (tracks.length === 0) return doc;
  const index = tracksByNode(tracks);
  const objects = patchAll(doc.objects, (obj) => {
    const own = index.get(nodeKey('object', obj.id));
    return own ? patchObject(obj, own, time) : obj;
  });
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

function patchObject(obj: SceneObject, tracks: readonly Track[], time: number): SceneObject {
  let out = obj;
  for (const track of tracks) {
    if (track.node === 'object') out = writeObjectValue(out, track.property, valueAt(track, time));
  }
  return out;
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
  }
}

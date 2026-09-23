import { frameDocument, mapFrames } from '../../core/animation';
import { type Document, type Layer, findLayer, updateLayer } from '../../core/document';
import {
  EFFECT_PARAM_SPECS,
  type EffectKind,
  type LayerEffect,
  MAX_EFFECTS_PER_LAYER,
  createEffect,
} from '../../core/effects';
import { setTargetValue } from '../../core/keyframes';
import type { EffectParam } from '../../core/tracks';
import { useDocumentStore } from './documentStore';
import { plural } from '../ui/plural';
import { notify } from './notifyStore';

/**
 * Активный слой, каким он лежит в кадре, а не каким его показывают треки: список эффектов
 * отсюда уходит во все кадры, и вычисленные значения параметров туда попасть не должны.
 */
export function activeLayer(): Layer | undefined {
  const { animation, frameIndex, activeLayerId } = useDocumentStore.getState();
  return findLayer(frameDocument(animation, frameIndex), activeLayerId);
}

function commitEffects(layerId: string, effects: readonly LayerEffect[], label: string): void {
  const { animation, commitAnimation } = useDocumentStore.getState();
  commitAnimation(
    label,
    mapFrames(animation, (d) => updateLayer(d, layerId, { effects })),
  );
}

export function addEffectAction(kind: EffectKind): void {
  const layer = activeLayer();
  if (!layer) return;
  if (layer.effects.length >= MAX_EFFECTS_PER_LAYER) {
    notify(
      `Не больше ${plural(MAX_EFFECTS_PER_LAYER, { one: 'эффекта', few: 'эффектов', many: 'эффектов' })} на слой`,
      'error',
    );
    return;
  }
  commitEffects(layer.id, [...layer.effects, createEffect(kind)], 'Add effect');
}

export function removeEffectAction(effectId: string): void {
  const layer = activeLayer();
  if (!layer) return;
  const effects = layer.effects.filter((e) => e.id !== effectId);
  if (effects.length === layer.effects.length) return;
  commitEffects(layer.id, effects, 'Remove effect');
}

/** Эффект с таким идентификатором в документе заменяется результатом `fn`. */
function mapEffect(doc: Document, id: string, fn: (e: LayerEffect) => LayerEffect): Document {
  const layer = doc.layers.find((l) => l.effects.some((e) => e.id === id));
  if (!layer) return doc;
  return updateLayer(doc, layer.id, {
    effects: layer.effects.map((e) => (e.id === id ? fn(e) : e)),
  });
}

const isParam = (effect: LayerEffect, key: string): key is EffectParam =>
  EFFECT_PARAM_SPECS[effect.kind][key as EffectParam] !== undefined;

/**
 * Меняет параметры эффекта во всех кадрах. Числовой параметр, который ведут ключи, получает
 * ключ в текущий момент; остальное — символы, палитра, флажки — меняется как есть.
 * `mergeKey` склеивает записи одного перетаскивания поля.
 */
export function updateEffectAction<E extends LayerEffect>(
  effect: E,
  patch: Partial<E>,
  mergeKey?: string,
): void {
  const { animation, time, commitAnimation } = useDocumentStore.getState();
  let next = animation;
  const plain: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (isParam(effect, key) && typeof value === 'number') {
      next = setTargetValue(next, { node: 'effect', id: effect.id, property: key }, time, [value]);
    } else {
      plain[key] = value;
    }
  }
  if (Object.keys(plain).length > 0) {
    next = mapFrames(next, (d) => mapEffect(d, effect.id, (e) => ({ ...e, ...plain })));
  }
  commitAnimation('Effect settings', next, undefined, mergeKey);
}

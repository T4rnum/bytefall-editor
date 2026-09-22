import { type Layer, findLayer } from '../../core/document';
import {
  type EffectKind,
  type LayerEffect,
  MAX_EFFECTS_PER_LAYER,
  createEffect,
} from '../../core/effects';
import { updateLayerAction } from './documentActions';
import { useDocumentStore } from './documentStore';
import { plural } from '../ui/plural';
import { notify } from './notifyStore';

export function activeLayer(): Layer | undefined {
  const { doc, activeLayerId } = useDocumentStore.getState();
  return findLayer(doc, activeLayerId);
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
  updateLayerAction(layer.id, { effects: [...layer.effects, createEffect(kind)] }, 'Add effect');
}

export function removeEffectAction(effectId: string): void {
  const layer = activeLayer();
  if (!layer) return;
  const effects = layer.effects.filter((e) => e.id !== effectId);
  if (effects.length === layer.effects.length) return;
  updateLayerAction(layer.id, { effects }, 'Remove effect');
}

/** Меняет параметры эффекта активного слоя. Патч типизирован по конкретному виду эффекта. */
export function updateEffectAction<E extends LayerEffect>(effect: E, patch: Partial<E>): void {
  const layer = activeLayer();
  if (!layer) return;
  const effects = layer.effects.map((e) => (e.id === effect.id ? { ...effect, ...patch } : e));
  updateLayerAction(layer.id, { effects }, 'Effect settings');
}

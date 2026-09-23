import { duplicateAnimationLayer, mapFrames, resizeAnimation } from '../../core/animation';
import { removeLayerKeepingChildren } from '../../core/hierarchy';
import {
  type Layer,
  MAX_LAYERS,
  type ResizeAnchor,
  addLayer,
  createLayer,
  layerIndex,
  moveLayer,
  newId,
  updateLayer,
} from '../../core/document';
import { setTargetValue } from '../../core/keyframes';
import { useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
import { plural } from '../ui/plural';
import { notify } from './notifyStore';

const state = () => useDocumentStore.getState();

const hasRoomForLayer = (count: number): boolean => {
  if (count < MAX_LAYERS) return true;
  notify(`Не больше ${plural(MAX_LAYERS, { one: 'слоя', few: 'слоёв', many: 'слоёв' })}`, 'error');
  return false;
};

/** Слои общие для всех кадров, поэтому структурные операции над ними применяются к каждому кадру. */
export function addLayerAction(): void {
  const { doc, animation, activeLayerId, commitAnimation, setActiveLayer } = state();
  if (!hasRoomForLayer(doc.layers.length)) return;
  const layer = createLayer(`Слой ${doc.layers.length + 1}`);
  const index = layerIndex(doc, activeLayerId) + 1;
  commitAnimation(
    'Add layer',
    mapFrames(animation, (d) => addLayer(d, layer, index)),
  );
  setActiveLayer(layer.id);
}

export function removeActiveLayerAction(): void {
  const { doc, animation, activeLayerId, commitAnimation, setActiveLayer } = state();
  if (doc.layers.length <= 1) return;
  const index = layerIndex(doc, activeLayerId);
  const next = mapFrames(animation, (d) => removeLayerKeepingChildren(d, activeLayerId));
  commitAnimation('Delete layer', next);
  setActiveLayer(state().doc.layers[Math.max(0, index - 1)].id);
}

export function duplicateActiveLayerAction(): void {
  const { doc, animation, activeLayerId, commitAnimation, setActiveLayer } = state();
  if (!hasRoomForLayer(doc.layers.length)) return;
  const copyId = newId('layer');
  const next = duplicateAnimationLayer(animation, activeLayerId, copyId);
  if (next === animation) return;
  commitAnimation('Duplicate layer', next);
  setActiveLayer(copyId);
}

/** delta > 0 поднимает слой выше, delta < 0 опускает. */
export function moveActiveLayerAction(delta: number): void {
  const { doc, animation, activeLayerId, commitAnimation } = state();
  const target = layerIndex(doc, activeLayerId) + delta;
  commitAnimation(
    delta > 0 ? 'Move layer up' : 'Move layer down',
    mapFrames(animation, (d) => moveLayer(d, activeLayerId, target)),
  );
}

/**
 * Меняет свойства слоя во всех кадрах. Анимированная непрозрачность получает ключ в текущий
 * момент, а не новое значение: иначе поле перезаписало бы то, что ведут ключи.
 */
/** Переносит слой на позицию `index` во всех кадрах: так слой перетаскивают мышью. */
export function moveLayerToAction(id: string, index: number): void {
  const { animation, commitAnimation } = state();
  commitAnimation(
    'Move layer',
    mapFrames(animation, (d) => moveLayer(d, id, index)),
  );
}

export function updateLayerAction(
  id: string,
  patch: Partial<Omit<Layer, 'id' | 'cells' | 'effects'>>,
  label: string,
  /** Ключ серии: непрерывное перетаскивание ползунка должно стать одной записью истории. */
  mergeKey?: string,
): void {
  const { animation, time, commitAnimation } = state();
  const { opacity, ...rest } = patch;
  let next = animation;
  if (opacity !== undefined) {
    next = setTargetValue(next, { node: 'layer', id, property: 'opacity' }, time, [opacity]);
  }
  if (Object.keys(rest).length > 0) next = mapFrames(next, (d) => updateLayer(d, id, rest));
  commitAnimation(label, next, undefined, mergeKey);
}

/** `mergeKey` склеивает правки одного жеста по палитре в одну запись истории. */
export function setBackgroundAction(background: string | null, mergeKey?: string): void {
  const { doc, commitStructural } = state();
  if (background === doc.background) return;
  commitStructural('Canvas background', { ...doc, background }, mergeKey);
}

export function renameDocumentAction(name: string): void {
  const { doc, commitStructural } = state();
  const trimmed = name.trim();
  if (!trimmed || trimmed === doc.name) return;
  commitStructural('Rename document', { ...doc, name: trimmed });
}

export function addPaletteColorAction(hex: string): void {
  const { doc, commitStructural } = state();
  if (doc.palette.includes(hex)) return;
  commitStructural('Add palette color', { ...doc, palette: [...doc.palette, hex] });
}

export function removePaletteColorAction(hex: string): void {
  const { doc, commitStructural } = state();
  if (!doc.palette.includes(hex)) return;
  commitStructural('Remove palette color', {
    ...doc,
    palette: doc.palette.filter((c) => c !== hex),
  });
}

/**
 * Размер холста общий для всей анимации, поэтому меняется во всех кадрах сразу: иначе кадры
 * разъедутся. Выделение при этом снимается — оно хранит маску прежнего холста и после смены
 * размера указывало бы не на те ячейки.
 */
export function resizeCanvasAction(width: number, height: number, anchor: ResizeAnchor): void {
  const { doc, animation, commitAnimation } = state();
  if (width === doc.width && height === doc.height) return;
  commitAnimation('Resize canvas', resizeAnimation(animation, width, height, anchor));
  useEditorStore.getState().setSelection(null);
}

import { mapFrames } from '../../core/animation';
import {
  type Layer,
  MAX_LAYERS,
  addLayer,
  createLayer,
  duplicateLayer,
  layerIndex,
  moveLayer,
  newId,
  removeLayer,
  updateLayer,
} from '../../core/document';
import { useDocumentStore } from './documentStore';
import { notify } from './notifyStore';

const state = () => useDocumentStore.getState();

const hasRoomForLayer = (count: number): boolean => {
  if (count < MAX_LAYERS) return true;
  notify(`At most ${MAX_LAYERS} layers`, 'error');
  return false;
};

/** Слои общие для всех кадров, поэтому структурные операции над ними применяются к каждому кадру. */
export function addLayerAction(): void {
  const { doc, animation, activeLayerId, commitAnimation, setActiveLayer } = state();
  if (!hasRoomForLayer(doc.layers.length)) return;
  const layer = createLayer(`Layer ${doc.layers.length + 1}`);
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
  const next = mapFrames(animation, (d) => removeLayer(d, activeLayerId));
  commitAnimation('Delete layer', next);
  setActiveLayer(state().doc.layers[Math.max(0, index - 1)].id);
}

export function duplicateActiveLayerAction(): void {
  const { doc, animation, activeLayerId, commitAnimation, setActiveLayer } = state();
  if (!hasRoomForLayer(doc.layers.length)) return;
  const copyId = newId('layer');
  const next = mapFrames(animation, (d) => duplicateLayer(d, activeLayerId, copyId));
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

export function updateLayerAction(
  id: string,
  patch: Partial<Omit<Layer, 'id' | 'cells'>>,
  label: string,
): void {
  const { animation, commitAnimation } = state();
  commitAnimation(
    label,
    mapFrames(animation, (d) => updateLayer(d, id, patch)),
  );
}

export function setBackgroundAction(background: string | null): void {
  const { doc, commitStructural } = state();
  if (background === doc.background) return;
  commitStructural('Canvas background', { ...doc, background });
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

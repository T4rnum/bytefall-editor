import { type Animation, mapFrames } from '../../core/animation';
import { addLayer, createLayer, layerIndex } from '../../core/document';
import { setTargetValue } from '../../core/keyframes';
import type { QuantizeOptions } from '../../core/quantize';
import {
  addNode3D,
  createNode3D,
  createScene3D,
  removeNode3D,
  updateNode3D,
} from '../../core/scene3d/scene';
import {
  type Camera3D,
  type Light3D,
  MAX_NODES_3D,
  type Node3D,
  type Node3DKind,
  RENDER_3D_MODES,
  type Render3D,
  type Scene3D,
} from '../../core/scene3d/types';
import type { TrackTarget } from '../../core/tracks';
import { KIND_3D_LABELS, RENDER_3D_LABELS } from '../scene3d/labels';
import { hasRoomForLayer } from './documentActions';
import { useDocumentStore } from './documentStore';
import { notify } from './notifyStore';

const state = () => useDocumentStore.getState();

/**
 * 3D-сцена слоя общая для всех кадров, как эффекты: правка идёт во все кадры, иначе сцена
 * менялась бы при смене кадра.
 */
export function withScene(
  anim: Animation,
  layerId: string,
  fn: (scene: Scene3D) => Scene3D,
): Animation {
  return mapFrames(anim, (doc) => {
    const index = layerIndex(doc, layerId);
    const layer = doc.layers[index] as (typeof doc.layers)[number] | undefined;
    if (!layer?.scene) return doc;
    const scene = fn(layer.scene);
    if (scene === layer.scene) return doc;
    const layers = doc.layers.slice();
    layers[index] = { ...layer, scene };
    return { ...doc, layers };
  });
}

function editScene(
  layerId: string,
  label: string,
  fn: (scene: Scene3D) => Scene3D,
  mergeKey?: string,
): void {
  const { animation, commitAnimation } = state();
  const next = withScene(animation, layerId, fn);
  if (next !== animation) commitAnimation(label, next, undefined, mergeKey);
}

/** Новый 3D-слой над активным: камера смотрит на тор, чтобы сразу было что крутить. */
export function addLayer3DAction(): void {
  const { doc, animation, activeLayerId, commitAnimation, setActiveLayer } = state();
  if (!hasRoomForLayer(doc.layers.length)) return;
  const count = doc.layers.filter((l) => l.scene).length + 1;
  const torus = createNode3D('torus', KIND_3D_LABELS.torus, {
    rotation: [35, 0, 15],
    scale: [2.4, 2.4, 2.4],
    color: '#29adff',
  });
  const layer = { ...createLayer(`3D ${count}`), scene: createScene3D([torus]) };
  const index = layerIndex(doc, activeLayerId) + 1;
  commitAnimation(
    'Add 3D layer',
    mapFrames(animation, (d) => addLayer(d, layer, index)),
  );
  setActiveLayer(layer.id);
}

/** Тело нового вида в сцене слоя, в начале координат. Возвращает его идентификатор. */
export function addBody3DAction(layerId: string, kind: Node3DKind): string | null {
  const scene = state().doc.layers.find((l) => l.id === layerId)?.scene;
  if (!scene) return null;
  if (scene.nodes.length >= MAX_NODES_3D) {
    notify(`В 3D-сцене не больше ${MAX_NODES_3D} тел`, 'error');
    return null;
  }
  const same = scene.nodes.filter((n) => n.kind === kind).length;
  const node = createNode3D(kind, `${KIND_3D_LABELS[kind]}${same > 0 ? ` ${same + 1}` : ''}`);
  editScene(layerId, 'Add 3D body', (s) => addNode3D(s, node));
  return node.id;
}

export function removeBody3DAction(layerId: string, bodyId: string): void {
  editScene(layerId, 'Remove 3D body', (s) => removeNode3D(s, bodyId));
}

/** То, что у тела ключами не ведётся: имя, цвет, видимость. */
export function setBody3DAction(
  layerId: string,
  bodyId: string,
  patch: Partial<Pick<Node3D, 'name' | 'color' | 'visible'>>,
  mergeKey?: string,
): void {
  editScene(
    layerId,
    'Edit 3D body',
    (s) => updateNode3D(s, bodyId, (n) => ({ ...n, ...patch })),
    mergeKey,
  );
}

export function setCamera3DAction(
  layerId: string,
  patch: Partial<Pick<Camera3D, 'projection'>>,
): void {
  editScene(layerId, 'Edit 3D camera', (s) => ({ ...s, camera: { ...s.camera, ...patch } }));
}

export function setLight3DAction(
  layerId: string,
  patch: Partial<Pick<Light3D, 'ambientColor' | 'sunColor'>>,
  mergeKey?: string,
): void {
  editScene(layerId, 'Edit 3D light', (s) => ({ ...s, light: { ...s.light, ...patch } }), mergeKey);
}

/** Режим символов, шаг облака и размер по глубине: во всех кадрах, ключами не ведутся. */
export function setRender3DAction(
  layerId: string,
  patch: Partial<Pick<Render3D, 'mode' | 'spacing' | 'sizeByDepth'>>,
  mergeKey?: string,
): void {
  editScene(
    layerId,
    'Edit 3D render',
    (s) => ({ ...s, render: { ...s.render, ...patch } }),
    mergeKey,
  );
}

/** Alt+3: следующий режим символов 3D-слоя — растр, по сетке, облако. */
export function cycleRender3DAction(): void {
  const { doc, activeLayerId } = state();
  const scene = doc.layers.find((l) => l.id === activeLayerId)?.scene;
  if (!scene) {
    notify('Режим символов есть только у 3D-слоя', 'info');
    return;
  }
  const next = RENDER_3D_MODES[(RENDER_3D_MODES.indexOf(scene.render.mode) + 1) % 3];
  setRender3DAction(activeLayerId, { mode: next });
  notify(`3D: ${RENDER_3D_LABELS[next].toLowerCase()}`, 'info');
}

export function setQuantize3DAction(
  layerId: string,
  patch: Partial<QuantizeOptions>,
  mergeKey?: string,
): void {
  editScene(
    layerId,
    'Edit 3D look',
    (s) => ({ ...s, quantize: { ...s.quantize, ...patch } }),
    mergeKey,
  );
}

/**
 * Анимируемое число сцены или тела: у свойства с ключами — ключ в текущий момент, без них — во
 * всех кадрах. `mergeKey` склеивает записи одного жеста.
 */
export function setScene3DValueAction(
  target: Extract<TrackTarget, { node: 'body3d' | 'scene3d' }>,
  value: readonly number[],
  mergeKey?: string,
): void {
  const { animation, time, commitAnimation } = state();
  const next = setTargetValue(animation, target, time, value);
  if (next !== animation) commitAnimation('Edit 3D', next, undefined, mergeKey);
}

/** Камера мышью: положение, цель и высота кадра одной записью — жест отменяется целиком. */
export function setCamera3DPoseAction(layerId: string, camera: Camera3D, mergeKey: string): void {
  const { animation, time, commitAnimation } = state();
  const at = (property: 'cameraPosition' | 'cameraTarget' | 'size') =>
    ({ node: 'scene3d', id: layerId, property }) as const;
  let next = setTargetValue(animation, at('cameraPosition'), time, camera.position);
  next = setTargetValue(next, at('cameraTarget'), time, camera.target);
  next = setTargetValue(next, at('size'), time, [camera.size]);
  if (next !== animation) commitAnimation('Orbit 3D camera', next, undefined, mergeKey);
}

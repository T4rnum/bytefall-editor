import { type Animation, mapFrames } from '../../core/animation';
import { newId } from '../../core/document';
import { emptyGraph } from '../../core/graph/build';
import {
  type InRef,
  type OutRef,
  addNode,
  connect,
  createNode,
  disconnect,
  insertFragment,
  moveNode,
  removeNode,
  setNodeMuted,
  setNodeOption,
} from '../../core/graph/edit';
import { MAX_GRAPH_NODES } from '../../core/format/graph';
import { type PresetKind, presetFragment } from '../../core/graph/presetMenu';
import type { NodeGraph, OptionValue } from '../../core/graph/types';
import { setTargetValue } from '../../core/keyframes';
import { findObject, updateObject } from '../../core/object';
import { bindSkin } from '../../core/skinBind';
import type { TrackTarget } from '../../core/tracks';
import { useDocumentStore } from './documentStore';
import { notify } from './notifyStore';

/**
 * Граф узлов — модификатор объекта, а не рисунок кадра: правка идёт во все кадры, где объект есть,
 * иначе волна пропадала бы при смене кадра. Объект без графа получает пустой граф.
 */
function withGraph(
  anim: Animation,
  objectId: string,
  fn: (graph: NodeGraph) => NodeGraph,
): Animation {
  return mapFrames(anim, (doc) => {
    const obj = findObject(doc, objectId);
    if (!obj) return doc;
    const graph = fn(obj.graph ?? emptyGraph());
    return graph === obj.graph ? doc : updateObject(doc, objectId, { graph });
  });
}

function editGraph(
  objectId: string,
  label: string,
  fn: (graph: NodeGraph) => NodeGraph,
  mergeKey?: string,
): void {
  const { animation, commitAnimation } = useDocumentStore.getState();
  const next = withGraph(animation, objectId, fn);
  if (next !== animation) commitAnimation(label, next, undefined, mergeKey);
}

/** Сколько узлов граф ещё примет: больше формат не сохранит. */
function hasRoom(graph: NodeGraph | null, adding: number): boolean {
  if ((graph?.nodes.length ?? 2) + adding <= MAX_GRAPH_NODES) return true;
  notify(`В графе объекта не больше ${MAX_GRAPH_NODES} узлов`, 'error');
  return false;
}

/**
 * Сборка из меню «Добавить» каждому объекту из `objectIds`, у каждого — со своими узлами, одной
 * записью истории. Так огонь или свечение раздаётся всем выбранным разом. Кости привязываются к
 * позе покоя сейчас; объект без костей их не получает.
 */
export function addPresetAction(objectIds: readonly string[], kind: PresetKind): void {
  const { doc, animation, commitAnimation } = useDocumentStore.getState();
  let next = animation;
  let skipped = 0;
  for (const id of objectIds) {
    const obj = findObject(doc, id);
    const bones = kind === 'bones' ? bindSkin(doc, id) : [];
    if (!obj || (kind === 'bones' && bones.length === 0)) {
      skipped += 1;
      continue;
    }
    const fragment = presetFragment(kind, newId('node'), bones);
    if (!hasRoom(obj.graph, fragment.nodes.length)) return;
    next = withGraph(next, id, (g) => insertFragment(g, fragment));
  }
  if (kind === 'bones' && skipped > 0) {
    notify('У объекта нет костей: выбери его и нарисуй их инструментом «Кость» (J)', 'error');
  }
  if (next !== animation) commitAnimation('Add nodes', next);
}

export function addNodeAction(objectId: string, kind: string, x: number, y: number): string {
  const node = createNode(kind, x, y);
  const obj = findObject(useDocumentStore.getState().doc, objectId);
  if (!hasRoom(obj?.graph ?? null, 1)) return '';
  editGraph(objectId, 'Add node', (g) => addNode(g, node));
  return node.id;
}

export function removeNodeAction(objectId: string, nodeId: string): void {
  editGraph(objectId, 'Remove node', (g) => removeNode(g, nodeId));
}

export function connectAction(objectId: string, from: OutRef, to: InRef): void {
  editGraph(objectId, 'Connect', (g) => connect(g, from, to));
}

export function disconnectAction(objectId: string, to: InRef): void {
  editGraph(objectId, 'Disconnect', (g) => disconnect(g, to));
}

export function moveNodeAction(objectId: string, nodeId: string, x: number, y: number): void {
  editGraph(objectId, 'Move node', (g) => moveNode(g, nodeId, x, y));
}

export function setNodeMutedAction(objectId: string, nodeId: string, muted: boolean): void {
  editGraph(objectId, muted ? 'Mute node' : 'Unmute node', (g) => setNodeMuted(g, nodeId, muted));
}

/**
 * Число на входе узла. Вход, который ведут ключи, получает ключ в текущий момент; иначе число
 * меняется во всех кадрах объекта. Граф берётся из кадров, а не из вычисленной сцены: иначе
 * значения ключей на этот момент осели бы в кадре. `mergeKey` склеивает записи одного жеста.
 */
export function setNodeInputAction(
  nodeId: string,
  input: string,
  value: number,
  mergeKey?: string,
): void {
  const { animation, time, commitAnimation } = useDocumentStore.getState();
  const target: TrackTarget = { node: 'node', id: nodeId, property: input };
  const next = setTargetValue(animation, target, time, [value]);
  if (next !== animation) commitAnimation('Node input', next, undefined, mergeKey);
}

export function setNodeOptionAction(
  objectId: string,
  nodeId: string,
  name: string,
  value: OptionValue,
  mergeKey?: string,
): void {
  editGraph(objectId, 'Node option', (g) => setNodeOption(g, nodeId, name, value), mergeKey);
}

/**
 * Поза покоя — сейчас: узел костей заново привязывается к костям объекта такими, какие они на
 * экране. Новые кости попадают в привязку, пропавшие уходят из неё.
 */
export function rebindBonesAction(objectId: string, nodeId: string): void {
  const bones = bindSkin(useDocumentStore.getState().doc, objectId);
  editGraph(objectId, 'Bind skin', (g) => setNodeOption(g, nodeId, 'bones', bones));
}

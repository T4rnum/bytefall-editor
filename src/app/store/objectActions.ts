import { canEditLayer, findLayer, layerIndex } from '../../core/document';
import { groupSelection, ungroupObject } from '../../core/grouping';
import {
  MAX_OBJECTS,
  type PropValue,
  type SceneObject,
  duplicateObject,
  findObject,
  moveObjectToLayer,
  objectIndex,
  pasteObject,
  removeObject,
  removeObjectProp,
  setObjectProp,
  shiftObjectOrder,
  updateObject,
} from '../../core/object';
import { editableActiveLayer, useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
import { plural } from '../ui/plural';
import { notify } from './notifyStore';

const docState = () => useDocumentStore.getState();
const editor = () => useEditorStore.getState();

export function selectedObject(): SceneObject | undefined {
  const id = editor().selectedObjectId;
  return id ? findObject(docState().doc, id) : undefined;
}

/** Выбранный объект, если его и его слой можно менять; иначе сообщение и undefined. */
export function editableSelectedObject(): SceneObject | undefined {
  const obj = selectedObject();
  if (!obj) return undefined;
  if (obj.locked || !canEditLayer(findLayer(docState().doc, obj.layerId))) {
    notify('Объект или его слой заперт', 'error');
    return undefined;
  }
  return obj;
}

function hasRoomForObject(): boolean {
  if (docState().doc.objects.length < MAX_OBJECTS) return true;
  notify(
    `Не больше ${plural(MAX_OBJECTS, { one: 'объекта', few: 'объектов', many: 'объектов' })}`,
    'error',
  );
  return false;
}

/** Вырезает текущее выделение активного слоя в новый объект и переключается на инструмент объектов. */
export function groupSelectionAction(): void {
  const { selection, setSelection, setSelectedObject, setTool } = editor();
  const state = docState();
  const layer = editableActiveLayer(state);
  if (!selection || !layer) {
    notify('Сначала выделите ячейки на редактируемом слое', 'error');
    return;
  }
  if (!hasRoomForObject()) return;
  const result = groupSelection(state.doc, layer.id, selection);
  if (!result) {
    notify('В выделении нет ячеек', 'error');
    return;
  }
  state.commitStructural('Group into object', result.doc);
  setSelection(null);
  setTool('object');
  setSelectedObject(result.object.id);
}

export function ungroupSelectedObjectAction(): void {
  const obj = editableSelectedObject();
  if (!obj) return;
  docState().commitStructural('Ungroup object', ungroupObject(docState().doc, obj.id));
  editor().setSelectedObject(null);
}

export function deleteSelectedObjectAction(): void {
  const obj = editableSelectedObject();
  if (!obj) return;
  docState().commitStructural('Delete object', removeObject(docState().doc, obj.id));
  editor().setSelectedObject(null);
}

export function duplicateSelectedObjectAction(): void {
  const obj = selectedObject();
  if (!obj || !hasRoomForObject()) return;
  const { doc, commitStructural } = docState();
  const next = duplicateObject(doc, obj.id);
  commitStructural('Duplicate object', next);
  editor().setSelectedObject(next.objects[objectIndex(doc, obj.id) + 1].id);
}

/** Кладёт выбранный объект в буфер обмена целиком. Запертый объект копировать можно. */
export function copySelectedObjectAction(): boolean {
  const obj = selectedObject();
  if (!obj) return false;
  editor().setClipboard({ kind: 'object', object: obj });
  return true;
}

export function cutSelectedObjectAction(): void {
  const obj = editableSelectedObject();
  if (!obj) return;
  editor().setClipboard({ kind: 'object', object: obj });
  docState().commitStructural('Cut object', removeObject(docState().doc, obj.id));
  editor().setSelectedObject(null);
}

/**
 * Вставляет объект на активный слой текущего кадра, на то же место, откуда его скопировали.
 * Так объект переносят и между кадрами, и между слоями: выбрал кадр и слой — вставил.
 */
export function pasteObjectAction(source: SceneObject): void {
  const state = docState();
  const layer = editableActiveLayer(state);
  if (!layer) {
    notify('Активный слой скрыт или заперт', 'error');
    return;
  }
  if (!hasRoomForObject()) return;
  const { doc, object } = pasteObject(state.doc, source, layer.id);
  state.commitStructural('Paste object', doc);
  editor().setTool('object');
  editor().setSelectedObject(object.id);
}

/** Переносит выбранный объект на слой `layerId`. Запертый или скрытый слой объект не примет. */
export function moveSelectedObjectToLayerAction(layerId: string): void {
  const obj = editableSelectedObject();
  if (!obj || obj.layerId === layerId) return;
  const state = docState();
  const target = findLayer(state.doc, layerId);
  if (!target) return;
  // Имя берётся до проверки: охранник типа в отрицании сузил бы слой до never.
  const { name } = target;
  if (!canEditLayer(target)) {
    notify(`Слой «${name}» скрыт или заперт`, 'error');
    return;
  }
  state.commitStructural('Move object to layer', moveObjectToLayer(state.doc, obj.id, layerId));
}

/** delta > 0 — на слой выше, delta < 0 — ниже. На крайнем слое ничего не происходит. */
export function stepSelectedObjectLayerAction(delta: number): void {
  const obj = selectedObject();
  if (!obj) return;
  const { doc } = docState();
  const target = doc.layers[layerIndex(doc, obj.layerId) + Math.sign(delta)];
  if (target) moveSelectedObjectToLayerAction(target.id);
}

/** delta > 0 поднимает объект выше внутри слоя, delta < 0 опускает. */
export function moveSelectedObjectOrderAction(delta: number): void {
  const obj = selectedObject();
  if (!obj) return;
  const { doc, commitStructural } = docState();
  commitStructural(delta > 0 ? 'Object up' : 'Object down', shiftObjectOrder(doc, obj.id, delta));
}

export function updateObjectAction(
  id: string,
  patch: Partial<Omit<SceneObject, 'id'>>,
  label: string,
): void {
  const { doc, commitStructural } = docState();
  commitStructural(label, updateObject(doc, id, patch));
}

export function setObjectPropAction(id: string, key: string, value: PropValue): void {
  const trimmed = key.trim();
  if (!trimmed) return;
  const { doc, commitStructural } = docState();
  commitStructural('Set property', setObjectProp(doc, id, trimmed, value));
}

export function removeObjectPropAction(id: string, key: string): void {
  const { doc, commitStructural } = docState();
  commitStructural('Remove property', removeObjectProp(doc, id, key));
}

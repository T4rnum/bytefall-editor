import { canEditLayer, findLayer } from '../../core/document';
import {
  MAX_OBJECTS,
  type PropValue,
  type SceneObject,
  duplicateObject,
  findObject,
  groupSelection,
  objectIndex,
  removeObject,
  removeObjectProp,
  setObjectProp,
  shiftObjectOrder,
  ungroupObject,
  updateObject,
} from '../../core/object';
import { editableActiveLayer, useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
import { notify } from './notifyStore';

const docState = () => useDocumentStore.getState();
const editor = () => useEditorStore.getState();

export function selectedObject(): SceneObject | undefined {
  const id = editor().selectedObjectId;
  return id ? findObject(docState().doc, id) : undefined;
}

/** Выбранный объект, если его и его слой можно менять; иначе сообщение и undefined. */
function editableSelectedObject(): SceneObject | undefined {
  const obj = selectedObject();
  if (!obj) return undefined;
  if (obj.locked || !canEditLayer(findLayer(docState().doc, obj.layerId))) {
    notify('Object or its layer is locked', 'error');
    return undefined;
  }
  return obj;
}

function hasRoomForObject(): boolean {
  if (docState().doc.objects.length < MAX_OBJECTS) return true;
  notify(`At most ${MAX_OBJECTS} objects`, 'error');
  return false;
}

/** Вырезает текущее выделение активного слоя в новый объект и переключается на инструмент объектов. */
export function groupSelectionAction(): void {
  const { selection, setSelection, setSelectedObject, setTool } = editor();
  const state = docState();
  const layer = editableActiveLayer(state);
  if (!selection || !layer) {
    notify('Select cells on an editable layer first', 'error');
    return;
  }
  if (!hasRoomForObject()) return;
  const result = groupSelection(state.doc, layer.id, selection);
  if (!result) {
    notify('Selection has no cells', 'error');
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

/** Текст из поля ввода в значение свойства: числа и булевы распознаются, остальное строка. */
export function parsePropValue(text: string): PropValue {
  const trimmed = text.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed !== '' && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return text;
}

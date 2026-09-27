import { groupSelection } from '../../core/grouping';
import { detachedCopy, removeObject } from '../../core/hierarchy';
import { objectMatrix } from '../../core/placement';
import { pivotInDocument } from '../../core/transformGesture';
import {
  MAX_OBJECTS,
  type PropValue,
  type SceneObject,
  addObject,
  canEditObject,
  createObject,
  findObject,
  pasteObject,
  removeObjectProp,
  setObjectProp,
  updateObject,
} from '../../core/object';
import { editableActiveLayer, useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
import { plural } from '../ui/plural';
import { notify } from './notifyStore';
import { revealPanelAction } from './workspaceActions';

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
  if (!canEditObject(docState().doc, obj)) {
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

/**
 * Кладёт выбранный объект в буфер обмена целиком. Запертый объект копировать можно. В буфер
 * объект уходит без родителя, но туда же, где он на экране: в кадре, куда его вставят, родителя
 * может не оказаться.
 */
export function copySelectedObjectAction(): boolean {
  const obj = selectedObject();
  if (!obj) return false;
  editor().setClipboard({ kind: 'object', object: detachedCopy(docState().doc, obj) });
  return true;
}

export function cutSelectedObjectAction(): void {
  const obj = editableSelectedObject();
  if (!obj) return;
  editor().setClipboard({ kind: 'object', object: detachedCopy(docState().doc, obj) });
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

/** Поле выбора родителя в инспекторе: на него ведёт Ctrl+P. */
export const OBJECT_PARENT_SELECT_ID = 'object-parent';

/** Ctrl+P, как в Blender: к выбору родителя выбранного объекта. */
export function focusParentSelectAction(): void {
  if (!selectedObject()) {
    notify('Сначала выберите объект');
    return;
  }
  revealPanelAction('objects');
  // Поле появляется после отрисовки развёрнутой панели, поэтому фокус — на следующем шаге.
  setTimeout(() => document.getElementById(OBJECT_PARENT_SELECT_ID)?.focus(), 0);
}

/**
 * Пустой объект, как Empty в Blender: без символов, только трансформ. К нему привязывают детей
 * и крутят их вместе — так собирается группа. Встаёт на опору выбранного объекта, а без выбора —
 * в центр холста, на активный слой.
 */
export function addEmptyObjectAction(): void {
  const state = docState();
  const layer = editableActiveLayer(state);
  if (!layer) {
    notify('Активный слой скрыт или заперт', 'error');
    return;
  }
  if (!hasRoomForObject()) return;
  const { doc } = state;
  const selected = selectedObject();
  const at = selected
    ? pivotInDocument(selected.transform, objectMatrix(doc, selected))
    : { x: doc.width / 2, y: doc.height / 2 };
  const name = `Пустой ${doc.objects.length + 1}`;
  const empty = createObject({ name, layerId: layer.id, x: Math.floor(at.x), y: Math.floor(at.y) });
  state.commitStructural('Add empty object', addObject(doc, empty));
  editor().setTool('object');
  editor().setSelectedObject(empty.id);
}

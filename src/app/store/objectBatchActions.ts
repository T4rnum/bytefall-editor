import { canEditLayer, findLayer, layerIndex } from '../../core/document';
import { applyEdit } from '../../core/keyframes';
import { ungroupObject } from '../../core/grouping';
import { canSetParent, removeObject, setParent } from '../../core/hierarchy';
import {
  type SceneObject,
  canEditObject,
  duplicateObject,
  findObject,
  moveObjectToLayer,
  objectIndex,
  shiftObjectOrder,
} from '../../core/object';
import { existingSelection } from '../../core/objectSelection';
import { copyTracks, shiftPositionKeys } from '../../core/tracks';
import { plural } from '../ui/plural';
import { useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
import { notify } from './notifyStore';

/**
 * Операции над всеми выбранными объектами: одна запись истории на всю группу. Запертые объекты
 * пропускаются, а если заперты все — об этом сообщение.
 */

const docState = () => useDocumentStore.getState();
const editor = () => useEditorStore.getState();

const OBJECTS = { one: 'объект', few: 'объекта', many: 'объектов' } as const;

/** Идентификаторы выбранных объектов, которые есть в документе; главный — последний. */
export function selectedIds(): string[] {
  const { selectedObjectIds, selectedObjectId } = editor();
  const ids = selectedObjectIds.length > 0 ? selectedObjectIds : [selectedObjectId];
  return existingSelection(
    docState().doc,
    ids.filter((id): id is string => id !== null),
  );
}

export function selectedObjects(): SceneObject[] {
  const { doc } = docState();
  return selectedIds().map((id) => findObject(doc, id) as SceneObject);
}

/** Выбранные объекты, которые можно менять. Пусто, а выбор был, — сообщение. */
export function editableSelectedObjects(): SceneObject[] {
  const all = selectedObjects();
  const editable = all.filter((o) => canEditObject(docState().doc, o));
  if (all.length > 0 && editable.length === 0) {
    notify(all.length > 1 ? 'Объекты или их слои заперты' : 'Объект или его слой заперт', 'error');
  }
  return editable;
}

/** Подпись записи истории: одна на объект и одна на группу. */
const label = (count: number, one: string, many: string): string => (count > 1 ? many : one);

export function deleteSelectedObjectsAction(): void {
  const objects = editableSelectedObjects();
  if (objects.length === 0) return;
  let doc = docState().doc;
  for (const obj of objects) doc = removeObject(doc, obj.id);
  docState().commitStructural(label(objects.length, 'Delete object', 'Delete objects'), doc);
  editor().setSelectedObject(null);
}

export function ungroupSelectedObjectsAction(): void {
  const objects = editableSelectedObjects();
  if (objects.length === 0) return;
  let doc = docState().doc;
  for (const obj of objects) doc = ungroupObject(doc, obj.id);
  docState().commitStructural(label(objects.length, 'Ungroup object', 'Ungroup objects'), doc);
  editor().setSelectedObject(null);
}

/**
 * Копии выбранных объектов на клетку правее и ниже. Анимация копируется вместе с ними и сдвинута
 * так же: копия двигается рядом с оригиналом, а не сливается с ним на ключах. Выбранными
 * становятся копии.
 */
export function duplicateSelectedObjectsAction(): void {
  const objects = selectedObjects();
  if (objects.length === 0) return;
  const { doc, animation, time, commitAnimation } = docState();
  let next = doc;
  const objectIds = new Map<string, string>();
  const deformerIds = new Map<string, string>();
  for (const obj of objects) {
    const before = next;
    next = duplicateObject(before, obj.id);
    const copy = next.objects[objectIndex(before, obj.id) + 1];
    objectIds.set(obj.id, copy.id);
    // Деформеры копии идут в том же порядке, что у оригинала, но под новыми идентификаторами.
    obj.deformers.forEach((d, i) => deformerIds.set(d.id, copy.deformers[i].id));
  }
  const edited = applyEdit(animation, time, doc, next);
  let tracks = copyTracks(edited.tracks, 'object', objectIds);
  tracks = copyTracks(tracks, 'deformer', deformerIds);
  tracks = shiftPositionKeys(tracks, new Set(objectIds.values()), 1, 1);
  commitAnimation(label(objects.length, 'Duplicate object', 'Duplicate objects'), {
    ...edited,
    tracks,
  });
  editor().setSelectedObjects([...objectIds.values()]);
}

/** Переносит выбранные объекты на слой `layerId`. Запертый или скрытый слой их не примет. */
export function moveSelectedObjectsToLayerAction(layerId: string): void {
  const target = findLayer(docState().doc, layerId);
  if (!target) return;
  // Имя берётся до проверки: охранник типа в отрицании сузил бы слой до never.
  const { name } = target;
  if (!canEditLayer(target)) {
    notify(`Слой «${name}» скрыт или заперт`, 'error');
    return;
  }
  const objects = editableSelectedObjects().filter((o) => o.layerId !== layerId);
  if (objects.length === 0) return;
  let doc = docState().doc;
  for (const obj of objects) doc = moveObjectToLayer(doc, obj.id, layerId);
  docState().commitStructural(
    label(objects.length, 'Move object to layer', 'Move objects to layer'),
    doc,
  );
}

/**
 * delta > 0 — каждый выбранный объект на слой выше своего, delta < 0 — ниже. Объект на крайнем
 * слое и объект, чей соседний слой заперт, остаются.
 */
export function stepSelectedObjectsLayerAction(delta: number): void {
  const objects = editableSelectedObjects();
  let doc = docState().doc;
  let moved = 0;
  for (const obj of objects) {
    const target = doc.layers[layerIndex(doc, obj.layerId) + Math.sign(delta)];
    if (!target || !canEditLayer(target)) continue;
    doc = moveObjectToLayer(doc, obj.id, target.id);
    moved += 1;
  }
  if (moved === 0) return;
  docState().commitStructural(label(moved, 'Move object to layer', 'Move objects to layer'), doc);
}

/**
 * delta > 0 поднимает выбранные объекты внутри их слоёв, delta < 0 опускает. Идём от того, что
 * ближе к цели: верхний объект группы уходит вверх первым и не упирается в соседа по группе.
 */
export function moveSelectedObjectsOrderAction(delta: number): void {
  const { doc: start, commitStructural } = docState();
  const byOrder = selectedObjects().sort(
    (a, b) => (objectIndex(start, b.id) - objectIndex(start, a.id)) * Math.sign(delta),
  );
  let doc = start;
  for (const obj of byOrder) doc = shiftObjectOrder(doc, obj.id, delta);
  if (doc === start) return;
  commitStructural(delta > 0 ? 'Object up' : 'Object down', doc);
}

/**
 * Назначает выбранным объектам родителя, как Ctrl+P в Blender. Объекты остаются на месте, а
 * дальше едут и крутятся вместе с родителем. null отвязывает, и объекты тоже не сдвигаются.
 * Сам родитель и его предки в детей не превращаются.
 */
export function setSelectedParentAction(parentId: string | null): void {
  const objects = editableSelectedObjects().filter(
    (o) => o.id !== parentId && o.parentId !== parentId,
  );
  if (objects.length === 0) return;
  let doc = docState().doc;
  let skipped = 0;
  for (const obj of objects) {
    if (parentId !== null && !canSetParent(doc, obj.id, parentId)) {
      skipped += 1;
      continue;
    }
    doc = setParent(doc, obj.id, parentId);
  }
  if (skipped > 0) {
    const who =
      skipped === objects.length ? 'Объект' : `Пропущено: ${plural(skipped, OBJECTS)}. Объект`;
    notify(`${who} не может стать ребёнком самого себя или своего потомка`, 'error');
  }
  if (doc === docState().doc) return;
  docState().commitStructural(parentId === null ? 'Clear parent' : 'Set parent', doc);
}

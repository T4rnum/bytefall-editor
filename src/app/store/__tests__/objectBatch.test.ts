import { beforeEach, describe, expect, it } from 'vitest';
import { createAnimation } from '../../../core/animation';
import { makeCell } from '../../../core/cell';
import { addLayer, createDocument, createLayer } from '../../../core/document';
import { applyEdits, emptyGrid, keyOf } from '../../../core/grid';
import { addObject, createObject, findObject } from '../../../core/object';
import { addConstraintAction } from '../constraintActions';
import { useDocumentStore } from '../documentStore';
import { useEditorStore } from '../editorStore';
import { addPresetAction } from '../graphActions';
import {
  deleteSelectedObjectsAction,
  duplicateSelectedObjectsAction,
  moveSelectedObjectsToLayerAction,
  setSelectedParentAction,
} from '../objectBatchActions';
import { rotateSelectedAction } from '../transformActions';

const state = () => useDocumentStore.getState();
const doc = () => state().doc;
const editor = () => useEditorStore.getState();
const parents = () => Object.fromEntries(doc().objects.map((o) => [o.id, o.parentId]));

/** Слои «низ» и «верх», на нижнем объекты a, b, c по символу. */
function setup() {
  const base = createDocument({ width: 16, height: 8 });
  const top = createLayer('Верх');
  const layerId = base.layers[0].id;
  const cells = applyEdits(emptyGrid(), new Map([[keyOf(0, 0), makeCell('#')]]));
  let next = addLayer(base, top);
  for (const [id, x] of [
    ['a', 1],
    ['b', 4],
    ['c', 7],
  ] as const) {
    next = addObject(next, createObject({ name: id, id, layerId, x, y: 1, cells }));
  }
  state().replaceAnimation(createAnimation(next));
  editor().setSelectedObjects(['a', 'b']);
  return { topId: top.id };
}

describe('операции над всеми выбранными объектами', () => {
  beforeEach(setup);

  it('удаление уносит всех выбранных одной записью истории', () => {
    deleteSelectedObjectsAction();
    expect(doc().objects.map((o) => o.id)).toEqual(['c']);
    expect(editor().selectedObjectIds).toEqual([]);
    state().undo();
    expect(doc().objects.map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('дубли выбранных становятся выбором, оригиналы на месте', () => {
    duplicateSelectedObjectsAction();
    expect(doc().objects).toHaveLength(5);
    const copies = editor().selectedObjectIds;
    expect(copies).toHaveLength(2);
    expect(copies.map((id) => findObject(doc(), id)?.transform.x)).toEqual([2, 5]);
  });

  it('перенос на слой и родитель — всем выбранным', () => {
    const { topId } = setup();
    moveSelectedObjectsToLayerAction(topId);
    expect(
      doc()
        .objects.filter((o) => o.layerId === topId)
        .map((o) => o.id),
    ).toEqual(['a', 'b']);
    setSelectedParentAction('c');
    expect(parents()).toEqual({ a: 'c', b: 'c', c: null });
  });

  it('родитель не становится ребёнком самого себя, остальные привязываются', () => {
    editor().setSelectedObjects(['a', 'b', 'c']);
    setSelectedParentAction('c');
    expect(parents()).toEqual({ a: 'c', b: 'c', c: null });
  });

  it('связь и сборка узлов достаются каждому из списка, у каждого свои', () => {
    addConstraintAction(['a', 'b'], 'follow');
    addPresetAction(['a', 'b'], 'wave');
    const [a, b, c] = doc().objects;
    expect(a.constraints).toHaveLength(1);
    expect(b.constraints).toHaveLength(1);
    expect(a.constraints[0].id).not.toBe(b.constraints[0].id);
    const ids = (o: typeof a) => o.graph!.nodes.map((n) => n.id);
    expect(ids(a)).toHaveLength(5);
    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual(['in', 'out']);
    expect(c.constraints).toHaveLength(0);
    expect(c.graph).toBeNull();
    // Каждая команда — одна запись: отмена снимает узлы у обоих разом.
    state().undo();
    expect(doc().objects.every((o) => o.graph === null || o.graph.nodes.length === 2)).toBe(true);
  });

  it('поворот клавишей доворачивает каждый выбранный объект от его угла', () => {
    rotateSelectedAction(15);
    rotateSelectedAction(15);
    expect(doc().objects.map((o) => o.transform.rot)).toEqual([30, 30, 0]);
  });
});

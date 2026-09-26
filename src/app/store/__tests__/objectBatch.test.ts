import { beforeEach, describe, expect, it } from 'vitest';
import { createAnimation } from '../../../core/animation';
import { makeCell } from '../../../core/cell';
import { addLayer, createDocument, createLayer } from '../../../core/document';
import { applyEdits, emptyGrid, keyOf } from '../../../core/grid';
import { addObject, createObject, findObject } from '../../../core/object';
import { addConstraintAction } from '../constraintActions';
import { addDeformerAction } from '../deformerActions';
import { useDocumentStore } from '../documentStore';
import { useEditorStore } from '../editorStore';
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

  it('связь и деформер достаются каждому из списка, у каждого свои', () => {
    addConstraintAction(['a', 'b'], 'follow');
    addDeformerAction(['a', 'b'], 'wave');
    const [a, b, c] = doc().objects;
    expect(a.constraints).toHaveLength(1);
    expect(b.constraints).toHaveLength(1);
    expect(a.constraints[0].id).not.toBe(b.constraints[0].id);
    expect(a.deformers[0].id).not.toBe(b.deformers[0].id);
    expect(c.constraints).toHaveLength(0);
    // Каждая команда — одна запись: отмена снимает деформеры у обоих разом.
    state().undo();
    expect(doc().objects.every((o) => o.deformers.length === 0)).toBe(true);
  });

  it('поворот клавишей доворачивает каждый выбранный объект от его угла', () => {
    rotateSelectedAction(15);
    rotateSelectedAction(15);
    expect(doc().objects.map((o) => o.transform.rot)).toEqual([30, 30, 0]);
  });
});

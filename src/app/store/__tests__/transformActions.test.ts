import { beforeEach, describe, expect, it } from 'vitest';
import { createAnimation } from '../../../core/animation';
import { makeCell } from '../../../core/cell';
import { createDocument } from '../../../core/document';
import { type CellKey, applyEdits, emptyGrid, keyOf } from '../../../core/grid';
import { addObject, createObject, findObject } from '../../../core/object';
import { selectionFromRect } from '../../../core/selection';
import { useDocumentStore } from '../documentStore';
import { useEditorStore } from '../editorStore';
import {
  resetSelectedRotationAction,
  resetSelectedScaleAction,
  rotateSelectedAction,
} from '../transformActions';

const object = () => useDocumentStore.getState().doc.objects[0];

/** Выбранный объект «ABCD» в (2, 2) на холсте 12×6. */
function setup(locked = false) {
  const edits = new Map<CellKey, ReturnType<typeof makeCell>>();
  [...'ABCD'].forEach((ch, x) => edits.set(keyOf(x, 0), makeCell(ch)));
  const base = createDocument({ width: 12, height: 6 });
  const obj = {
    ...createObject({
      name: 'o',
      layerId: base.layers[0].id,
      x: 2,
      y: 2,
      cells: applyEdits(emptyGrid(), edits),
    }),
    locked,
  };
  useDocumentStore.getState().replaceAnimation(createAnimation(addObject(base, obj)));
  useEditorStore.setState({ tool: 'object', selectedObjectId: obj.id, selection: null });
  return obj.id;
}

describe('поворот клавишами', () => {
  beforeEach(() => setup());

  it('без выделения крутится объект целиком', () => {
    rotateSelectedAction(15);
    rotateSelectedAction(90);
    expect(object().transform.rot).toBe(105);
    expect(object().overrides.size).toBe(0);
    resetSelectedRotationAction();
    expect(object().transform.rot).toBe(0);
  });

  it('с выделением над объектом крутятся только выделенные символы, каждый от своего угла', () => {
    // Выделены «B» и «C».
    useEditorStore.setState({ selection: selectionFromRect({ x: 3, y: 2, w: 2, h: 1 }, 12, 6) });
    rotateSelectedAction(15);
    useEditorStore.setState({ selection: selectionFromRect({ x: 4, y: 2, w: 1, h: 1 }, 12, 6) });
    rotateSelectedAction(15);
    expect(object().transform.rot).toBe(0);
    expect(object().overrides.get(keyOf(1, 0))).toEqual({ rot: 15 });
    expect(object().overrides.get(keyOf(2, 0))).toEqual({ rot: 30 });
    resetSelectedRotationAction();
    expect(object().overrides.has(keyOf(2, 0))).toBe(false);
    expect(object().overrides.get(keyOf(1, 0))).toEqual({ rot: 15 });
  });

  it('выделение мимо объекта — снова объект целиком; масштаб снимается так же', () => {
    useEditorStore.setState({ selection: selectionFromRect({ x: 9, y: 4, w: 2, h: 1 }, 12, 6) });
    rotateSelectedAction(-15);
    expect(object().transform.rot).toBe(-15);
    useDocumentStore.getState().commitStructural('scale', {
      ...useDocumentStore.getState().doc,
      objects: [{ ...object(), transform: { ...object().transform, sx: 3 } }],
    });
    resetSelectedScaleAction();
    expect(object().transform.sx).toBe(1);
  });

  it('запертый объект не крутится ни целиком, ни по символам', () => {
    const id = setup(true);
    rotateSelectedAction(15);
    useEditorStore.setState({ selection: selectionFromRect({ x: 2, y: 2, w: 4, h: 1 }, 12, 6) });
    rotateSelectedAction(15);
    const obj = findObject(useDocumentStore.getState().doc, id)!;
    expect(obj.transform.rot).toBe(0);
    expect(obj.overrides.size).toBe(0);
  });
});

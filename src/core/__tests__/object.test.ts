import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import { addLayer, createDocument, createLayer, duplicateLayer, removeLayer } from '../document';
import { applyEdits, emptyGrid, keyOf } from '../grid';
import {
  MAX_OBJECTS,
  addObject,
  createObject,
  duplicateObject,
  findObject,
  moveObjectToLayer,
  objectsInVisualOrder,
  pasteObject,
  removeObject,
  removeObjectProp,
  setObjectProp,
  shiftObjectOrder,
  updateObject,
} from '../object';
import { setupObjectDoc as setup } from './helpers/objectDoc';

describe('object collection operations', () => {
  it('adds, updates, reorders, duplicates and removes objects immutably', () => {
    const { doc, layerId } = setup();
    const a = createObject({ name: 'A', layerId, x: 0, y: 0 });
    const b = createObject({ name: 'B', layerId, x: 1, y: 1 });
    const withBoth = addObject(addObject(doc, a), b);
    expect(doc.objects).toHaveLength(0);
    expect(withBoth.objects.map((o) => o.name)).toEqual(['A', 'B']);
    expect(() => addObject(withBoth, a)).toThrow(/Duplicate/);
    expect(() =>
      addObject(withBoth, createObject({ name: 'C', layerId: 'nope', x: 0, y: 0 })),
    ).toThrow(/Unknown layer/);

    const renamed = updateObject(withBoth, a.id, { name: 'A2', locked: true });
    expect(findObject(renamed, a.id)).toMatchObject({ name: 'A2', locked: true });
    expect(updateObject(withBoth, 'missing', { name: 'x' })).toBe(withBoth);
    expect(() => updateObject(withBoth, a.id, { layerId: 'nope' })).toThrow(/Unknown layer/);

    const reordered = shiftObjectOrder(withBoth, a.id, 1);
    expect(reordered.objects.map((o) => o.name)).toEqual(['B', 'A']);
    expect(shiftObjectOrder(reordered, a.id, 1)).toBe(reordered);
    expect(shiftObjectOrder(reordered, 'missing', 1)).toBe(reordered);

    const duplicated = duplicateObject(withBoth, a.id);
    expect(duplicated.objects).toHaveLength(3);
    expect(duplicated.objects[1]).toMatchObject({ name: 'A copy', transform: { x: 1, y: 1 } });
    expect(duplicateObject(withBoth, 'missing')).toBe(withBoth);

    const removed = removeObject(withBoth, b.id);
    expect(removed.objects).toHaveLength(1);
    expect(removeObject(removed, 'missing')).toBe(removed);
  });

  it('enforces the object limit', () => {
    const { doc, layerId } = setup();
    let full = doc;
    for (let i = 0; i < MAX_OBJECTS; i++) {
      full = addObject(full, createObject({ name: `o${i}`, layerId, x: 0, y: 0 }));
    }
    expect(() => addObject(full, createObject({ name: 'extra', layerId, x: 0, y: 0 }))).toThrow(
      /At most/,
    );
  });

  it('manages props', () => {
    const { doc, layerId } = setup();
    const obj = createObject({ name: 'A', layerId, x: 0, y: 0 });
    const withProps = setObjectProp(addObject(doc, obj), obj.id, 'hp', 10);
    expect(findObject(withProps, obj.id)?.props).toEqual({ hp: 10 });
    const cleared = removeObjectProp(withProps, obj.id, 'hp');
    expect(findObject(cleared, obj.id)?.props).toEqual({});
    expect(removeObjectProp(cleared, obj.id, 'hp')).toBe(cleared);
    expect(setObjectProp(cleared, 'missing', 'k', 1)).toBe(cleared);
  });
});

describe('shiftObjectOrder', () => {
  it('reorders among siblings of the same layer only', () => {
    const { doc, layerId } = setup();
    const second = createLayer('second');
    let next = addLayer(doc, second);
    const a = createObject({ name: 'A', layerId, x: 0, y: 0 });
    const x = createObject({ name: 'X', layerId: second.id, x: 0, y: 0 });
    const c = createObject({ name: 'C', layerId, x: 0, y: 0 });
    next = addObject(addObject(addObject(next, a), x), c);
    const shifted = shiftObjectOrder(next, c.id, -1);
    expect(shifted.objects.map((o) => o.name)).toEqual(['C', 'X', 'A']);
    expect(objectsInVisualOrder(shifted).map((o) => o.name)).toEqual(['C', 'A', 'X']);
    expect(shiftObjectOrder(shifted, c.id, -1)).toBe(shifted);
    expect(shiftObjectOrder(shifted, c.id, 0)).toBe(shifted);
  });
});

describe('layers and objects', () => {
  it('removes objects with their layer and duplicates them with a duplicated layer', () => {
    const { doc, layerId } = setup();
    const second = createLayer('second');
    let next = addLayer(doc, second);
    next = addObject(next, createObject({ name: 'on second', layerId: second.id, x: 0, y: 0 }));
    next = addObject(next, createObject({ name: 'on first', layerId, x: 0, y: 0 }));

    const duplicated = duplicateLayer(next, second.id);
    expect(duplicated.objects).toHaveLength(3);
    expect(duplicated.objects[2].layerId).toBe(duplicated.layers[2].id);
    expect(duplicated.objects[2].id).not.toBe(next.objects[0].id);

    const removed = removeLayer(next, second.id);
    expect(removed.objects.map((o) => o.name)).toEqual(['on first']);
  });
});

describe('pasteObject', () => {
  const base = () => {
    const doc = createDocument({ width: 8, height: 8 });
    const top = createLayer('top');
    const withTop = addLayer(doc, top);
    const cells = applyEdits(emptyGrid(), new Map([[keyOf(0, 0), makeCell('@')]]));
    const source = {
      ...createObject({ name: 'hero', layerId: doc.layers[0].id, x: 3, y: 2, cells }),
      locked: true,
      visible: false,
    };
    return { doc: withTop, top, source };
  };

  it('в кадр без такого объекта вставляет его с тем же id и на том же месте', () => {
    const { doc, top, source } = base();
    const { doc: next, object } = pasteObject(doc, source, top.id);
    expect(object.id).toBe(source.id);
    expect(object).toMatchObject({ transform: { x: 3, y: 2 }, name: 'hero', layerId: top.id });
    expect(findObject(next, source.id)?.cells.size).toBe(1);
  });

  it('если id уже занят, даёт новый, а оригинал не трогает', () => {
    const { doc, top, source } = base();
    const withOriginal = addObject(doc, source);
    const { doc: next, object } = pasteObject(withOriginal, source, top.id);
    expect(object.id).not.toBe(source.id);
    expect(next.objects).toHaveLength(2);
    expect(findObject(next, source.id)?.layerId).toBe(source.layerId);
  });

  it('вставленный объект виден и не заперт', () => {
    const { doc, top, source } = base();
    const { object } = pasteObject(doc, source, top.id);
    expect(object.visible).toBe(true);
    expect(object.locked).toBe(false);
  });
});

describe('moveObjectToLayer', () => {
  const setupTwoLayers = () => {
    const doc = createDocument({ width: 8, height: 8 });
    const top = createLayer('top');
    let next = addLayer(doc, top);
    const bottomId = doc.layers[0].id;
    const a = createObject({ name: 'a', layerId: bottomId, x: 0, y: 0 });
    const b = createObject({ name: 'b', layerId: top.id, x: 0, y: 0 });
    const c = createObject({ name: 'c', layerId: top.id, x: 0, y: 0 });
    next = addObject(addObject(addObject(next, a), b), c);
    return { doc: next, bottomId, topId: top.id, a, b, c };
  };

  it('переносит объект и кладёт его поверх объектов нового слоя', () => {
    const { doc, topId, a } = setupTwoLayers();
    const moved = moveObjectToLayer(doc, a.id, topId);
    expect(findObject(moved, a.id)?.layerId).toBe(topId);
    expect(objectsInVisualOrder(moved).map((o) => o.name)).toEqual(['b', 'c', 'a']);
  });

  it('тот же слой и неизвестный объект документ не меняют', () => {
    const { doc, bottomId, a } = setupTwoLayers();
    expect(moveObjectToLayer(doc, a.id, bottomId)).toBe(doc);
    expect(moveObjectToLayer(doc, 'missing', bottomId)).toBe(doc);
  });

  it('несуществующий слой — ошибка, а не молча потерянный объект', () => {
    const { doc, a } = setupTwoLayers();
    expect(() => moveObjectToLayer(doc, a.id, 'nope')).toThrow(/Unknown layer/);
  });
});

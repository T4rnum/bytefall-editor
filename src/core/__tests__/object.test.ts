import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import {
  addLayer,
  createDocument,
  createLayer,
  duplicateLayer,
  findLayer,
  removeLayer,
  setLayerCells,
  updateLayer,
} from '../document';
import { applyEdits, editsFromPoints, emptyGrid, getCell, keyOf } from '../grid';
import {
  MAX_OBJECTS,
  addObject,
  createObject,
  duplicateObject,
  findObject,
  groupSelection,
  objectAt,
  objectBounds,
  objectsInVisualOrder,
  removeObject,
  removeObjectProp,
  setObjectProp,
  shiftObjectOrder,
  topCellAt,
  ungroupObject,
  updateObject,
} from '../object';

const points = [
  { x: 2, y: 2 },
  { x: 3, y: 2 },
  { x: 2, y: 3 },
];

/** Документ 8×8 с тремя ячейками на первом слое. */
const setup = () => {
  const doc = createDocument({ width: 8, height: 8 });
  const layerId = doc.layers[0].id;
  const cells = applyEdits(emptyGrid(), editsFromPoints(points, makeCell('#', '#ff0000')));
  return { doc: setLayerCells(doc, layerId, cells), layerId };
};

describe('groupSelection / ungroupObject', () => {
  it('moves cells from the raster into a new object and back', () => {
    const { doc, layerId } = setup();
    const grouped = groupSelection(doc, layerId, { x: 2, y: 2, w: 2, h: 2 });
    expect(grouped).not.toBeNull();
    const { doc: next, object } = grouped!;
    expect(findLayer(next, layerId)!.cells.size).toBe(0);
    expect(object.cells.size).toBe(3);
    expect(getCell(object.cells, 0, 0)?.glyph).toBe('#');
    expect(objectBounds(object)).toEqual({ x: 2, y: 2, w: 2, h: 2 });

    const moved = updateObject(next, object.id, { x: 5, y: 5 });
    const baked = ungroupObject(moved, object.id);
    expect(baked.objects).toHaveLength(0);
    const raster = findLayer(baked, layerId)!.cells;
    expect(getCell(raster, 5, 5)?.glyph).toBe('#');
    expect(getCell(raster, 6, 5)?.glyph).toBe('#');
    expect(getCell(raster, 5, 6)?.glyph).toBe('#');
  });

  it('returns null for an empty selection or missing layer and drops off-canvas cells on bake', () => {
    const { doc, layerId } = setup();
    expect(groupSelection(doc, layerId, { x: 6, y: 6, w: 2, h: 2 })).toBeNull();
    expect(groupSelection(doc, 'missing', { x: 2, y: 2, w: 2, h: 2 })).toBeNull();
    const { doc: next, object } = groupSelection(doc, layerId, { x: 2, y: 2, w: 2, h: 2 })!;
    const outside = updateObject(next, object.id, { x: 7, y: 7 });
    const baked = ungroupObject(outside, object.id);
    expect(findLayer(baked, layerId)!.cells.size).toBe(1);
    expect(ungroupObject(baked, 'missing')).toBe(baked);
  });
});

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
    expect(duplicated.objects[1]).toMatchObject({ name: 'A copy', x: 1, y: 1 });
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

describe('hit testing', () => {
  it('prefers cell hits over bounding boxes and respects visibility and layer order', () => {
    const { doc, layerId } = setup();
    const top = createLayer('top');
    let next = addLayer(doc, top);
    const { doc: grouped, object: lower } = groupSelection(next, layerId, {
      x: 2,
      y: 2,
      w: 2,
      h: 2,
    })!;
    next = grouped;
    const upper = createObject({
      name: 'upper',
      layerId: top.id,
      x: 2,
      y: 2,
      cells: applyEdits(emptyGrid(), new Map([[keyOf(1, 1), makeCell('@')]])),
    });
    next = addObject(next, upper);

    expect(objectAt(next, 2, 2)?.id).toBe(lower.id);
    expect(objectAt(next, 3, 3)?.id).toBe(upper.id);
    expect(objectAt(next, 0, 0)).toBeUndefined();
    expect(objectsInVisualOrder(next).map((o) => o.id)).toEqual([lower.id, upper.id]);

    const hiddenUpper = updateObject(next, upper.id, { visible: false });
    expect(objectAt(hiddenUpper, 3, 3)?.id).toBe(lower.id);
    const hiddenLayer = updateLayer(next, top.id, { visible: false });
    expect(objectAt(hiddenLayer, 3, 3)?.id).toBe(lower.id);
    expect(objectBounds(createObject({ name: 'e', layerId, x: 4, y: 4 }))).toEqual({
      x: 4,
      y: 4,
      w: 1,
      h: 1,
    });
  });

  it('topCellAt looks through objects and rasters from the top', () => {
    const { doc, layerId } = setup();
    const { doc: grouped } = groupSelection(doc, layerId, { x: 2, y: 2, w: 1, h: 1 })!;
    expect(topCellAt(grouped, 2, 2)?.glyph).toBe('#');
    expect(topCellAt(grouped, 3, 2)?.glyph).toBe('#');
    expect(topCellAt(grouped, 0, 0)).toBeUndefined();
    expect(topCellAt(grouped, 9, 9)).toBeUndefined();
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

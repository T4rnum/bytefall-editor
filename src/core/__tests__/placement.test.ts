import { describe, expect, it } from 'vitest';
import { applyAffine } from '../affine';
import { makeCell } from '../cell';
import { addLayer, createDocument, createLayer, updateLayer } from '../document';
import { createEffect } from '../effects';
import { applyEdits, emptyGrid, keyOf } from '../grid';
import { groupSelection } from '../grouping';
import {
  type SceneObject,
  addObject,
  createObject,
  objectsInVisualOrder,
  transformObject,
  updateObject,
} from '../object';
import {
  isFreeObject,
  layerDrawOrder,
  objectAt,
  objectBounds,
  objectMatrices,
  objectMatrix,
  objectQuad,
  topCellAt,
} from '../placement';
import { rectSel, setupObjectDoc as setup } from './helpers/objectDoc';

/** Полоска «ABC» слева направо. */
const bar = () =>
  applyEdits(
    emptyGrid(),
    new Map([
      [keyOf(0, 0), makeCell('A')],
      [keyOf(1, 0), makeCell('B')],
      [keyOf(2, 0), makeCell('C')],
    ]),
  );

describe('hit testing', () => {
  it('prefers cell hits over bounding boxes and respects visibility and layer order', () => {
    const { doc, layerId } = setup();
    const top = createLayer('top');
    let next = addLayer(doc, top);
    const { doc: grouped, object: lower } = groupSelection(
      next,
      layerId,
      rectSel({ x: 2, y: 2, w: 2, h: 2 }),
    )!;
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
    const empty = createObject({ name: 'e', layerId, x: 4, y: 4 });
    expect(objectBounds(empty, objectMatrix(next, empty))).toEqual({ x: 4, y: 4, w: 1, h: 1 });
  });

  it('topCellAt looks through objects and rasters from the top', () => {
    const { doc, layerId } = setup();
    const { doc: grouped } = groupSelection(doc, layerId, rectSel({ x: 2, y: 2, w: 1, h: 1 }))!;
    expect(topCellAt(grouped, 2, 2)?.glyph).toBe('#');
    expect(topCellAt(grouped, 3, 2)?.glyph).toBe('#');
    expect(topCellAt(grouped, 0, 0)).toBeUndefined();
    expect(topCellAt(grouped, 9, 9)).toBeUndefined();
  });

  it('повёрнутый объект ловится там, где его видно, а не там, где он лежал', () => {
    let doc = createDocument({ width: 8, height: 8 });
    const obj = createObject({ name: 'bar', layerId: doc.layers[0].id, x: 2, y: 3, cells: bar() });
    doc = transformObject(addObject(doc, obj), obj.id, { rot: 90 });
    // Полоска встала столбцом на месте средней ячейки: (3, 2)…(3, 4).
    expect(objectAt(doc, 3, 2)?.id).toBe(obj.id);
    expect(topCellAt(doc, 3, 2)?.glyph).toBe('A');
    expect(topCellAt(doc, 3, 4)?.glyph).toBe('C');
    expect(objectAt(doc, 2, 3)).toBeUndefined();
    expect(topCellAt(doc, 4, 3)).toBeUndefined();
  });
});

describe('objectMatrices', () => {
  it('трансформ ребёнка задан относительно родителя', () => {
    let doc = createDocument({ width: 16, height: 16 });
    const layerId = doc.layers[0].id;
    const parent = createObject({ name: 'p', layerId, x: 4, y: 4, cells: bar() });
    const child: SceneObject = {
      ...createObject({ name: 'c', layerId, x: 3, y: 0, cells: bar() }),
      parentId: parent.id,
    };
    doc = addObject(addObject(doc, parent), child);
    // Без поворота ребёнок просто едет вместе с родителем.
    expect(applyAffine(objectMatrix(doc, child), 0, 0)).toEqual({ x: 7, y: 4 });

    // Родитель повернули на 90° вокруг его центра (1.5, 0.5). Центр первой ячейки ребёнка
    // лежал в (3.5, 0.5) у родителя, в двух ячейках правее опоры, — теперь он в двух ниже.
    const turned = transformObject(doc, parent.id, { rot: 90 });
    expect(applyAffine(objectMatrix(turned, child), 0.5, 0.5)).toEqual({ x: 5.5, y: 6.5 });
  });

  it('пропавший родитель и цикл не роняют вычисление: такой объект считается корнем', () => {
    let doc = createDocument({ width: 8, height: 8 });
    const layerId = doc.layers[0].id;
    const a = createObject({ name: 'a', layerId, x: 1, y: 1, id: 'a' });
    const b = createObject({ name: 'b', layerId, x: 2, y: 2, id: 'b' });
    doc = addObject(addObject(doc, { ...a, parentId: 'b' }), { ...b, parentId: 'a' });
    const matrices = objectMatrices(doc);
    expect(matrices.size).toBe(2);
    const orphan = { ...a, id: 'o', parentId: 'nobody' };
    const withOrphan = addObject(doc, orphan);
    expect(applyAffine(objectMatrix(withOrphan, orphan), 0, 0)).toEqual({ x: 1, y: 1 });
  });

  it('матрицы кэшируются по массиву объектов', () => {
    const { doc } = setup();
    expect(objectMatrices(doc)).toBe(objectMatrices({ ...doc, name: 'other' }));
  });
});

describe('isFreeObject / objectQuad', () => {
  it('целый сдвиг без правок символов — сетка, всё остальное — свободно', () => {
    let doc = createDocument({ width: 8, height: 8 });
    const obj = createObject({ name: 'bar', layerId: doc.layers[0].id, x: 2, y: 3, cells: bar() });
    doc = addObject(doc, obj);
    const free = (d: typeof doc): boolean =>
      isFreeObject(d.objects[0], objectMatrix(d, d.objects[0]));
    expect(free(doc)).toBe(false);
    expect(free(transformObject(doc, obj.id, { dx: 1 }))).toBe(false);
    expect(free(transformObject(doc, obj.id, { rot: 360 }))).toBe(false);
    expect(free(transformObject(doc, obj.id, { dx: 0.5 }))).toBe(true);
    expect(free(transformObject(doc, obj.id, { rot: 15 }))).toBe(true);
    expect(free(transformObject(doc, obj.id, { sx: 2 }))).toBe(true);
    const withOverride = updateObject(doc, obj.id, {
      overrides: new Map([[keyOf(1, 0), { rot: 30 }]]),
    });
    expect(free(withOverride)).toBe(true);
  });

  it('рамка повёрнутого объекта — повёрнутый прямоугольник, ограничивающий — его обхват', () => {
    let doc = createDocument({ width: 8, height: 8 });
    const obj = createObject({ name: 'bar', layerId: doc.layers[0].id, x: 2, y: 3, cells: bar() });
    doc = transformObject(addObject(doc, obj), obj.id, { rot: 90 });
    const quad = objectQuad(doc.objects[0], objectMatrix(doc, doc.objects[0]));
    expect(quad).toEqual([
      { x: 4, y: 2 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
      { x: 3, y: 2 },
    ]);
    expect(objectBounds(doc.objects[0], objectMatrix(doc, doc.objects[0]))).toEqual({
      x: 3,
      y: 2,
      w: 1,
      h: 3,
    });
  });
});

describe('layerDrawOrder', () => {
  it('без эффектов — порядок массива, с эффектами свободные объекты уходят наверх', () => {
    let doc = createDocument({ width: 8, height: 8 });
    const layerId = doc.layers[0].id;
    const turned = createObject({ name: 'turned', layerId, x: 0, y: 0, cells: bar() });
    const plain = createObject({ name: 'plain', layerId, x: 0, y: 2, cells: bar() });
    doc = transformObject(addObject(addObject(doc, turned), plain), turned.id, { rot: 45 });
    const names = (d: typeof doc): string[] =>
      layerDrawOrder(d.layers[0], d.objects, objectMatrices(d)).map((o) => o.name);
    expect(names(doc)).toEqual(['turned', 'plain']);
    const fiery = updateLayer(doc, layerId, { effects: [createEffect('fire')] });
    expect(names(fiery)).toEqual(['plain', 'turned']);
  });
});

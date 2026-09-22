import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import {
  addLayer,
  createDocument,
  createLayer,
  duplicateLayer,
  findLayer,
  moveLayer,
  removeLayer,
  resizeDocument,
  resizeOffset,
  setLayerCells,
  updateLayer,
} from '../document';
import { applyEdits, editsFromPoints, emptyGrid, getCell } from '../grid';
import { addObject, createObject } from '../object';

describe('createDocument', () => {
  it('creates a document with one layer and defaults', () => {
    const doc = createDocument();
    expect(doc.layers).toHaveLength(1);
    expect(doc.width).toBe(64);
    expect(doc.palette.length).toBe(16);
    expect(createDocument({ background: null }).background).toBeNull();
  });

  it('rejects invalid sizes', () => {
    expect(() => createDocument({ width: 0 })).toThrow(RangeError);
    expect(() => createDocument({ height: 2000 })).toThrow(RangeError);
    expect(() => createDocument({ width: 2.5 })).toThrow(RangeError);
  });
});

describe('layer operations', () => {
  it('adds, moves, duplicates and removes layers immutably', () => {
    const doc = createDocument();
    const second = createLayer('Second');
    const withTwo = addLayer(doc, second);
    expect(doc.layers).toHaveLength(1);
    expect(withTwo.layers.map((l) => l.name)).toEqual(['Layer 1', 'Second']);

    const moved = moveLayer(withTwo, second.id, 0);
    expect(moved.layers[0].id).toBe(second.id);
    expect(moveLayer(moved, second.id, 0)).toBe(moved);
    expect(moveLayer(moved, 'missing', 0)).toBe(moved);

    const duplicated = duplicateLayer(moved, second.id);
    expect(duplicated.layers).toHaveLength(3);
    expect(duplicated.layers[1].name).toBe('Second copy');
    expect(duplicateLayer(moved, 'missing')).toBe(moved);

    const removed = removeLayer(withTwo, second.id);
    expect(removed.layers).toHaveLength(1);
    expect(removeLayer(withTwo, 'missing')).toBe(withTwo);
    expect(() => removeLayer(doc, doc.layers[0].id)).toThrow(/last layer/);
    expect(() => addLayer(withTwo, second)).toThrow(/Duplicate/);
  });

  it('updates layer props and cells', () => {
    const doc = createDocument();
    const id = doc.layers[0].id;
    const renamed = updateLayer(doc, id, { name: 'Bg', opacity: 0.5 });
    expect(findLayer(renamed, id)?.name).toBe('Bg');
    expect(updateLayer(doc, 'missing', { name: 'x' })).toBe(doc);
    const cells = applyEdits(emptyGrid(), editsFromPoints([{ x: 1, y: 1 }], makeCell('#')));
    expect(findLayer(setLayerCells(doc, id, cells), id)?.cells.size).toBe(1);
  });
});

describe('resizeDocument', () => {
  it('crops cells outside of the new bounds', () => {
    const doc = createDocument({ width: 10, height: 10 });
    const id = doc.layers[0].id;
    const points = [
      { x: 1, y: 1 },
      { x: 8, y: 8 },
    ];
    const drawn = setLayerCells(
      doc,
      id,
      applyEdits(emptyGrid(), editsFromPoints(points, makeCell('#'))),
    );
    const resized = resizeDocument(drawn, 4, 4);
    expect(resized.width).toBe(4);
    expect(findLayer(resized, id)?.cells.size).toBe(1);
    expect(resizeDocument(drawn, 10, 10)).toBe(drawn);
    expect(() => resizeDocument(drawn, 0, 4)).toThrow(RangeError);
  });

  it('якорь решает, какой край обрезается', () => {
    const doc = createDocument({ width: 4, height: 4 });
    const id = doc.layers[0].id;
    const drawn = setLayerCells(
      doc,
      id,
      applyEdits(emptyGrid(), editsFromPoints([{ x: 3, y: 3 }], makeCell('#'))),
    );
    // Прижали влево-вверх: правый нижний угол ушёл под нож.
    expect(findLayer(resizeDocument(drawn, 2, 2, 'top-left'), id)?.cells.size).toBe(0);
    // Прижали вправо-вниз: ячейка уцелела и переехала в новый угол.
    const kept = resizeDocument(drawn, 2, 2, 'bottom-right');
    expect(getCell(findLayer(kept, id)!.cells, 1, 1)?.glyph).toBe('#');
  });

  it('при росте холста содержимое сдвигается вместе с объектами', () => {
    const base = createDocument({ width: 4, height: 4 });
    const id = base.layers[0].id;
    const drawn = setLayerCells(
      base,
      id,
      applyEdits(emptyGrid(), editsFromPoints([{ x: 0, y: 0 }], makeCell('#'))),
    );
    const object = createObject({ name: 'o', layerId: id, x: 0, y: 0 });
    const doc = addObject(drawn, object);

    const grown = resizeDocument(doc, 8, 8, 'center');
    expect(getCell(findLayer(grown, id)!.cells, 2, 2)?.glyph).toBe('#');
    expect(grown.objects[0]).toMatchObject({ x: 2, y: 2 });

    const corner = resizeDocument(doc, 8, 8, 'bottom-right');
    expect(getCell(findLayer(corner, id)!.cells, 4, 4)?.glyph).toBe('#');
    expect(corner.objects[0]).toMatchObject({ x: 4, y: 4 });
  });

  it('смещение якоря считается от разницы размеров', () => {
    const doc = createDocument({ width: 4, height: 4 });
    expect(resizeOffset(doc, 8, 8, 'top-left')).toEqual({ x: 0, y: 0 });
    expect(resizeOffset(doc, 8, 8, 'center')).toEqual({ x: 2, y: 2 });
    expect(resizeOffset(doc, 8, 8, 'bottom-right')).toEqual({ x: 4, y: 4 });
    expect(resizeOffset(doc, 2, 4, 'right')).toEqual({ x: -2, y: 0 });
  });
});

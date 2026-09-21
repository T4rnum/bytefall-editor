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
  setLayerCells,
  updateLayer,
} from '../document';
import { applyEdits, editsFromPoints, emptyGrid } from '../grid';

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
});

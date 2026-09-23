import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import { createDocument, findLayer } from '../document';
import { applyEdits, emptyGrid, getCell, keyOf } from '../grid';
import { groupSelection, ungroupObject } from '../grouping';
import { addObject, createObject, transformObject } from '../object';
import { objectBounds, objectMatrix } from '../placement';
import { rectSel, setupObjectDoc as setup } from './helpers/objectDoc';

describe('groupSelection / ungroupObject', () => {
  it('moves cells from the raster into a new object and back', () => {
    const { doc, layerId } = setup();
    const grouped = groupSelection(doc, layerId, rectSel({ x: 2, y: 2, w: 2, h: 2 }));
    expect(grouped).not.toBeNull();
    const { doc: next, object } = grouped!;
    expect(findLayer(next, layerId)!.cells.size).toBe(0);
    expect(object.cells.size).toBe(3);
    expect(getCell(object.cells, 0, 0)?.glyph).toBe('#');
    expect(objectBounds(object, objectMatrix(next, object))).toEqual({ x: 2, y: 2, w: 2, h: 2 });

    const moved = transformObject(next, object.id, { x: 5, y: 5 });
    const baked = ungroupObject(moved, object.id);
    expect(baked.objects).toHaveLength(0);
    const raster = findLayer(baked, layerId)!.cells;
    expect(getCell(raster, 5, 5)?.glyph).toBe('#');
    expect(getCell(raster, 6, 5)?.glyph).toBe('#');
    expect(getCell(raster, 5, 6)?.glyph).toBe('#');
  });

  it('новый объект вращается вокруг центра выделения', () => {
    const { doc, layerId } = setup();
    const { object } = groupSelection(doc, layerId, rectSel({ x: 2, y: 2, w: 2, h: 2 }))!;
    expect(object.transform).toMatchObject({ x: 2, y: 2, px: 1, py: 1, rot: 0, sx: 1, sy: 1 });
  });

  it('returns null for an empty selection or missing layer and drops off-canvas cells on bake', () => {
    const { doc, layerId } = setup();
    expect(groupSelection(doc, layerId, rectSel({ x: 6, y: 6, w: 2, h: 2 }))).toBeNull();
    expect(groupSelection(doc, 'missing', rectSel({ x: 2, y: 2, w: 2, h: 2 }))).toBeNull();
    const { doc: next, object } = groupSelection(
      doc,
      layerId,
      rectSel({ x: 2, y: 2, w: 2, h: 2 }),
    )!;
    const outside = transformObject(next, object.id, { x: 7, y: 7 });
    const baked = ungroupObject(outside, object.id);
    expect(findLayer(baked, layerId)!.cells.size).toBe(1);
    expect(ungroupObject(baked, 'missing')).toBe(baked);
  });

  it('повёрнутый объект впечатывается так, как его видно: поворот на 90° переставляет ячейки', () => {
    let doc = createDocument({ width: 8, height: 8 });
    const layerId = doc.layers[0].id;
    // Полоска «ABC» в (2, 3), опора в центре средней ячейки.
    const cells = applyEdits(
      emptyGrid(),
      new Map([
        [keyOf(0, 0), makeCell('A')],
        [keyOf(1, 0), makeCell('B')],
        [keyOf(2, 0), makeCell('C')],
      ]),
    );
    const obj = createObject({ name: 'bar', layerId, x: 2, y: 3, cells });
    doc = transformObject(addObject(doc, obj), obj.id, { rot: 90 });
    const raster = findLayer(ungroupObject(doc, obj.id), layerId)!.cells;
    // По часовой стрелке: A сверху, C снизу, всё в столбце средней ячейки.
    expect(getCell(raster, 3, 2)?.glyph).toBe('A');
    expect(getCell(raster, 3, 3)?.glyph).toBe('B');
    expect(getCell(raster, 3, 4)?.glyph).toBe('C');
    expect(raster.size).toBe(3);
  });
});

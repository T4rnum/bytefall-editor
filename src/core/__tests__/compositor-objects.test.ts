import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import { type CellBuffer, composite } from '../compositor';
import { addLayer, createDocument, createLayer, setLayerCells, updateLayer } from '../document';
import { applyEdits, editsFromPoints, emptyGrid, keyOf } from '../grid';
import { addObject, createObject, updateObject } from '../object';

const glyphAt = (buf: CellBuffer, x: number, y: number): string => buf.glyphs[y * buf.width + x];
const fgAlphaAt = (buf: CellBuffer, x: number, y: number): number =>
  buf.fg[(y * buf.width + x) * 4 + 3];

const twoCells = () =>
  applyEdits(
    emptyGrid(),
    new Map([
      [keyOf(0, 0), makeCell('a')],
      [keyOf(1, 0), makeCell('b')],
    ]),
  );

describe('composite with objects', () => {
  it('draws object cells at their offset above the raster of their layer', () => {
    let doc = createDocument({ width: 6, height: 3 });
    const layerId = doc.layers[0].id;
    doc = setLayerCells(
      doc,
      layerId,
      applyEdits(emptyGrid(), editsFromPoints([{ x: 2, y: 1 }], makeCell('r'))),
    );
    doc = addObject(doc, createObject({ name: 'o', layerId, x: 2, y: 1, cells: twoCells() }));
    const buf = composite(doc);
    expect(glyphAt(buf, 2, 1)).toBe('a');
    expect(glyphAt(buf, 3, 1)).toBe('b');
  });

  it('skips hidden objects and clips objects hanging off the canvas', () => {
    let doc = createDocument({ width: 4, height: 2 });
    const layerId = doc.layers[0].id;
    const obj = createObject({ name: 'o', layerId, x: -1, y: 0, cells: twoCells() });
    doc = addObject(doc, obj);
    const buf = composite(doc);
    expect(glyphAt(buf, 0, 0)).toBe('b');
    expect(buf.glyphs.filter((g) => g !== '')).toHaveLength(1);
    expect(
      composite(updateObject(doc, obj.id, { visible: false })).glyphs.every((g) => g === ''),
    ).toBe(true);
  });

  it('applies layer opacity to objects and lets upper layers cover them', () => {
    let doc = createDocument({ width: 4, height: 2 });
    const lowerId = doc.layers[0].id;
    doc = addObject(
      doc,
      createObject({ name: 'o', layerId: lowerId, x: 0, y: 0, cells: twoCells() }),
    );
    doc = updateLayer(doc, lowerId, { opacity: 0.5 });
    expect(fgAlphaAt(composite(doc), 0, 0)).toBeCloseTo(0.5);

    const upper = createLayer('upper');
    doc = addLayer(doc, upper);
    doc = setLayerCells(
      doc,
      upper.id,
      applyEdits(
        emptyGrid(),
        editsFromPoints([{ x: 0, y: 0 }], makeCell('', '#ffffff', '#000000')),
      ),
    );
    const buf = composite(doc);
    expect(glyphAt(buf, 0, 0)).toBe('');
    expect(glyphAt(buf, 1, 0)).toBe('b');
  });
});

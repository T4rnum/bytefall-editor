import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import { composite, stackCell } from '../compositor';
import { createDocument, setLayerCells, updateLayer } from '../document';
import { createEffect } from '../effects';
import { applyEdits, editsFromPoints, emptyGrid, keyOf } from '../grid';
import { addObject, createObject } from '../object';
import { deserialize, serialize } from '../serialization';
import { createAnimation } from '../animation';

describe('stackCell', () => {
  it('keeps the raster glyph under a translucent object background', () => {
    const under = makeCell('@', '#ffffff', '#000000');
    const tinted = stackCell(under, makeCell('', '#ffffff', '#ff000080'));
    expect(tinted.glyph).toBe('@');
    expect(tinted.bg).toBe('#800000');
    expect(stackCell(under, makeCell('', '#ffffff', '#00ff00'))).toMatchObject({
      glyph: '',
      bg: '#00ff00',
    });
    expect(stackCell(under, makeCell('x', '#123456'))).toMatchObject({ glyph: 'x', bg: '#000000' });
    expect(stackCell(under, makeCell(''))).toBe(under);
    expect(stackCell(undefined, under)).toBe(under);
  });

  it('applies the same rule when a layer with effects merges objects over its raster', () => {
    let doc = createDocument({ width: 4, height: 2 });
    const layerId = doc.layers[0].id;
    doc = setLayerCells(
      doc,
      layerId,
      applyEdits(emptyGrid(), editsFromPoints([{ x: 1, y: 1 }], makeCell('@'))),
    );
    const cells = applyEdits(
      emptyGrid(),
      new Map([[keyOf(0, 0), makeCell('', '#ffffff', '#ff000080')]]),
    );
    doc = addObject(doc, createObject({ name: 'tint', layerId, x: 1, y: 1, cells }));
    doc = updateLayer(doc, layerId, {
      effects: [{ ...createEffect('scroll', 's'), dx: 0, dy: 0 }],
    });
    const buf = composite(doc);
    expect(buf.glyphs[1 * 4 + 1]).toBe('@');
  });
});

describe('effect ids in files', () => {
  it('rejects duplicate effect ids inside one layer', () => {
    const doc = createDocument({ width: 2, height: 2 });
    const effects = [createEffect('pulse', 'same'), createEffect('wave', 'same')];
    const anim = createAnimation(updateLayer(doc, doc.layers[0].id, { effects }));
    expect(() => deserialize(serialize(anim))).toThrow(/Duplicate effect id/);
  });
});

import { describe, expect, it } from 'vitest';
import { type Cell, makeCell } from '../cell';
import { type CellBuffer, createCellBuffer } from '../cellBuffer';
import { composite } from '../compositor';
import {
  type Document,
  addLayer,
  createDocument,
  createLayer,
  setLayerCells,
  updateLayer,
} from '../document';
import { applyEdits, editsFromPoints, emptyGrid, keyOf } from '../grid';

const at = (buf: CellBuffer, x: number, y: number) => {
  const i = y * buf.width + x;
  return {
    glyph: buf.glyphs[i],
    fg: [...buf.fg.slice(i * 4, i * 4 + 4)],
    bg: [...buf.bg.slice(i * 4, i * 4 + 4)],
  };
};

const withCell = (doc: Document, layerId: string, x: number, y: number, cell: Cell): Document =>
  setLayerCells(doc, layerId, applyEdits(emptyGrid(), editsFromPoints([{ x, y }], cell)));

describe('composite', () => {
  it('draws a single layer', () => {
    const doc = createDocument({ width: 4, height: 2 });
    const buf = composite(
      withCell(doc, doc.layers[0].id, 1, 0, makeCell('@', '#ff0000', '#0000ff')),
    );
    expect(at(buf, 1, 0)).toEqual({ glyph: '@', fg: [1, 0, 0, 1], bg: [0, 0, 1, 1] });
    expect(at(buf, 0, 0).glyph).toBe('');
    expect(at(buf, 0, 0).bg[3]).toBe(0);
  });

  it('skips hidden layers and lets opaque backgrounds cover lower glyphs', () => {
    let doc = createDocument({ width: 2, height: 1 });
    doc = withCell(doc, doc.layers[0].id, 0, 0, makeCell('a', '#ffffff'));
    const top = createLayer('top');
    doc = withCell(addLayer(doc, top), top.id, 0, 0, makeCell('', '#ffffff', '#00ff00'));
    expect(at(composite(doc), 0, 0)).toEqual({ glyph: '', fg: [0, 0, 0, 0], bg: [0, 1, 0, 1] });
    expect(at(composite(updateLayer(doc, top.id, { visible: false })), 0, 0).glyph).toBe('a');
  });

  it('blends translucent layers by opacity and keeps the lower glyph visible', () => {
    let doc = createDocument({ width: 1, height: 1 });
    doc = withCell(doc, doc.layers[0].id, 0, 0, makeCell('a', '#ffffff', '#000000'));
    const top = createLayer('top');
    doc = withCell(addLayer(doc, top), top.id, 0, 0, makeCell('', '#ffffff', '#ffffff'));
    doc = updateLayer(doc, top.id, { opacity: 0.5 });
    const px = at(composite(doc), 0, 0);
    expect(px.glyph).toBe('a');
    expect(px.bg[0]).toBeCloseTo(0.5);
    expect(px.bg[3]).toBe(1);
    expect(px.fg[0]).toBe(1);
    expect(px.fg[3]).toBe(1);
  });

  it('overlays preview edits, hides cells edited to null and reuses the target buffer', () => {
    const doc = createDocument({ width: 3, height: 1 });
    const id = doc.layers[0].id;
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    const drawn = setLayerCells(
      doc,
      id,
      applyEdits(emptyGrid(), editsFromPoints(points, makeCell('x'))),
    );
    const edits = new Map([
      [keyOf(0, 0), null],
      [keyOf(2, 0), makeCell('p')],
    ]);
    const target = createCellBuffer(3, 1);
    const buf = composite(drawn, { layerId: id, edits }, target);
    expect(buf).toBe(target);
    expect(buf.glyphs).toEqual(['', 'x', 'p']);
    expect(composite(drawn, { layerId: 'other', edits }).glyphs).toEqual(['x', 'x', '']);
    expect(composite(drawn, null, createCellBuffer(1, 1)).width).toBe(3);
  });

  it('ignores cells outside of the document', () => {
    const doc = createDocument({ width: 2, height: 2 });
    const buf = composite(withCell(doc, doc.layers[0].id, 5, 5, makeCell('x')));
    expect(buf.glyphs.every((g) => g === '')).toBe(true);
  });
});

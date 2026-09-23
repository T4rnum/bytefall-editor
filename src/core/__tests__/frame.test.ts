import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import type { CellBuffer } from '../cellBuffer';
import { composite } from '../compositor';
import {
  type Document,
  addLayer,
  createDocument,
  createLayer,
  setLayerCells,
  updateLayer,
} from '../document';
import { createEffect } from '../effects';
import { type ComposedFrame, type FramePass, composeFrame } from '../frame';
import { applyEdits, editsFromPoints, emptyGrid, keyOf } from '../grid';
import { readInstance } from '../instances';
import { addObject, createObject, transformObject, updateObject } from '../object';
import { tileLayout, tilesFromKeys } from '../tiles';

const kinds = (frame: ComposedFrame): string[] => frame.passes.map((p) => p.kind);
const cellsOf = (pass: FramePass): CellBuffer => {
  if (pass.kind !== 'cells') throw new Error('ожидался проход ячеек');
  return pass.buffer;
};
const glyphAt = (buf: CellBuffer, x: number, y: number): string => buf.glyphs[y * buf.width + x];

/** Полоска «ab» на нижнем слое и «X» на верхнем в той же строке. */
function scene(): { doc: Document; bottom: string; top: string; objectId: string } {
  let doc = createDocument({ width: 8, height: 4 });
  const bottom = doc.layers[0].id;
  const top = createLayer('top');
  doc = addLayer(doc, top);
  doc = setLayerCells(
    doc,
    top.id,
    applyEdits(emptyGrid(), editsFromPoints([{ x: 3, y: 1 }], makeCell('X'))),
  );
  const cells = applyEdits(
    emptyGrid(),
    new Map([
      [keyOf(0, 0), makeCell('a')],
      [keyOf(1, 0), makeCell('b')],
    ]),
  );
  const obj = createObject({ name: 'ab', layerId: bottom, x: 2, y: 1, cells });
  return { doc: addObject(doc, obj), bottom, top: top.id, objectId: obj.id };
}

describe('composeFrame', () => {
  it('без свободных объектов — один проход, тот же, что плоский кадр', () => {
    const { doc } = scene();
    const frame = composeFrame(doc);
    expect(kinds(frame)).toEqual(['cells']);
    const flat = composite(doc);
    expect(cellsOf(frame.passes[0]).glyphs).toEqual(flat.glyphs);
    expect([...cellsOf(frame.passes[0]).fg]).toEqual([...flat.fg]);
    expect(frame.dirty).toBeNull();
  });

  it('повёрнутый объект встаёт отдельным проходом между своим слоем и верхним', () => {
    const { doc, objectId } = scene();
    const turned = transformObject(doc, objectId, { rot: 90 });
    const frame = composeFrame(turned);
    expect(kinds(frame)).toEqual(['cells', 'glyphs', 'cells']);
    const pass = frame.passes[1];
    if (pass.kind !== 'glyphs') throw new Error('ожидался проход символов');
    expect(pass.batch.count).toBe(2);
    // Опора — центр пары, (1, 0.5): после поворота «a» встаёт над «b». Опора лежит на границе
    // ячеек, поэтому и центры символов — на линии сетки x = 3.
    const a = readInstance(pass.batch, 0);
    expect(a).toMatchObject({ glyph: 'a', x: 3, y: 1 });
    expect(a.rot).toBeCloseTo(Math.PI / 2);
    expect(readInstance(pass.batch, 1)).toMatchObject({ glyph: 'b', x: 3, y: 2 });
    // Нижний проход объекта больше не содержит: он ушёл в символы.
    expect(glyphAt(cellsOf(frame.passes[0]), 2, 1)).toBe('');
    expect(glyphAt(cellsOf(frame.passes[2]), 3, 1)).toBe('X');
  });

  it('символ верхнего прохода закрывает символ нижнего, как в плоском буфере', () => {
    const { doc, bottom, objectId } = scene();
    let next = setLayerCells(
      doc,
      bottom,
      applyEdits(emptyGrid(), editsFromPoints([{ x: 3, y: 1 }], makeCell('#'))),
    );
    next = transformObject(next, objectId, { rot: 45 });
    const frame = composeFrame(next);
    expect(kinds(frame)).toEqual(['cells', 'glyphs', 'cells']);
    // На нижнем слое в (3, 1) был «#», сверху «X»: на экране виден только «X».
    expect(glyphAt(cellsOf(frame.passes[0]), 3, 1)).toBe('');
    expect(cellsOf(frame.passes[0]).fg[(1 * 8 + 3) * 4 + 3]).toBe(0);
    expect(glyphAt(cellsOf(frame.passes[2]), 3, 1)).toBe('X');
  });

  it('непрозрачность слоя уходит в альфу символов, правленые символы идут последними', () => {
    const { doc, bottom, objectId } = scene();
    let next = updateLayer(doc, bottom, { opacity: 0.5 });
    next = transformObject(next, objectId, { sx: 2 });
    next = updateObject(next, objectId, { overrides: new Map([[keyOf(0, 0), { rot: 90 }]]) });
    const pass = composeFrame(next).passes[1];
    if (pass.kind !== 'glyphs') throw new Error('ожидался проход символов');
    const [first, second] = [readInstance(pass.batch, 0), readInstance(pass.batch, 1)];
    expect(first.glyph).toBe('b');
    expect(second.glyph).toBe('a');
    expect(second.rot).toBeCloseTo(Math.PI / 2);
    expect(first.fg.a).toBeCloseTo(0.5);
    expect(first.sx).toBeCloseTo(2);
  });

  it('на слое с эффектами свободный объект идёт после результата эффектов', () => {
    const { doc, bottom, objectId } = scene();
    let next = updateLayer(doc, bottom, { effects: [createEffect('pulse')] });
    next = transformObject(next, objectId, { rot: 30 });
    expect(kinds(composeFrame(next, null, null, [], 250))).toEqual(['cells', 'glyphs', 'cells']);
  });

  it('призраки со свободными объектами рисуются под основным документом', () => {
    const { doc, objectId } = scene();
    const ghost = { doc: transformObject(doc, objectId, { rot: 90 }), opacity: 0.3 };
    const frame = composeFrame(doc, null, null, [ghost]);
    expect(kinds(frame)).toEqual(['cells', 'glyphs', 'cells']);
    const pass = frame.passes[1];
    if (pass.kind !== 'glyphs') throw new Error('ожидался проход символов');
    expect(readInstance(pass.batch, 0).fg.a).toBeCloseTo(0.3);
  });

  it('частичная пересборка совпадает с полной во всех проходах', () => {
    const { doc, top, objectId } = scene();
    const turned = transformObject(doc, objectId, { rot: 90 });
    const previous = composeFrame(turned);
    const preview = { layerId: top, edits: editsFromPoints([{ x: 5, y: 2 }], makeCell('*')) };
    const tiles = tilesFromKeys(tileLayout(8, 4), preview.edits.keys());
    const full = composeFrame(turned, preview);
    const partial = composeFrame(turned, preview, previous, [], 0, tiles);
    expect(partial.dirty).toEqual([...tiles]);
    expect(kinds(partial)).toEqual(kinds(full));
    partial.passes.forEach((pass, i) => {
      if (pass.kind === 'cells') expect(pass.buffer.glyphs).toEqual(cellsOf(full.passes[i]).glyphs);
    });
  });

  it('если объект стал свободным, кадр пересобирается целиком, а не по тайлам', () => {
    const { doc, objectId } = scene();
    const previous = composeFrame(doc);
    const turned = transformObject(doc, objectId, { rot: 90 });
    const frame = composeFrame(turned, null, previous, [], 0, [0]);
    expect(frame.dirty).toBeNull();
    expect(kinds(frame)).toEqual(['cells', 'glyphs', 'cells']);
  });
});

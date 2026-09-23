import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import type { CellBuffer } from '../cellBuffer';
import { composite } from '../compositor';
import { type Document, createDocument, setLayerCells, updateLayer } from '../document';
import { createEffect } from '../effects';
import { composeFrame } from '../frame';
import { keyOf } from '../grid';
import { readInstance } from '../instances';
import { lookCell, tintOf } from '../look';
import { addObject, createObject, transformObject, updateObject } from '../object';

/** Серый символ `-` на слое в (1, 0) и белый объект `O` поверх него в той же ячейке. */
function scene(look: { opacity?: number; tint?: string | null }): Document {
  let doc = createDocument({ width: 3, height: 1, background: null });
  const layerId = doc.layers[0].id;
  doc = setLayerCells(doc, layerId, new Map([[keyOf(1, 0), makeCell('-', '#808080')]]));
  const obj = createObject({
    id: 'o',
    name: 'O',
    layerId,
    x: 1,
    y: 0,
    cells: new Map([[keyOf(0, 0), makeCell('O', '#ffffff', '#000000')]]),
  });
  return updateObject(addObject(doc, obj), 'o', look);
}

const at = (buf: CellBuffer, x: number) => ({
  glyph: buf.glyphs[x],
  fg: [...buf.fg.slice(x * 4, x * 4 + 4)].map((v) => Math.round(v * 255)),
  bg: [...buf.bg.slice(x * 4, x * 4 + 4)].map((v) => Math.round(v * 255)),
});

describe('вид объекта', () => {
  it('оттенок смешивает цвета символа и фона к своему цвету с силой из альфы', () => {
    const cell = at(composite(scene({ tint: '#ff000080' })), 1);
    expect(cell.glyph).toBe('O');
    expect(cell.fg).toEqual([255, 127, 127, 255]);
    expect(cell.bg).toEqual([128, 0, 0, 255]);
  });

  it('непрозрачность объекта умножается на непрозрачность слоя', () => {
    let doc = scene({ opacity: 0.5 });
    doc = updateLayer(doc, doc.layers[0].id, { opacity: 0.5 });
    expect(at(composite(doc), 1).fg[3]).toBe(64);
  });

  it('совсем прозрачный объект не стирает символ под собой', () => {
    expect(at(composite(scene({ opacity: 0 })), 1).glyph).toBe('-');
  });

  it('на слое с эффектом объект уходит в сетку уже со своим видом', () => {
    let doc = scene({ opacity: 0.5, tint: '#0000ff' });
    // Прокрутка с нулевой скоростью включена, но ничего не сдвигает: путь тот же, что у огня.
    const still = { ...createEffect('scroll'), dx: 0, dy: 0 };
    doc = updateLayer(doc, doc.layers[0].id, { effects: [still] });
    const cell = at(composite(doc), 1);
    expect(cell.fg).toEqual([0, 0, 255, 128]);
  });

  it('повёрнутый объект несёт вид в поток символов', () => {
    const doc = transformObject(scene({ opacity: 0.5, tint: '#00ff00' }), 'o', { rot: 45 });
    const pass = composeFrame(doc).passes.find((p) => p.kind === 'glyphs');
    if (pass?.kind !== 'glyphs') throw new Error('ожидался поток символов');
    const glyph = readInstance(pass.batch, 0);
    expect([glyph.fg.r, glyph.fg.g, glyph.fg.b, glyph.fg.a]).toEqual([0, 1, 0, 0.5]);
  });

  it('оттенок без силы ничего не меняет', () => {
    const obj = scene({ tint: '#ff000000' }).objects[0];
    expect(tintOf(obj)).toBeNull();
    const cell = makeCell('A', '#123456');
    expect(lookCell(cell, null, 1)).toBe(cell);
  });
});

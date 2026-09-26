import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import { cellsIntoObject, glyphsIntoLayer, recolorEdits } from '../cellTransfer';
import { createDocument } from '../document';
import { keyOf } from '../grid';
import { placedGlyphs } from '../glyphPick';
import { addObject, createObject, findObject, transformObject } from '../object';
import { objectMatrix } from '../placement';
import { selectionFromRect } from '../selection';

/**
 * Строка «ABC» в (4, 4), повёрнутая на 90° вокруг центра строки (1.5, 0.5): встаёт столбцом
 * x = 5, «A» в (5, 3), «B» в (5, 4), «C» в (5, 5).
 */
function turned() {
  let doc = createDocument({ width: 10, height: 10 });
  const layerId = doc.layers[0].id;
  const cells = new Map([
    [keyOf(0, 0), makeCell('A', '#ff0000')],
    [keyOf(1, 0), makeCell('B', '#00ff00')],
    [keyOf(2, 0), makeCell('C', '#0000ff')],
  ]);
  doc = addObject(doc, createObject({ name: 'o', id: 'o', layerId, x: 4, y: 4, cells }));
  return transformObject(doc, 'o', { rot: 90 });
}

describe('ячейки между слоем и объектом', () => {
  it('перекраска меняет цвета, а символы и пустоты оставляет', () => {
    const grid = new Map([
      [keyOf(0, 0), makeCell('A', '#ff0000')],
      [keyOf(1, 0), makeCell('B', '#123456', '#000000')],
    ]);
    const edits = recolorEdits(grid, [keyOf(0, 0), keyOf(1, 0), keyOf(5, 5)], '#123456', '#000000');
    expect([...edits.keys()]).toEqual([keyOf(0, 0)]);
    expect(edits.get(keyOf(0, 0))).toEqual(makeCell('A', '#123456', '#000000'));
  });

  it('ячейка слоя уходит в клетку повёрнутого объекта под своим центром', () => {
    const doc = turned();
    const obj = findObject(doc, 'o')!;
    // Клетка слоя (5, 6) под столбцом — продолжение строки: клетка (3, 0) объекта.
    const layer = new Map([
      [keyOf(5, 6), makeCell('D')],
      [keyOf(0, 0), makeCell('X')],
    ]);
    const selection = selectionFromRect({ x: 5, y: 6, w: 1, h: 1 }, 10, 10)!;
    const { local, cleared } = cellsIntoObject(layer, selection, objectMatrix(doc, obj));
    expect(local).toEqual([{ x: 3, y: 0, cell: makeCell('D') }]);
    expect([...cleared.keys()]).toEqual([keyOf(5, 6)]);
  });

  it('символ ложится в ячейку слоя под центром, за краем — пропадает', () => {
    const doc = turned();
    const obj = findObject(doc, 'o')!;
    const placed = placedGlyphs(doc, obj, 0);
    const out = glyphsIntoLayer(obj.cells, placed, [keyOf(1, 0)], 10, 10);
    expect([...out.layer]).toEqual([[keyOf(5, 4), makeCell('B', '#00ff00')]]);
    expect(out.removed).toEqual([{ x: 1, y: 0, cell: null }]);
    expect(out.lost).toBe(0);
    expect(glyphsIntoLayer(obj.cells, placed, [keyOf(0, 0)], 5, 3).lost).toBe(1);
  });
});

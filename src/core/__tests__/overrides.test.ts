import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import { createDocument } from '../document';
import { type CellKey, applyEdits, emptyGrid, keyOf } from '../grid';
import { addObject, createObject, findObject, transformObject } from '../object';
import { effectiveOverride, glyphsInSelection, updateGlyphOverrides } from '../overrides';
import { objectMatrix } from '../placement';
import { selectionFromRect } from '../selection';

/** Полоска «ABC» в (2, 3) на холсте 8×8. */
function setup() {
  const doc = createDocument({ width: 8, height: 8 });
  const cells = applyEdits(
    emptyGrid(),
    new Map([
      [keyOf(0, 0), makeCell('A')],
      [keyOf(1, 0), makeCell('B')],
      [keyOf(2, 0), makeCell('C')],
    ]),
  );
  const obj = createObject({ name: 'bar', layerId: doc.layers[0].id, x: 2, y: 3, cells });
  return { doc: addObject(doc, obj), id: obj.id };
}

const rect = (x: number, y: number, w: number, h: number) =>
  selectionFromRect({ x, y, w, h }, 8, 8)!;

describe('glyphsInSelection', () => {
  it('символы под выделенными ячейками, в локальных ключах', () => {
    const { doc, id } = setup();
    const obj = findObject(doc, id)!;
    const keys = glyphsInSelection(obj, objectMatrix(doc, obj), rect(3, 0, 5, 8));
    expect(keys).toEqual([keyOf(1, 0), keyOf(2, 0)]);
    expect(glyphsInSelection(obj, objectMatrix(doc, obj), rect(0, 0, 2, 8))).toEqual([]);
  });

  it('у повёрнутого объекта выделяется то, что видно под рамкой', () => {
    const { doc, id } = setup();
    const turned = transformObject(doc, id, { rot: 90 });
    const obj = findObject(turned, id)!;
    // Полоска встала столбцом x = 3, y = 2…4, «A» сверху.
    expect(glyphsInSelection(obj, objectMatrix(turned, obj), rect(3, 2, 1, 1))).toEqual([
      keyOf(0, 0),
    ]);
    expect(glyphsInSelection(obj, objectMatrix(turned, obj), rect(2, 3, 1, 1))).toEqual([]);
  });
});

describe('updateGlyphOverrides', () => {
  const keys: CellKey[] = [keyOf(0, 0), keyOf(2, 0)];

  it('каждый символ получает свою правку от своего текущего значения', () => {
    const { doc, id } = setup();
    const set = updateGlyphOverrides(doc, id, keys, (c) => ({ ...c, rot: 30 }));
    const turned = updateGlyphOverrides(set, id, [keyOf(0, 0)], (c) => ({ ...c, rot: c.rot + 15 }));
    const overrides = findObject(turned, id)!.overrides;
    expect(overrides.get(keyOf(0, 0))).toEqual({ rot: 45 });
    expect(overrides.get(keyOf(2, 0))).toEqual({ rot: 30 });
    expect(overrides.has(keyOf(1, 0))).toBe(false);
    expect(effectiveOverride(overrides, keyOf(1, 0))).toEqual({
      dx: 0,
      dy: 0,
      rot: 0,
      sx: 1,
      sy: 1,
    });
  });

  it('правка «как есть» удаляется, неизменный документ возвращается тем же', () => {
    const { doc, id } = setup();
    const scaled = updateGlyphOverrides(doc, id, keys, (c) => ({ ...c, sx: 2, sy: 2 }));
    const back = updateGlyphOverrides(scaled, id, keys, (c) => ({ ...c, sx: 1, sy: 1 }));
    expect(findObject(back, id)!.overrides.size).toBe(0);
    expect(updateGlyphOverrides(back, id, keys, (c) => c)).toBe(back);
    expect(updateGlyphOverrides(doc, 'missing', keys, (c) => ({ ...c, rot: 5 }))).toBe(doc);
  });

  it('несуществующей ячейке правка не достаётся', () => {
    const { doc, id } = setup();
    const next = updateGlyphOverrides(doc, id, [keyOf(5, 5)], (c) => ({ ...c, rot: 10 }));
    expect(next).toBe(doc);
  });
});

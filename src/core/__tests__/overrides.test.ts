import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import { createDocument } from '../document';
import { type CellKey, applyEdits, emptyGrid, keyOf } from '../grid';
import { addObject, createObject, findObject } from '../object';
import { effectiveOverride, updateGlyphOverrides } from '../overrides';

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

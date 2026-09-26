import { describe, expect, it } from 'vitest';
import { createAnimation } from '../animation';
import { makeCell } from '../cell';
import { createDocument } from '../document';
import { evaluate } from '../evaluate';
import { keyOf } from '../grid';
import {
  glyphAt,
  glyphQuad,
  glyphsInPolygon,
  glyphsInRect,
  placedGlyphs,
  similarGlyphs,
} from '../glyphPick';
import { addObject, createObject, findObject, transformObject, updateObject } from '../object';
import {
  applyLocalEdits,
  areaCellAt,
  areaCells,
  editArea,
  localEdits,
  neededShift,
  rebaseInDocument,
  rebaseObject,
} from '../objectEdit';
import { objectMatrices, objectMatrix } from '../placement';
import { setKey } from '../tracks';

/** Строка «ABC» в (5, 5), повёрнутая на 90° вокруг центра; у «C» правка — сдвиг вправо. */
function rotated() {
  let doc = createDocument({ width: 16, height: 16 });
  const layerId = doc.layers[0].id;
  const cells = new Map([
    [keyOf(0, 0), makeCell('A', '#ff0000')],
    [keyOf(1, 0), makeCell('B', '#ff0000')],
    [keyOf(2, 0), makeCell('C', '#00ff00')],
  ]);
  doc = addObject(doc, createObject({ name: 'o', id: 'o', layerId, x: 5, y: 5, cells }));
  doc = transformObject(doc, 'o', { rot: 90 });
  doc = updateObject(doc, 'o', { overrides: new Map([[keyOf(2, 0), { dx: 0.25 }]]) });
  const child = { ...createObject({ name: 'kid', id: 'kid', layerId, x: 1, y: 3 }), parentId: 'o' };
  return addObject(doc, child);
}

const centers = (doc: ReturnType<typeof rotated>) =>
  placedGlyphs(doc, findObject(doc, 'o')!, 0).map((g) => [
    +g.matrix.e.toFixed(6),
    +g.matrix.f.toFixed(6),
  ]);

describe('символы по их месту на экране', () => {
  it('повёрнутая строка встаёт столбцом, правка символа учтена', () => {
    const doc = rotated();
    // Опора — центр строки (1.5, 0.5): после поворота символы идут сверху вниз.
    expect(centers(doc)).toEqual([
      [6.5, 4.5],
      [6.5, 5.5],
      [6.5, 6.75],
    ]);
  });

  it('рамка и лассо ловят центры, а не клетки', () => {
    const placed = placedGlyphs(rotated(), findObject(rotated(), 'o')!, 0);
    expect(glyphsInRect(placed, { x: 6, y: 5, w: 1, h: 3 })).toEqual([keyOf(1, 0), keyOf(2, 0)]);
    // Гипотенуза x + y = 11.5: центр «A» (6.5, 4.5) внутри, «B» (6.5, 5.5) уже снаружи.
    const triangle = [
      { x: 4, y: 3 },
      { x: 8.5, y: 3 },
      { x: 4, y: 7.5 },
    ];
    expect(glyphsInPolygon(placed, triangle)).toEqual([keyOf(0, 0)]);
    expect(glyphAt(placed, { x: 6.9, y: 6.9 })).toBe(keyOf(2, 0));
    expect(glyphAt(placed, { x: 9, y: 9 })).toBeNull();
    expect(glyphQuad(placed[0].matrix)).toHaveLength(4);
  });

  it('палочка: смежно — только соседи того же цвета, иначе — все такие', () => {
    const obj = findObject(rotated(), 'o')!;
    const far = updateObject(rotated(), 'o', {
      cells: new Map([...obj.cells, [keyOf(5, 0), makeCell('A', '#ff0000')]]),
    });
    const wide = findObject(far, 'o')!;
    expect(similarGlyphs(wide, keyOf(0, 0), true)).toEqual([keyOf(0, 0)]);
    expect(similarGlyphs(wide, keyOf(0, 0), false)).toEqual([keyOf(0, 0), keyOf(5, 0)]);
  });
});

describe('правка объекта изнутри', () => {
  it('область правки — содержимое с полем, точка документа попадает в свою ячейку', () => {
    const doc = rotated();
    const obj = findObject(doc, 'o')!;
    const area = editArea(obj, 2);
    expect(area).toEqual({ offset: { x: 2, y: 2 }, width: 7, height: 5 });
    expect([...areaCells(obj, area).keys()]).toContain(keyOf(4, 2));
    // Центр «B» на экране — ячейка (1, 0) объекта, в области правки (3, 2).
    expect(areaCellAt(objectMatrix(doc, obj), area, { x: 6.5, y: 5.5 })).toEqual({ x: 3, y: 2 });
  });

  it('сдвиг начала ничего не двигает на экране: символы, правки, дети', () => {
    const doc = rotated();
    const moved = rebaseInDocument(doc, 'o', { x: 2, y: 1 });
    expect(centers(moved)).toEqual(centers(doc));
    const kid = (d: typeof doc) => objectMatrices(d).get('kid')!;
    expect(kid(moved).e).toBeCloseTo(kid(doc).e, 9);
    expect(kid(moved).f).toBeCloseTo(kid(doc).f, 9);
    expect(findObject(moved, 'o')!.cells.has(keyOf(2, 1))).toBe(true);
  });

  it('штрих левее начала сдвигает начало, новый символ встаёт под указатель', () => {
    const doc = rotated();
    const obj = findObject(doc, 'o')!;
    const area = editArea(obj);
    // Точка над «A» на экране: в повёрнутой строке это ячейка левее начала.
    const at = areaCellAt(objectMatrix(doc, obj), area, { x: 6.5, y: 3.5 })!;
    const edits = localEdits(area, new Map([[keyOf(at.x, at.y), makeCell('Z')]]));
    const shift = neededShift(edits)!;
    expect(shift).toEqual({ x: 1, y: 0 });
    const next = applyLocalEdits(rebaseInDocument(doc, 'o', shift), 'o', edits, shift);
    const placed = placedGlyphs(next, findObject(next, 'o')!, 0);
    expect(glyphAt(placed, { x: 6.5, y: 3.5 })).toBe(keyOf(0, 0));
    expect(findObject(next, 'o')!.cells.get(keyOf(0, 0))?.glyph).toBe('Z');
    // Прежние символы на своих местах; новый в списке ячеек — последним.
    expect(centers(next).slice(0, 3)).toEqual(centers(doc));
  });

  it('в анимации сдвиг идёт по всем ключам положения: объект не прыгает ни в какой момент', () => {
    const doc = rotated();
    const anim = createAnimation(doc);
    const target = { node: 'object', id: 'o', property: 'position' } as const;
    const tracks = setKey(setKey(anim.tracks, target, 0, [5, 5]), target, 1000, [9, 2]);
    const animated = { ...anim, tracks };
    const moved = rebaseObject(animated, 'o', { x: 3, y: 2 });
    for (const time of [0, 400, 1000]) {
      expect(centers(evaluate(moved, time))).toEqual(centers(evaluate(animated, time)));
    }
  });
});

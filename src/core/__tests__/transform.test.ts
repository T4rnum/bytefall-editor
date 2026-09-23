import { describe, expect, it } from 'vitest';
import { applyAffine } from '../affine';
import { makeCell } from '../cell';
import { applyEdits, emptyGrid, keyOf } from '../grid';
import {
  MAX_SCALE,
  MAX_SHIFT,
  MIN_SCALE,
  centerPivot,
  createTransform,
  glyphWorldMatrix,
  isPlainTransform,
  normalizeOverride,
  normalizeTransform,
  pruneOverrides,
  transformMatrix,
} from '../transform';

describe('Transform2D', () => {
  it('опора по умолчанию — центр содержимого, у пустого объекта — центр ячейки (0, 0)', () => {
    const cells = applyEdits(
      emptyGrid(),
      new Map([
        [keyOf(1, 0), makeCell('a')],
        [keyOf(4, 2), makeCell('b')],
      ]),
    );
    expect(centerPivot(cells)).toEqual({ x: 3, y: 1.5 });
    expect(centerPivot(emptyGrid())).toEqual({ x: 0.5, y: 0.5 });
  });

  it('нормализация держит формат: позиция целая, сдвиг и масштаб в пределах', () => {
    const t = normalizeTransform({
      ...createTransform(0, 0, { x: 0, y: 0 }),
      x: 2.6,
      dx: 9,
      dy: Number.NaN,
      sx: 0,
      sy: 1000,
    });
    expect(t).toMatchObject({ x: 3, dx: MAX_SHIFT, dy: 0, sx: MIN_SCALE, sy: MAX_SCALE });
  });

  it('двоичные хвосты сложения не попадают ни в инспектор, ни в файл', () => {
    const t = normalizeTransform({ ...createTransform(0, 0, { x: 0, y: 0 }), rot: 89.1 + 15 });
    expect(t.rot).toBe(104.1);
  });

  it('позиция — это позиция: без поворота ячейка (0, 0) объекта встаёт в домашнюю', () => {
    const t = createTransform(5, -3, { x: 2.5, y: 1.5 });
    expect(isPlainTransform(t)).toBe(true);
    expect(applyAffine(transformMatrix(t), 0, 0)).toEqual({ x: 5, y: -3 });
    const shifted = { ...t, dx: 0.5, dy: -0.25 };
    expect(isPlainTransform(shifted)).toBe(false);
    expect(applyAffine(transformMatrix(shifted), 0, 0)).toEqual({ x: 5.5, y: -3.25 });
  });

  it('поворот идёт вокруг опоры: опора остаётся на месте', () => {
    const t = { ...createTransform(10, 10, { x: 2, y: 1 }), rot: 73, sx: 1.7 };
    const p = applyAffine(transformMatrix(t), 2, 1);
    expect(p.x).toBeCloseTo(12);
    expect(p.y).toBeCloseTo(11);
  });
});

describe('GlyphOverride', () => {
  it('правка без изменений правкой не считается, лишние поля отбрасываются', () => {
    expect(normalizeOverride({})).toBeNull();
    expect(normalizeOverride({ rot: 360, sx: 1, dx: 0 })).toBeNull();
    expect(normalizeOverride({ rot: 45, sx: 1, dy: 5 })).toEqual({ rot: 45, dy: MAX_SHIFT });
  });

  it('символ крутится вокруг своего центра, а не вокруг опоры объекта', () => {
    const world = transformMatrix(createTransform(3, 2, { x: 0, y: 0 }));
    const plain = glyphWorldMatrix(world, keyOf(1, 0), undefined);
    expect(applyAffine(plain, 0, 0)).toEqual({ x: 4.5, y: 2.5 });
    const turned = glyphWorldMatrix(world, keyOf(1, 0), { rot: 90, sx: 2 });
    expect(applyAffine(turned, 0, 0)).toEqual({ x: 4.5, y: 2.5 });
    // Правый край символа ушёл вниз и удвоился.
    expect(applyAffine(turned, 0.5, 0)).toEqual({ x: 4.5, y: 3.5 });
  });

  it('правки стёртых ячеек уходят вместе с ними', () => {
    const cells = applyEdits(emptyGrid(), new Map([[keyOf(0, 0), makeCell('a')]]));
    const overrides = new Map([
      [keyOf(0, 0), { rot: 10 }],
      [keyOf(1, 0), { rot: 20 }],
    ]);
    expect([...pruneOverrides(overrides, cells).keys()]).toEqual([keyOf(0, 0)]);
    const kept = new Map([[keyOf(0, 0), { rot: 10 }]]);
    expect(pruneOverrides(kept, cells)).toBe(kept);
  });
});

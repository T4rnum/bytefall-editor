import { describe, expect, it } from 'vitest';
import { type Cell, makeCell } from '../cell';
import {
  cellsWithAttr,
  isValidAttrKey,
  removeAttrEdits,
  setAttrEdits,
  summarizeAttrs,
  summarizeLayerAttrs,
} from '../cellAttrs';
import { applyEdits, emptyGrid, getCell, keyOf } from '../grid';
import { selectionFromRect } from '../selection';
import { MAX_ATTRS_PER_CELL } from '../serialization';

/** Сетка 4×1: стена, стена с другим материалом, пустота, вода. */
function row() {
  const cells: [number, Cell][] = [
    [0, makeCell('#', '#ffffff', null, { wall: true, material: 'stone' })],
    [1, makeCell('#', '#ffffff', null, { wall: true, material: 'wood' })],
    [3, makeCell('~', '#0000ff', null, { water: 1 })],
  ];
  return applyEdits(emptyGrid(), new Map(cells.map(([x, cell]) => [keyOf(x, 0), cell])));
}

const all = selectionFromRect({ x: 0, y: 0, w: 4, h: 1 }, 4, 1)!;
const firstTwo = selectionFromRect({ x: 0, y: 0, w: 2, h: 1 }, 4, 1)!;

describe('summarizeAttrs', () => {
  it('сводит свойства: общее значение, «разные» и сколько ячеек', () => {
    const summary = summarizeAttrs(row(), all);
    expect(summary.cells).toBe(3);
    expect(summary.attrs).toEqual([
      { key: 'material', value: null, count: 2 },
      { key: 'wall', value: true, count: 2 },
      { key: 'water', value: 1, count: 1 },
    ]);
  });

  it('пустые ячейки выделения не считаются: свойства живут на ячейках', () => {
    const hole = selectionFromRect({ x: 2, y: 0, w: 1, h: 1 }, 4, 1)!;
    expect(summarizeAttrs(row(), hole)).toEqual({ cells: 0, attrs: [] });
  });

  it('обходит сетку, а не маску, когда ячеек меньше, и считает так же', () => {
    const big = selectionFromRect({ x: 0, y: 0, w: 4, h: 1 }, 4, 1)!;
    const sparse = applyEdits(
      emptyGrid(),
      new Map([[keyOf(3, 0), makeCell('x', '#ffffff', null, { a: 1 })]]),
    );
    expect(summarizeAttrs(sparse, big)).toEqual({
      cells: 1,
      attrs: [{ key: 'a', value: 1, count: 1 }],
    });
  });
});

describe('summarizeLayerAttrs', () => {
  it('сводит свойства всего слоя без всякого выделения', () => {
    const summary = summarizeLayerAttrs(row());
    expect(summary.cells).toBe(3);
    expect(summary.attrs.map((a) => [a.key, a.count])).toEqual([
      ['material', 2],
      ['wall', 2],
      ['water', 1],
    ]);
  });
});

describe('setAttrEdits', () => {
  it('ставит свойство всем непустым выделенным ячейкам, сохраняя остальные', () => {
    const { edits, skipped } = setAttrEdits(row(), firstTwo, 'solid', 'yes');
    expect(skipped).toBe(0);
    const next = applyEdits(row(), edits);
    expect(getCell(next, 0, 0)?.attrs).toEqual({ wall: true, material: 'stone', solid: 'yes' });
    expect(getCell(next, 1, 0)?.attrs).toEqual({ wall: true, material: 'wood', solid: 'yes' });
  });

  it('с onlyExisting меняет значение только там, где свойство уже есть', () => {
    const { edits } = setAttrEdits(row(), all, 'material', 'iron', true);
    expect([...edits.keys()].sort((a, b) => a - b)).toEqual([keyOf(0, 0), keyOf(1, 0)]);
  });

  it('не трогает ячейки, где значение уже такое', () => {
    const { edits } = setAttrEdits(row(), all, 'wall', true);
    expect(edits.size).toBe(1);
    expect(edits.has(keyOf(3, 0))).toBe(true);
  });

  it('пропускает ячейки с пределом свойств, а не урезает чужие', () => {
    const full: Record<string, number> = {};
    for (let i = 0; i < MAX_ATTRS_PER_CELL; i++) full[`k${i}`] = i;
    const grid = applyEdits(
      emptyGrid(),
      new Map([[keyOf(0, 0), makeCell('#', '#ffffff', null, full)]]),
    );
    const one = selectionFromRect({ x: 0, y: 0, w: 1, h: 1 }, 4, 1)!;
    expect(setAttrEdits(grid, one, 'extra', 1)).toMatchObject({ skipped: 1 });
    // Уже существующее свойство менять можно и на пределе.
    expect(setAttrEdits(grid, one, 'k0', 99).edits.size).toBe(1);
  });
});

describe('removeAttrEdits', () => {
  it('убирает свойство, а ячейку без свойств оставляет без поля attrs', () => {
    const next = applyEdits(row(), removeAttrEdits(row(), all, 'water'));
    expect(getCell(next, 3, 0)).toEqual({ glyph: '~', fg: '#0000ff', bg: null });
    expect(getCell(next, 0, 0)?.attrs).toEqual({ wall: true, material: 'stone' });
  });

  it('ячейки без свойства правок не получают', () => {
    expect(removeAttrEdits(row(), all, 'wall').size).toBe(2);
  });
});

describe('cellsWithAttr', () => {
  it('находит ячейки со свойством по всему слою', () => {
    expect(cellsWithAttr(row(), 'wall')).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
  });

  it('имена из прототипа объекта свойствами не считаются', () => {
    expect(cellsWithAttr(row(), 'toString')).toEqual([]);
    expect(cellsWithAttr(row(), 'constructor')).toEqual([]);
  });
});

describe('isValidAttrKey', () => {
  it('отвергает пустое, слишком длинное и __proto__', () => {
    expect(isValidAttrKey('wall')).toBe(true);
    expect(isValidAttrKey('')).toBe(false);
    expect(isValidAttrKey('x'.repeat(65))).toBe(false);
    expect(isValidAttrKey('__proto__')).toBe(false);
  });
});

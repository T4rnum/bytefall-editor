import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import type { Rect } from '../geometry';
import { applyEdits, editsFromPoints, emptyGrid, keyOf } from '../grid';
import {
  type Selection,
  clearSelectionEdits,
  clipEditsToSelection,
  combineSelection,
  copySelection,
  moveSelectionEdits,
  pasteEdits,
  selectionContains,
  selectionFromPoints,
  selectionCells,
  selectionFromRect,
  translateSelection,
} from '../selection';

/** Ключи выделенных ячеек: в тестах так нагляднее, чем сравнивать маски. */
const keysOf = (selection: Selection): number[] =>
  [...selectionCells(selection)].map((p) => keyOf(p.x, p.y));

const points = [
  { x: 1, y: 1 },
  { x: 2, y: 1 },
  { x: 5, y: 5 },
];
const grid = applyEdits(emptyGrid(), editsFromPoints(points, makeCell('#')));
const rectSel = (rect: Rect): Selection => selectionFromRect(rect, 8, 8)!;

describe('построение выделения', () => {
  it('габарит обтягивает ячейки, а не жест', () => {
    const sel = selectionFromPoints(points, 8, 8)!;
    expect(sel.bounds).toEqual({ x: 1, y: 1, w: 5, h: 5 });
    expect(sel.size).toBe(3);
  });

  it('пустое выделение не существует', () => {
    expect(selectionFromPoints([], 8, 8)).toBeNull();
    expect(selectionFromRect({ x: 20, y: 20, w: 4, h: 4 }, 8, 8)).toBeNull();
  });

  it('ячейки за холстом отбрасываются, а не ломают ключ', () => {
    const sel = selectionFromPoints(
      [
        { x: -5, y: -5 },
        { x: 0, y: 0 },
        { x: 99, y: 0 },
      ],
      8,
      8,
    )!;
    expect(sel.size).toBe(1);
    expect(sel.bounds).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('принадлежность проверяется по маске, а не по габариту', () => {
    const sel = selectionFromPoints(points, 8, 8)!;
    expect(selectionContains(sel, 1, 1)).toBe(true);
    // Внутри габарита, но не в маске.
    expect(selectionContains(sel, 3, 3)).toBe(false);
    expect(selectionContains(sel, -1, 0)).toBe(false);
  });
});

describe('combineSelection', () => {
  const a = rectSel({ x: 0, y: 0, w: 2, h: 1 });
  const b = rectSel({ x: 1, y: 0, w: 2, h: 1 });

  it('replace забывает прежнее выделение', () => {
    expect(combineSelection(a, b, 'replace')).toBe(b);
    expect(combineSelection(a, null, 'replace')).toBeNull();
  });

  it('add объединяет, subtract вычитает', () => {
    expect(combineSelection(a, b, 'add')!.size).toBe(3);
    const rest = combineSelection(a, b, 'subtract')!;
    expect(keysOf(rest)).toEqual([keyOf(0, 0)]);
    expect(rest.bounds).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('вычитание всего выделения снимает его целиком', () => {
    expect(combineSelection(a, a, 'subtract')).toBeNull();
  });

  it('без прежнего выделения add берёт новое, subtract не берёт ничего', () => {
    expect(combineSelection(null, b, 'add')).toBe(b);
    expect(combineSelection(null, b, 'subtract')).toBeNull();
  });
});

describe('copySelection / clearSelectionEdits', () => {
  it('копирует в локальные координаты и чистит только существующие ячейки', () => {
    const clip = copySelection(grid, rectSel({ x: 1, y: 1, w: 2, h: 2 }));
    expect(clip.width).toBe(2);
    expect([...clip.cells.keys()]).toEqual([keyOf(0, 0), keyOf(1, 0)]);
    const edits = clearSelectionEdits(grid, rectSel({ x: 0, y: 0, w: 3, h: 3 }));
    expect([...edits.entries()]).toEqual([
      [keyOf(1, 1), null],
      [keyOf(2, 1), null],
    ]);
  });

  it('произвольная форма копируется относительно своего габарита', () => {
    const sel = selectionFromPoints(
      [
        { x: 2, y: 1 },
        { x: 5, y: 5 },
      ],
      8,
      8,
    )!;
    const clip = copySelection(grid, sel);
    expect(clip.width).toBe(4);
    expect(clip.height).toBe(5);
    expect([...clip.cells.keys()]).toEqual([keyOf(0, 0), keyOf(3, 4)]);
  });
});

describe('pasteEdits / moveSelectionEdits', () => {
  it('вставляет со смещением и обрезает по холсту', () => {
    const clip = copySelection(grid, rectSel({ x: 1, y: 1, w: 2, h: 1 }));
    const edits = pasteEdits(clip, 7, 0, 8, 8);
    expect([...edits.keys()]).toEqual([keyOf(7, 0)]);
  });

  it('перенос чистит источник и пишет приёмник', () => {
    const sel = rectSel({ x: 1, y: 1, w: 2, h: 1 });
    const edits = moveSelectionEdits(grid, sel, 1, 0, 8, 8);
    expect(edits.get(keyOf(1, 1))).toBeNull();
    expect(edits.get(keyOf(2, 1))?.glyph).toBe('#');
    expect(edits.get(keyOf(3, 1))?.glyph).toBe('#');
    expect(moveSelectionEdits(grid, sel, 0, 0, 8, 8).size).toBe(0);
  });

  it('сдвиг теряет ячейки, уехавшие за холст', () => {
    const sel = rectSel({ x: 0, y: 0, w: 2, h: 1 });
    expect(translateSelection(sel, 7, 0, 8, 8)!.size).toBe(1);
    expect(translateSelection(sel, 20, 0, 8, 8)).toBeNull();
  });
});

describe('clipEditsToSelection', () => {
  const edits = editsFromPoints(
    [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 7, y: 7 },
    ],
    makeCell('#'),
  );

  it('оставляет только правки внутри выделения', () => {
    const kept = clipEditsToSelection(edits, rectSel({ x: 0, y: 0, w: 2, h: 2 }));
    expect([...kept.keys()]).toEqual([keyOf(0, 0), keyOf(1, 1)]);
  });

  it('за пределами выделения не остаётся ничего', () => {
    const kept = clipEditsToSelection(edits, rectSel({ x: 4, y: 4, w: 2, h: 2 }));
    expect(kept.size).toBe(0);
  });

  it('стирание обрезается так же, как рисование', () => {
    const erase = editsFromPoints(
      [
        { x: 0, y: 0 },
        { x: 7, y: 7 },
      ],
      null,
    );
    const kept = clipEditsToSelection(erase, rectSel({ x: 0, y: 0, w: 1, h: 1 }));
    expect([...kept.entries()]).toEqual([[keyOf(0, 0), null]]);
  });
});

import { describe, expect, it } from 'vitest';
import { makeCell } from '../../../core/cell';
import { type Document, createDocument, setLayerCells } from '../../../core/document';
import { applyEdits, editsFromPoints, emptyGrid, keyOf } from '../../../core/grid';
import { type Selection, selectionCells, selectionFromPoints } from '../../../core/selection';
import { createLassoTool, createSelectTool, createWandTool } from '../selectTool';
import { at, makeToolEnv } from './testEnv';

const blank = () => createDocument({ width: 8, height: 8 });

/** Холст с красной полосой в верхнем ряду, зелёной ячейкой на ней и красной ячейкой в стороне. */
function painted(): Document {
  const doc = blank();
  const red = applyEdits(
    emptyGrid(),
    editsFromPoints(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 5, y: 5 },
      ],
      makeCell('#', '#ff0000'),
    ),
  );
  const grid = applyEdits(red, editsFromPoints([{ x: 1, y: 0 }], makeCell('#', '#00ff00')));
  return setLayerCells(doc, doc.layers[0].id, grid);
}

const last = (list: (Selection | null)[]): Selection | null =>
  list.length > 0 ? list[list.length - 1] : null;

const sel = (points: { x: number; y: number }[]): Selection => selectionFromPoints(points, 8, 8)!;

/** Ключи выделенных ячеек: в тестах так нагляднее, чем сравнивать маски. */
const keysOf = (selection: Selection): number[] =>
  [...selectionCells(selection)].map((p) => keyOf(p.x, p.y));

describe('прямоугольное выделение', () => {
  it('тянется от нажатия до отпускания', () => {
    const { env, calls } = makeToolEnv(blank());
    const tool = createSelectTool();
    tool.onPointerDown?.(env, at(1, 1));
    tool.onPointerMove?.(env, at(3, 2));
    tool.onPointerUp?.(env, at(3, 2));
    const result = last(calls.selections)!;
    expect(result.bounds).toEqual({ x: 1, y: 1, w: 3, h: 2 });
    expect(result.size).toBe(6);
  });

  it('обрезается по холсту', () => {
    const { env, calls } = makeToolEnv(blank());
    const tool = createSelectTool();
    tool.onPointerDown?.(env, at(6, 6));
    tool.onPointerMove?.(env, at(20, 20));
    tool.onPointerUp?.(env, at(20, 20));
    expect(last(calls.selections)!.bounds).toEqual({ x: 6, y: 6, w: 2, h: 2 });
  });

  it('щелчок без движения снимает выделение', () => {
    const { env, calls } = makeToolEnv(blank(), { selection: sel([{ x: 0, y: 0 }]) });
    const tool = createSelectTool();
    tool.onPointerDown?.(env, at(4, 4));
    tool.onPointerUp?.(env, at(4, 4));
    expect(last(calls.selections)).toBeNull();
  });

  it('Shift добавляет к прежнему выделению, Alt вычитает', () => {
    const base = sel([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const added = makeToolEnv(blank(), { selection: base });
    const tool = createSelectTool();
    tool.onPointerDown?.(added.env, at(3, 0, 0, true));
    tool.onPointerMove?.(added.env, at(4, 0, 0, true));
    tool.onPointerUp?.(added.env, at(4, 0, 0, true));
    expect(last(added.calls.selections)!.size).toBe(4);

    const cut = makeToolEnv(blank(), { selection: base });
    tool.onPointerDown?.(cut.env, at(1, 0, 0, false, true));
    tool.onPointerUp?.(cut.env, at(1, 0, 0, false, true));
    expect(keysOf(last(cut.calls.selections)!)).toEqual([keyOf(0, 0)]);
  });

  it('перетаскивание внутри выделения переносит ячейки одной записью истории', () => {
    const { env, calls } = makeToolEnv(painted(), { selection: sel([{ x: 0, y: 0 }]) });
    const tool = createSelectTool();
    tool.onPointerDown?.(env, at(0, 0));
    tool.onPointerMove?.(env, at(2, 2));
    expect(calls.previews.length).toBeGreaterThan(0);
    tool.onPointerUp?.(env, at(2, 2));
    expect(calls.commits).toHaveLength(1);
    expect(calls.commits[0].label).toBe('Move selection');
    expect(calls.commits[0].edits.get(keyOf(0, 0))).toBeNull();
    expect(calls.commits[0].edits.get(keyOf(2, 2))?.fg).toBe('#ff0000');
    expect(last(calls.selections)!.bounds).toEqual({ x: 2, y: 2, w: 1, h: 1 });
  });

  it('Shift внутри выделения начинает новое, а не переносит', () => {
    const { env, calls } = makeToolEnv(painted(), { selection: sel([{ x: 0, y: 0 }]) });
    const tool = createSelectTool();
    tool.onPointerDown?.(env, at(0, 0, 0, true));
    tool.onPointerMove?.(env, at(1, 1, 0, true));
    tool.onPointerUp?.(env, at(1, 1, 0, true));
    expect(calls.commits).toHaveLength(0);
    expect(last(calls.selections)!.size).toBe(4);
  });
});

describe('лассо', () => {
  it('во время жеста подсвечивает обводку, на отпускании заливает её', () => {
    const { env, calls } = makeToolEnv(blank());
    const tool = createLassoTool();
    tool.onPointerDown?.(env, at(1, 1));
    tool.onPointerMove?.(env, at(3, 1));
    tool.onPointerMove?.(env, at(3, 3));
    const duringGesture = last(calls.selections)!;
    tool.onPointerMove?.(env, at(1, 3));
    tool.onPointerUp?.(env, at(1, 3));
    const filled = last(calls.selections)!;
    expect(duringGesture.size).toBeLessThan(filled.size);
    expect(filled.bounds).toEqual({ x: 1, y: 1, w: 3, h: 3 });
    expect(filled.size).toBe(9);
  });

  it('щелчок без обводки снимает выделение', () => {
    const { env, calls } = makeToolEnv(blank(), { selection: sel([{ x: 0, y: 0 }]) });
    const tool = createLassoTool();
    tool.onPointerDown?.(env, at(4, 4));
    tool.onPointerUp?.(env, at(4, 4));
    expect(last(calls.selections)).toBeNull();
  });

  it('отмена жеста возвращает прежнее выделение', () => {
    const base = sel([{ x: 0, y: 0 }]);
    const { env, calls } = makeToolEnv(blank(), { selection: base });
    const tool = createLassoTool();
    tool.onPointerDown?.(env, at(4, 4));
    tool.onPointerMove?.(env, at(6, 6));
    tool.cancel?.(env);
    expect(last(calls.selections)).toBe(base);
  });
});

describe('волшебная палочка', () => {
  it('в смежном режиме берёт связную область одного вида', () => {
    const { env, calls } = makeToolEnv(painted(), { wandContiguous: true });
    const tool = createWandTool();
    tool.onPointerDown?.(env, at(0, 0));
    tool.onPointerUp?.(env, at(0, 0));
    expect(keysOf(last(calls.selections)!)).toEqual([keyOf(0, 0)]);
  });

  it('в несмежном режиме собирает похожие ячейки по всему слою', () => {
    const { env, calls } = makeToolEnv(painted(), { wandContiguous: false });
    const tool = createWandTool();
    tool.onPointerDown?.(env, at(0, 0));
    tool.onPointerUp?.(env, at(0, 0));
    expect(keysOf(last(calls.selections)!)).toEqual([keyOf(0, 0), keyOf(2, 0), keyOf(5, 5)]);
  });

  it('щелчок по пустоте выделяет фон, а не снимает выделение', () => {
    const { env, calls } = makeToolEnv(painted(), { wandContiguous: true });
    const tool = createWandTool();
    tool.onPointerDown?.(env, at(4, 4));
    tool.onPointerUp?.(env, at(4, 4));
    const result = last(calls.selections)!;
    expect(result).not.toBeNull();
    expect(result.size).toBe(60);
  });

  it('Shift добавляет вторую область к первой', () => {
    const base = sel([{ x: 1, y: 0 }]);
    const { env, calls } = makeToolEnv(painted(), { wandContiguous: true, selection: base });
    const tool = createWandTool();
    tool.onPointerDown?.(env, at(0, 0, 0, true));
    tool.onPointerUp?.(env, at(0, 0, 0, true));
    expect(keysOf(last(calls.selections)!).sort((a, b) => a - b)).toEqual([
      keyOf(0, 0),
      keyOf(1, 0),
    ]);
  });

  it('по запертому слою не выделяет ничего', () => {
    const { env, calls } = makeToolEnv(painted(), { layer: null });
    const tool = createWandTool();
    tool.onPointerDown?.(env, at(0, 0));
    tool.onPointerUp?.(env, at(0, 0));
    expect(last(calls.selections)).toBeNull();
  });
});

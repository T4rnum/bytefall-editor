import { describe, expect, it } from 'vitest';
import { type Cell, makeCell } from '../../../core/cell';
import { createDocument } from '../../../core/document';
import { type CellEdits, applyEdits, keyOf, yOf } from '../../../core/grid';
import {
  createEllipseTool,
  createEyedropperTool,
  createFillTool,
  createLineTool,
  createRectTool,
  createStrokeTool,
} from '../drawingTools';
import { at, lastPreview, makeToolEnv } from './testEnv';

const PRIMARY = makeCell('#', '#ff0000');
const SECONDARY = makeCell('@', '#00ff00', '#000080');
const BOTH: readonly [Cell | null, Cell | null] = [PRIMARY, SECONDARY];

const doc = () => createDocument({ width: 8, height: 8 });
const cellAt = (edits: CellEdits, x: number, y: number) => edits.get(keyOf(x, y));

describe('карандаш: у каждой кнопки своя кисть', () => {
  it('левая кнопка рисует первой кистью, правая — второй', () => {
    for (const [button, expected] of [
      [0, PRIMARY],
      [2, SECONDARY],
    ] as const) {
      const { env, calls } = makeToolEnv(doc(), { brushes: BOTH });
      const tool = createStrokeTool('pencil', 'Pencil', 'p');
      tool.onPointerDown?.(env, at(1, 1, button));
      tool.onPointerUp?.(env, at(1, 1, button));
      expect(cellAt(calls.commits[0].edits, 1, 1)).toEqual(expected);
    }
  });

  it('пустая вторая кисть стирает: так правая кнопка заведена по умолчанию', () => {
    const { env, calls } = makeToolEnv(doc());
    const tool = createStrokeTool('pencil', 'Pencil', 'p');
    tool.onPointerDown?.(env, at(1, 1, 2));
    tool.onPointerUp?.(env, at(1, 1, 2));
    expect(cellAt(calls.commits[0].edits, 1, 1)).toBeNull();
  });

  it('ластик стирает обеими кнопками, какой бы ни была кисть', () => {
    const { env, calls } = makeToolEnv(doc(), { brushes: BOTH });
    const tool = createStrokeTool('eraser', 'Eraser', 'e');
    tool.onPointerDown?.(env, at(1, 1, 0));
    tool.onPointerUp?.(env, at(1, 1, 0));
    expect(cellAt(calls.commits[0].edits, 1, 1)).toBeNull();
  });

  it('ведёт непрерывную линию между событиями указателя и коммитит один раз', () => {
    const { env, calls } = makeToolEnv(doc(), { brushes: BOTH });
    const tool = createStrokeTool('pencil', 'Pencil', 'p');
    tool.onPointerDown?.(env, at(0, 0));
    tool.onPointerMove?.(env, at(3, 0));
    const preview = lastPreview(calls);
    expect([...(preview?.keys() ?? [])]).toHaveLength(4);
    tool.onPointerUp?.(env, at(3, 0));
    expect(calls.commits).toHaveLength(1);
    expect(calls.previews[calls.previews.length - 1]).toBeNull();
  });

  it('не рисует по запертому слою', () => {
    const { env, calls } = makeToolEnv(doc(), { layer: null, brushes: BOTH });
    const tool = createStrokeTool('pencil', 'Pencil', 'p');
    tool.onPointerDown?.(env, at(1, 1));
    tool.onPointerUp?.(env, at(1, 1));
    expect(calls.commits).toHaveLength(0);
  });

  it('за пределы холста не пишет', () => {
    const { env, calls } = makeToolEnv(doc(), { brushes: BOTH });
    const tool = createStrokeTool('pencil', 'Pencil', 'p');
    tool.onPointerDown?.(env, at(0, 0));
    tool.onPointerMove?.(env, at(20, 0));
    tool.onPointerUp?.(env, at(20, 0));
    expect([...calls.commits[0].edits.keys()]).toHaveLength(8);
  });
});

describe('фигуры', () => {
  it('прямоугольник правой кнопкой ставит вторую кисть', () => {
    const { env, calls } = makeToolEnv(doc(), { brushes: BOTH });
    const tool = createRectTool();
    tool.onPointerDown?.(env, at(1, 1, 2));
    tool.onPointerMove?.(env, at(3, 3, 2));
    tool.onPointerUp?.(env, at(3, 3, 2));
    expect(cellAt(calls.commits[0].edits, 1, 1)).toEqual(SECONDARY);
    expect(cellAt(calls.commits[0].edits, 2, 2)).toBeUndefined();
  });

  it('Shift превращает прямоугольник в квадрат', () => {
    const { env, calls } = makeToolEnv(doc(), { brushes: BOTH });
    const tool = createRectTool();
    tool.onPointerDown?.(env, at(0, 0));
    tool.onPointerMove?.(env, at(4, 1, 0, true));
    const preview = lastPreview(calls);
    expect(cellAt(preview!, 4, 4)).toEqual(PRIMARY);
  });

  it('заливка фигур берётся из окружения', () => {
    const { env, calls } = makeToolEnv(doc(), { brushes: BOTH, shapeFill: true });
    const tool = createRectTool();
    tool.onPointerDown?.(env, at(1, 1));
    tool.onPointerMove?.(env, at(3, 3));
    expect(cellAt(lastPreview(calls)!, 2, 2)).toEqual(PRIMARY);
  });

  it('линия по Shift прижимается к горизонтали', () => {
    const { env, calls } = makeToolEnv(doc(), { brushes: BOTH });
    const tool = createLineTool();
    tool.onPointerDown?.(env, at(0, 0));
    tool.onPointerMove?.(env, at(5, 1, 0, true));
    const preview = lastPreview(calls);
    expect([...preview!.keys()].every((k) => yOf(k) === 0)).toBe(true);
  });

  it('эллипс отменяется без записи в историю', () => {
    const { env, calls } = makeToolEnv(doc(), { brushes: BOTH });
    const tool = createEllipseTool();
    tool.onPointerDown?.(env, at(1, 1));
    tool.onPointerMove?.(env, at(5, 5));
    tool.cancel?.(env);
    tool.onPointerUp?.(env, at(5, 5));
    expect(calls.commits).toHaveLength(0);
  });
});

describe('заливка и пипетка', () => {
  it('заливает область кистью нажатой кнопки', () => {
    const { env, calls } = makeToolEnv(doc(), { brushes: BOTH });
    createFillTool().onPointerDown?.(env, at(0, 0, 2));
    expect(calls.commits[0].label).toBe('Fill');
    expect(cellAt(calls.commits[0].edits, 7, 7)).toEqual(SECONDARY);
  });

  it('не заливает за пределами холста', () => {
    const { env, calls } = makeToolEnv(doc(), { brushes: BOTH });
    createFillTool().onPointerDown?.(env, at(9, 9));
    expect(calls.commits).toHaveLength(0);
  });

  it('пипетка сообщает кнопку, чтобы правка ушла в её же кисть', () => {
    const base = doc();
    const filled = {
      ...base,
      layers: [
        {
          ...base.layers[0],
          cells: applyEdits(base.layers[0].cells, new Map([[keyOf(2, 2), SECONDARY]])),
        },
        ...base.layers.slice(1),
      ],
    };
    const { env, calls } = makeToolEnv(filled, { brushes: BOTH });
    createEyedropperTool().onPointerDown?.(env, at(2, 2, 2));
    expect(calls.picks).toEqual([{ cell: SECONDARY, button: 2 }]);
  });
});

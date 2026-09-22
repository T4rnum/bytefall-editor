import type { Cell } from '../../core/cell';
import { floodFill } from '../../core/fill';
import { type Point, inBounds } from '../../core/geometry';
import { type CellEdits, type CellKey, editsFromPoints, keyOf } from '../../core/grid';
import { topCellAt } from '../../core/object';
import { ellipsePoints, linePoints, rectPoints } from '../../core/shapes';
import type { PointerInfo, Tool, ToolEnv, ToolId } from './types';

const signOr1 = (v: number): number => (v < 0 ? -1 : 1);

/** Shift для фигур: квадрат или круг вокруг якоря. */
function constrainSquare(anchor: Point, cell: Point): Point {
  const dx = cell.x - anchor.x;
  const dy = cell.y - anchor.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: anchor.x + signOr1(dx) * size, y: anchor.y + signOr1(dy) * size };
}

/** Shift для линии: привязка к 0°, 45° и 90°. */
function snapLine(anchor: Point, cell: Point): Point {
  const dx = cell.x - anchor.x;
  const dy = cell.y - anchor.y;
  if (Math.abs(dx) > 2 * Math.abs(dy)) return { x: cell.x, y: anchor.y };
  if (Math.abs(dy) > 2 * Math.abs(dx)) return { x: anchor.x, y: cell.y };
  return constrainSquare(anchor, cell);
}

const inDoc = (env: ToolEnv, p: Point): boolean =>
  inBounds(p.x, p.y, env.doc.width, env.doc.height);

/** Карандаш и ластик: непрерывный штрих, у каждой кнопки мыши своя кисть. */
export function createStrokeTool(id: 'pencil' | 'eraser', label: string, hotkey: string): Tool {
  let last: Point | null = null;
  let edits: Map<CellKey, Cell | null> | null = null;
  let value: Cell | null = null;

  const addPoints = (env: ToolEnv, points: Iterable<Point>): void => {
    if (!edits) return;
    for (const p of points) if (inDoc(env, p)) edits.set(keyOf(p.x, p.y), value);
    env.setPreview(new Map(edits));
  };

  return {
    id,
    label,
    hotkey,
    cursor: 'crosshair',
    onPointerDown(env, info) {
      if (!env.layer) return;
      value = id === 'eraser' ? null : env.brushFor(info.button);
      edits = new Map();
      last = info.cell;
      addPoints(env, [info.cell]);
    },
    onPointerMove(env, info) {
      if (!edits || !last) return;
      addPoints(env, linePoints(last.x, last.y, info.cell.x, info.cell.y));
      last = info.cell;
    },
    onPointerUp(env) {
      if (edits && edits.size > 0) env.commit(edits, label);
      edits = null;
      last = null;
      env.setPreview(null);
    },
    cancel(env) {
      edits = null;
      last = null;
      env.setPreview(null);
    },
  };
}

type ShapeFn = (a: Point, b: Point, filled: boolean) => Point[];

function createShapeTool(
  id: ToolId,
  label: string,
  hotkey: string,
  shape: ShapeFn,
  constrain: (anchor: Point, cell: Point) => Point,
  fillable: boolean,
): Tool {
  let anchor: Point | null = null;
  let value: Cell | null = null;
  let current: CellEdits | null = null;

  const update = (env: ToolEnv, info: PointerInfo): void => {
    if (!anchor) return;
    const end = info.shift ? constrain(anchor, info.cell) : info.cell;
    const points = shape(anchor, end, fillable && env.shapeFill).filter((p) => inDoc(env, p));
    current = editsFromPoints(points, value);
    env.setPreview(current);
  };

  return {
    id,
    label,
    hotkey,
    cursor: 'crosshair',
    onPointerDown(env, info) {
      if (!env.layer) return;
      anchor = info.cell;
      value = env.brushFor(info.button);
      update(env, info);
    },
    onPointerMove(env, info) {
      update(env, info);
    },
    onPointerUp(env) {
      if (current && current.size > 0) env.commit(current, label);
      anchor = null;
      current = null;
      env.setPreview(null);
    },
    cancel(env) {
      anchor = null;
      current = null;
      env.setPreview(null);
    },
  };
}

export const createLineTool = (): Tool =>
  createShapeTool('line', 'Line', 'l', (a, b) => linePoints(a.x, a.y, b.x, b.y), snapLine, false);

export const createRectTool = (): Tool =>
  createShapeTool('rect', 'Rectangle', 'r', rectPoints, constrainSquare, true);

export const createEllipseTool = (): Tool =>
  createShapeTool('ellipse', 'Ellipse', 'o', ellipsePoints, constrainSquare, true);

export function createFillTool(): Tool {
  return {
    id: 'fill',
    label: 'Fill',
    hotkey: 'f',
    cursor: 'crosshair',
    onPointerDown(env, info) {
      if (!env.layer || !inDoc(env, info.cell)) return;
      const { width, height } = env.doc;
      const points = floodFill(env.layer.cells, width, height, info.cell.x, info.cell.y);
      env.commit(editsFromPoints(points, env.brushFor(info.button)), 'Fill');
    },
  };
}

/** Пипетка берёт верхнюю видимую ячейку под курсором, независимо от активного слоя. */
export function createEyedropperTool(): Tool {
  return {
    id: 'eyedropper',
    label: 'Eyedropper',
    hotkey: 'i',
    cursor: 'copy',
    onPointerDown(env, info) {
      pickAt(env, info.cell, info.button);
    },
  };
}

/** Пипетка видит и объекты, и растры: берётся верхняя видимая ячейка. */
export function pickAt(env: ToolEnv, cell: Point, button = 0): void {
  const found = topCellAt(env.doc, cell.x, cell.y);
  if (found) env.pick(found, button);
}

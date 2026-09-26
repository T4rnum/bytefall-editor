import { type Affine, applyAffine, invertAffine } from './affine';
import { type Animation, mapFrames } from './animation';
import type { Cell } from './cell';
import { isBlankCell } from './cell';
import type { NodeGraph } from './graph/types';
import type { Document } from './document';
import type { Point } from './geometry';
import { type CellEdits, type CellGrid, type CellKey, gridBounds, keyOf, xOf, yOf } from './grid';
import { type SceneObject, findObject, updateObject } from './object';
import type { SkinBone } from './skin';
import { shiftPositionKeys } from './tracks';

/**
 * Правка объекта изнутри (ROADMAP, слой 10): инструменты рисуют в сетке объекта, в том числе
 * повёрнутого. Ключи ячеек неотрицательные, а рисовать хочется и левее начала объекта, поэтому
 * инструменту даётся своя сетка — «область правки»: содержимое объекта с полем вокруг, сдвинутое
 * так, чтобы область начиналась с нуля. Правки из неё переводятся обратно в сетку объекта, и если
 * штрих ушёл левее или выше начала, начало объекта переезжает (`rebaseObject`).
 */

/** Поле вокруг содержимого, в котором можно рисовать, в ячейках объекта. */
export const EDIT_MARGIN = 8;

/** Область правки: ячейка инструмента = ячейка объекта + `offset`. */
export interface EditArea {
  readonly offset: Point;
  readonly width: number;
  readonly height: number;
}

export function editArea(obj: SceneObject, margin = EDIT_MARGIN): EditArea {
  const b = gridBounds(obj.cells) ?? { x: 0, y: 0, w: 0, h: 0 };
  return {
    offset: { x: margin - b.x, y: margin - b.y },
    width: b.w + 2 * margin,
    height: b.h + 2 * margin,
  };
}

/** Ячейки объекта в сетке области правки. */
export function areaCells(obj: SceneObject, area: EditArea): CellGrid {
  const out = new Map<CellKey, Cell>();
  for (const [key, cell] of obj.cells) {
    out.set(keyOf(xOf(key) + area.offset.x, yOf(key) + area.offset.y), cell);
  }
  return out;
}

/**
 * Ячейка области правки под точкой документа: по матрице объекта без правок символов — это его
 * сетка покоя, в ней и рисуют.
 */
export function areaCellAt(world: Affine, area: EditArea, point: Point): Point | null {
  const inverse = invertAffine(world);
  if (!inverse) return null;
  const local = applyAffine(inverse, point.x, point.y);
  return { x: Math.floor(local.x) + area.offset.x, y: Math.floor(local.y) + area.offset.y };
}

/** Ячейка области правки в сетку объекта; может оказаться левее или выше начала. */
export const areaToLocal = (area: EditArea, key: CellKey): Point => ({
  x: xOf(key) - area.offset.x,
  y: yOf(key) - area.offset.y,
});

/** Ячейка объекта в сетку области правки. */
export const localToArea = (area: EditArea, key: CellKey): CellKey =>
  keyOf(xOf(key) + area.offset.x, yOf(key) + area.offset.y);

/** Правка в локальных координатах объекта: они бывают отрицательными, ключ — нет. */
export interface LocalEdit {
  readonly x: number;
  readonly y: number;
  readonly cell: Cell | null;
}

export function localEdits(area: EditArea, edits: CellEdits): LocalEdit[] {
  return [...edits].map(([key, cell]) => ({ ...areaToLocal(area, key), cell }));
}

/** На сколько сдвинуть начало объекта, чтобы все правки легли в неотрицательные ключи. */
export function neededShift(edits: readonly LocalEdit[]): Point | null {
  let x = 0;
  let y = 0;
  for (const e of edits) {
    if (e.cell === null || isBlankCell(e.cell)) continue;
    x = Math.max(x, -e.x);
    y = Math.max(y, -e.y);
  }
  return x === 0 && y === 0 ? null : { x, y };
}

/**
 * Правки в ячейки объекта. Стёртая ячейка уносит и правку своего символа. Ячейки левее или выше
 * начала без сдвига не ложатся: сначала `rebaseObject`, и правки сдвигаются вместе с ним.
 */
export function applyLocalEdits(
  doc: Document,
  id: string,
  edits: readonly LocalEdit[],
  shift: Point = { x: 0, y: 0 },
): Document {
  const obj = findObject(doc, id);
  if (!obj) return doc;
  const cells = new Map(obj.cells);
  const overrides = new Map(obj.overrides);
  for (const e of edits) {
    const x = e.x + shift.x;
    const y = e.y + shift.y;
    if (x < 0 || y < 0) continue;
    const key = keyOf(x, y);
    if (e.cell === null || isBlankCell(e.cell)) {
      cells.delete(key);
      overrides.delete(key);
    } else {
      cells.set(key, e.cell);
    }
  }
  return updateObject(doc, id, { cells, overrides });
}

const shiftKeys = <T>(map: ReadonlyMap<CellKey, T>, s: Point): Map<CellKey, T> =>
  new Map([...map].map(([key, value]) => [keyOf(xOf(key) + s.x, yOf(key) + s.y), value]));

/** Скиннинг привязан к костям в координатах объекта: привязка едет вместе с сеткой. */
function shiftBones(graph: NodeGraph | null, s: Point): NodeGraph | null {
  if (!graph) return graph;
  const nodes = graph.nodes.map((n) => {
    if (n.kind !== 'bones') return n;
    const bones = ((n.options.bones as readonly SkinBone[] | undefined) ?? []).map((b) => ({
      ...b,
      bind: { ...b.bind, e: b.bind.e + s.x, f: b.bind.f + s.y },
    }));
    return { ...n, options: { ...n.options, bones } };
  });
  return { ...graph, nodes };
}

/**
 * Сдвигает начало объекта на `s` ячеек его сетки так, что на экране ничего не двигается: ячейки,
 * правки символов и опора уезжают на `s`, положение — на `-s`, дети — на `s` в сетке родителя.
 * Положение уходит целым числом, поэтому остаётся домашней ячейкой (DESIGN.md, раздел 2).
 */
export function rebaseInDocument(doc: Document, id: string, s: Point): Document {
  const obj = findObject(doc, id);
  if (!obj || (s.x === 0 && s.y === 0)) return doc;
  const t = obj.transform;
  let next = updateObject(doc, id, {
    cells: shiftKeys(obj.cells, s),
    overrides: shiftKeys(obj.overrides, s),
    graph: shiftBones(obj.graph, s),
    transform: { ...t, x: t.x - s.x, y: t.y - s.y, px: t.px + s.x, py: t.py + s.y },
  });
  for (const child of doc.objects) {
    if (child.parentId !== id) continue;
    const c = child.transform;
    next = updateObject(next, child.id, { transform: { ...c, x: c.x + s.x, y: c.y + s.y } });
  }
  return next;
}

/** То же для всей анимации: во всех кадрах, где объект есть, и в ключах положения. */
export function rebaseObject(anim: Animation, id: string, s: Point): Animation {
  const children = new Set<string>();
  const frames = mapFrames(anim, (doc) => {
    for (const o of doc.objects) if (o.parentId === id) children.add(o.id);
    return rebaseInDocument(doc, id, s);
  });
  let tracks = shiftPositionKeys(frames.tracks, new Set([id]), -s.x, -s.y);
  tracks = shiftPositionKeys(tracks, children, s.x, s.y);
  return { ...frames, tracks };
}

/** Сдвиг начала, без которого перенос символов на `d` увёл бы их в отрицательные ключи. */
export function moveShift(keys: readonly CellKey[], d: Point): Point | null {
  let x = 0;
  let y = 0;
  for (const key of keys) {
    x = Math.max(x, -(xOf(key) + d.x));
    y = Math.max(y, -(yOf(key) + d.y));
  }
  return x === 0 && y === 0 ? null : { x, y };
}

/**
 * Переносит символы по сетке объекта на `d` вместе с их правками; то, что лежало на месте
 * переноса, заменяется. `keys` — до сдвига начала `shift`: документ приходит уже сдвинутым.
 */
export function moveGlyphs(
  doc: Document,
  id: string,
  keys: readonly CellKey[],
  d: Point,
  shift: Point = { x: 0, y: 0 },
): Document {
  const obj = findObject(doc, id);
  if (!obj || keys.length === 0 || (d.x === 0 && d.y === 0)) return doc;
  const cells = new Map(obj.cells);
  const overrides = new Map(obj.overrides);
  const moving = keys
    .map((key) => keyOf(xOf(key) + shift.x, yOf(key) + shift.y))
    .filter((key) => obj.cells.has(key))
    .map((key) => ({ key, cell: obj.cells.get(key) as Cell, override: obj.overrides.get(key) }));
  for (const { key } of moving) {
    cells.delete(key);
    overrides.delete(key);
  }
  for (const { key, cell, override } of moving) {
    const to = keyOf(xOf(key) + d.x, yOf(key) + d.y);
    cells.set(to, cell);
    if (override) overrides.set(to, override);
    else overrides.delete(to);
  }
  return updateObject(doc, id, { cells, overrides });
}

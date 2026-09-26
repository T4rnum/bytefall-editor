import { describe, expect, it } from 'vitest';
import { makeCell } from '../../../core/cell';
import { createDocument } from '../../../core/document';
import { applyEdits, emptyGrid, keyOf } from '../../../core/grid';
import { addObject, createObject, findObject } from '../../../core/object';
import { objectMatrix } from '../../../core/placement';
import { gizmoLayout } from '../gizmo';
import { createObjectTool } from '../objectTool';
import { at, atPoint, makeToolEnv } from './testEnv';

/** Три объекта по символу: a в (1,1), b в (4,1), c — ребёнок b в (4,3). */
function setup() {
  let doc = createDocument({ width: 12, height: 8 });
  const layerId = doc.layers[0].id;
  const cells = applyEdits(emptyGrid(), new Map([[keyOf(0, 0), makeCell('#')]]));
  const make = (id: string, x: number, y: number, parentId: string | null = null) => ({
    ...createObject({ name: id, id, layerId, x, y, cells }),
    parentId,
  });
  doc = addObject(doc, make('a', 1, 1));
  doc = addObject(doc, make('b', 4, 1));
  doc = addObject(doc, make('c', 4, 3, 'b'));
  return doc;
}

const pos = (doc: ReturnType<typeof setup>, id: string) => {
  const t = findObject(doc, id)?.transform;
  return { x: t?.x, y: t?.y };
};

describe('инструмент объектов с группой', () => {
  it('Ctrl и Shift по объекту добавляют его к выбору и убирают, ничего не двигая', () => {
    const { env, calls } = makeToolEnv(setup(), { selectedObjectId: 'a' });
    const tool = createObjectTool();
    tool.onPointerDown?.(env, atPoint(4.5, 1.5, { ctrl: true }));
    tool.onPointerDown?.(env, atPoint(1.5, 1.5, { shift: true }));
    expect(calls.selectedMany).toEqual([['a', 'b'], []]);
    expect(calls.draft).toBeNull();
  });

  it('перенос объекта из группы везёт всю группу, потомок выбранного — один раз', () => {
    const doc = setup();
    const { env, calls } = makeToolEnv(doc, {
      selectedObjectId: 'a',
      selectedObjectIds: ['b', 'c', 'a'],
    });
    const tool = createObjectTool();
    tool.onPointerDown?.(env, at(1, 1));
    tool.onPointerMove?.(env, at(2, 3));
    tool.onPointerUp?.(env, at(2, 3));
    expect(calls.selected).toEqual([]);
    const moved = calls.docCommits[0].doc;
    expect(pos(moved, 'a')).toEqual({ x: 2, y: 3 });
    expect(pos(moved, 'b')).toEqual({ x: 5, y: 3 });
    // c едет за родителем b: его собственный трансформ относительно родителя не меняется.
    expect(findObject(moved, 'c')?.transform).toEqual(findObject(doc, 'c')?.transform);
  });

  it('щелчок по объекту группы без переноса оставляет выбранным его одного', () => {
    const { env, calls } = makeToolEnv(setup(), {
      selectedObjectId: 'a',
      selectedObjectIds: ['b', 'a'],
    });
    const tool = createObjectTool();
    tool.onPointerDown?.(env, at(4, 1));
    tool.onPointerUp?.(env, at(4, 1));
    expect(calls.docCommits).toHaveLength(0);
    expect(calls.selected).toEqual(['b']);
  });

  it('стрелки двигают всю группу одной записью, ручек у группы нет', () => {
    const { env, calls } = makeToolEnv(setup(), {
      selectedObjectId: 'b',
      selectedObjectIds: ['a', 'b'],
    });
    const tool = createObjectTool();
    const arrow = {
      key: 'ArrowRight',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    };
    expect(tool.onKeyDown?.(env, arrow as KeyboardEvent)).toBe(true);
    expect(calls.docCommits).toHaveLength(1);
    expect(pos(calls.docCommits[0].doc, 'a')).toEqual({ x: 2, y: 1 });
    expect(pos(calls.docCommits[0].doc, 'b')).toEqual({ x: 5, y: 1 });
    // Ручка поворота главного объекта: у него одного она есть, у группы — нет.
    const b = findObject(env.doc, 'b')!;
    const knob = gizmoLayout(b, objectMatrix(env.doc, b), 16).knob;
    expect(
      tool.hoverCursor?.(
        makeToolEnv(env.doc, { selectedObjectId: 'b' }).env,
        atPoint(knob.x, knob.y),
      ),
    ).not.toBe(null);
    expect(tool.hoverCursor?.(env, atPoint(knob.x, knob.y))).toBeNull();
  });
});

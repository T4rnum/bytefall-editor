import { describe, expect, it } from 'vitest';
import { makeCell } from '../../../core/cell';
import { createDocument } from '../../../core/document';
import { type CellKey, applyEdits, emptyGrid, keyOf } from '../../../core/grid';
import { addObject, createObject, findObject } from '../../../core/object';
import { createObjectTool } from '../objectTool';
import { at, atPoint, makeToolEnv } from './testEnv';

/**
 * Выбранный объект 4×2 в (2, 2), опора в центре — (4, 3) в документе. При зуме 16 обе
 * стороны достаточно длинные, и у рамки все восемь ручек. Ручка поворота — в (4, 0.375).
 */
function setup() {
  const doc = createDocument({ width: 16, height: 16 });
  const edits = new Map<CellKey, ReturnType<typeof makeCell>>();
  for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) edits.set(keyOf(x, y), makeCell('#'));
  const obj = createObject({
    name: 'o',
    layerId: doc.layers[0].id,
    x: 2,
    y: 2,
    cells: applyEdits(emptyGrid(), edits),
  });
  const { env, calls } = makeToolEnv(addObject(doc, obj), { selectedObjectId: obj.id, zoom: 16 });
  return { env, calls, id: obj.id, tool: createObjectTool() };
}

const KNOB = { x: 4, y: 0.375 };

describe('гизмо инструмента объектов', () => {
  it('ручка поворота: указатель, прошедший четверть круга вокруг опоры, даёт 90°', () => {
    const { env, calls, id, tool } = setup();
    tool.onPointerDown?.(env, atPoint(KNOB.x, KNOB.y));
    // От опоры (4, 3) ручка была прямо вверху; по часовой на четверть — прямо справа.
    tool.onPointerMove?.(env, atPoint(6.625, 3));
    expect(findObject(calls.draft!, id)?.transform.rot).toBe(90);
    tool.onPointerUp?.(env, atPoint(6.625, 3));
    expect(calls.docCommits.map((c) => c.label)).toEqual(['Rotate object']);
    expect(findObject(calls.docCommits[0].doc, id)?.transform).toMatchObject({
      rot: 90,
      x: 2,
      y: 2,
    });
    expect(calls.selected).toEqual([]);
  });

  it('с Shift поворот идёт шагами по 15°', () => {
    const { env, calls, id, tool } = setup();
    tool.onPointerDown?.(env, atPoint(KNOB.x, KNOB.y));
    const angle = (37 * Math.PI) / 180;
    const to = { x: 4 + 2.625 * Math.sin(angle), y: 3 - 2.625 * Math.cos(angle) };
    tool.onPointerUp?.(env, atPoint(to.x, to.y, { shift: true }));
    expect(findObject(calls.docCommits[0].doc, id)?.transform.rot).toBe(30);
  });

  it('боковая ручка тянет масштаб по своей оси, от опоры', () => {
    const { env, calls, id, tool } = setup();
    tool.onPointerDown?.(env, atPoint(6, 3));
    tool.onPointerUp?.(env, atPoint(8, 3.4));
    expect(calls.docCommits.map((c) => c.label)).toEqual(['Scale object']);
    expect(findObject(calls.docCommits[0].doc, id)?.transform).toMatchObject({ sx: 2, sy: 1 });
  });

  it('Alt ставит опору под указатель сразу и не двигает объект', () => {
    const { env, calls, id, tool } = setup();
    tool.onPointerDown?.(env, atPoint(7.2, 5.9, { alt: true }));
    // Черновик уже с новой опорой, ещё до движения. Опора прилипает к половинам ячеек.
    expect(findObject(calls.draft!, id)?.transform).toMatchObject({ px: 5, py: 4, x: 2, y: 2 });
    tool.onPointerUp?.(env, atPoint(7.2, 5.9, { alt: true }));
    expect(calls.docCommits.map((c) => c.label)).toEqual(['Move pivot']);
  });

  it('щелчок по ручке без движения ничего не меняет в истории', () => {
    const { env, calls, tool } = setup();
    tool.onPointerDown?.(env, atPoint(6, 3));
    tool.onPointerUp?.(env, atPoint(6, 3));
    tool.onPointerDown?.(env, atPoint(KNOB.x, KNOB.y));
    tool.onPointerUp?.(env, atPoint(KNOB.x, KNOB.y));
    expect(calls.docCommits).toHaveLength(0);
  });

  it('середину объекта по-прежнему тянут как объект', () => {
    const { env, calls, id, tool } = setup();
    tool.onPointerDown?.(env, at(3, 2));
    tool.onPointerUp?.(env, at(5, 4));
    expect(calls.docCommits.map((c) => c.label)).toEqual(['Move object']);
    expect(findObject(calls.docCommits[0].doc, id)?.transform).toMatchObject({ x: 4, y: 4 });
  });

  it('курсор подсказывает, что под указателем', () => {
    const { env, tool } = setup();
    expect(tool.hoverCursor?.(env, atPoint(6, 3))).toBe('ew-resize');
    expect(tool.hoverCursor?.(env, atPoint(KNOB.x, KNOB.y))).toBe('grab');
    expect(tool.hoverCursor?.(env, at(3, 2))).toBe('move');
    expect(tool.hoverCursor?.(env, atPoint(3, 2, { alt: true }))).toBe('crosshair');
    expect(tool.hoverCursor?.(env, at(12, 12))).toBeNull();
  });
});

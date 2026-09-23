import { describe, expect, it } from 'vitest';
import { makeCell } from '../../../core/cell';
import { applyEdits, emptyGrid, keyOf } from '../../../core/grid';
import { createObject } from '../../../core/object';
import { transformMatrix } from '../../../core/transform';
import { HANDLE_HIT_PX, gizmoLayout, handleCursor, hitGizmo } from '../gizmo';

/** Объект w×h ячеек в (2, 2) с опорой в центре. */
function block(w: number, h: number, rot = 0) {
  const edits = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) edits.set(keyOf(x, y), makeCell('#'));
  const obj = createObject({
    name: 'b',
    layerId: 'l',
    x: 2,
    y: 2,
    cells: applyEdits(emptyGrid(), edits),
  });
  const turned = { ...obj, transform: { ...obj.transform, rot } };
  return { obj: turned, world: transformMatrix(turned.transform) };
}

const ZOOM = 16;

describe('gizmoLayout', () => {
  it('углы рамки, ручка поворота над верхней стороной на одном расстоянии в пикселях', () => {
    const { obj, world } = block(4, 2);
    const layout = gizmoLayout(obj, world, ZOOM);
    expect(layout.quad).toEqual([
      { x: 2, y: 2 },
      { x: 6, y: 2 },
      { x: 6, y: 4 },
      { x: 2, y: 4 },
    ]);
    expect(layout.stem).toEqual({ x: 4, y: 2 });
    expect(layout.knob.x).toBeCloseTo(4);
    expect((layout.stem.y - layout.knob.y) * ZOOM).toBeCloseTo(26);
    // При вдвое большем зуме ручка вдвое ближе в ячейках — и на том же месте на экране.
    const closer = gizmoLayout(obj, world, ZOOM * 2);
    expect((closer.stem.y - closer.knob.y) * ZOOM * 2).toBeCloseTo(26);
    expect(layout.pivot).toEqual({ x: 4, y: 3 });
  });

  it('у короткой стороны боковых ручек нет: объект остаётся за что схватить', () => {
    const wide = gizmoLayout(block(4, 1).obj, block(4, 1).world, ZOOM);
    expect(wide.scale.map((s) => s.handle).sort()).toEqual(['n', 'ne', 'nw', 's', 'se', 'sw']);
    const tiny = gizmoLayout(block(1, 1).obj, block(1, 1).world, ZOOM);
    expect(tiny.scale.map((s) => s.handle).sort()).toEqual(['ne', 'nw', 'se', 'sw']);
    // Центр ячейки дальше радиуса захвата от любого угла.
    expect(hitGizmo(tiny, { x: 2.5, y: 2.5 }, ZOOM)).toBeNull();
  });

  it('у повёрнутого объекта ручка поворота уходит вместе с его верхом', () => {
    const { obj, world } = block(2, 2, 90);
    const layout = gizmoLayout(obj, world, ZOOM);
    // Верх объекта теперь смотрит вправо: ручка правее рамки.
    expect(layout.knob.x).toBeGreaterThan(Math.max(...layout.quad.map((p) => p.x)));
  });
});

describe('hitGizmo', () => {
  it('в радиусе захвата выигрывает ближайшая ручка', () => {
    const { obj, world } = block(4, 2);
    const layout = gizmoLayout(obj, world, ZOOM);
    expect(hitGizmo(layout, { x: 6.2, y: 2.1 }, ZOOM)).toEqual({ kind: 'scale', handle: 'ne' });
    expect(hitGizmo(layout, layout.knob, ZOOM)).toEqual({ kind: 'rotate' });
    const far = HANDLE_HIT_PX / ZOOM + 0.1;
    expect(hitGizmo(layout, { x: 6 + far, y: 2 }, ZOOM)).toBeNull();
    // Середина объекта свободна для переноса.
    expect(hitGizmo(layout, { x: 4, y: 3 }, ZOOM)).toBeNull();
  });
});

describe('handleCursor', () => {
  it('стрелки масштаба поворачиваются вместе с объектом', () => {
    const plain = gizmoLayout(block(4, 2).obj, block(4, 2).world, ZOOM);
    expect(handleCursor(plain, { kind: 'scale', handle: 'e' })).toBe('ew-resize');
    expect(handleCursor(plain, { kind: 'scale', handle: 'n' })).toBe('ns-resize');
    expect(handleCursor(plain, { kind: 'rotate' })).toBe('grab');
    const turned = gizmoLayout(block(4, 2, 90).obj, block(4, 2, 90).world, ZOOM);
    expect(handleCursor(turned, { kind: 'scale', handle: 'e' })).toBe('ns-resize');
  });
});

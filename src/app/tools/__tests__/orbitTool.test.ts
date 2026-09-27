import { describe, expect, it } from 'vitest';
import { createDocument } from '../../../core/document';
import { createScene3D } from '../../../core/scene3d/scene';
import { createOrbitTool } from '../orbitTool';
import { at, makeToolEnv } from './testEnv';

/** Холст 40×20, единственный слой — 3D с камерой перед началом координат. */
function scene3dDoc() {
  const base = createDocument({ width: 40, height: 20 });
  const scene = {
    ...createScene3D(),
    camera: { ...createScene3D().camera, position: [0, 0, 5] as const },
  };
  return { ...base, layers: [{ ...base.layers[0], scene }] };
}

describe('инструмент «Орбита»', () => {
  it('тянуть вправо — камера обходит цель, жест пишется одним ключом склейки', () => {
    const doc = scene3dDoc();
    const { env, calls } = makeToolEnv(doc);
    const tool = createOrbitTool();
    tool.onPointerDown?.(env, at(10, 10));
    tool.onPointerMove?.(env, at(20, 10));
    tool.onPointerUp?.(env, at(30, 10));
    expect(calls.cameras).toHaveLength(2);
    expect(new Set(calls.cameras.map((c) => c.key)).size).toBe(1);
    // Полхолста вправо — четверть оборота: камера уходит влево от цели.
    const [x, y, z] = calls.cameras[1].camera.position;
    expect(x).toBeCloseTo(-5, 5);
    expect(y).toBeCloseTo(0, 5);
    expect(z).toBeCloseTo(0, 5);
    expect(calls.cameras[1].layerId).toBe(doc.layers[0].id);
  });

  it('с Shift — сдвиг вместе с целью, с Alt — приближение; следующий жест — свой ключ', () => {
    const doc = scene3dDoc();
    const { env, calls } = makeToolEnv(doc);
    const tool = createOrbitTool();
    tool.onPointerDown?.(env, at(10, 10, 0, true));
    tool.onPointerUp?.(env, at(20, 10, 0, true));
    const panned = calls.cameras[0].camera;
    expect(panned.target[0]).toBeLessThan(0);
    expect(panned.position[0]).toBeCloseTo(panned.target[0], 6);
    tool.onPointerDown?.(env, at(10, 10, 0, false, true));
    tool.onPointerUp?.(env, at(10, 0, 0, false, true));
    expect(calls.cameras[1].camera.position[2]).toBeLessThan(5);
    expect(calls.cameras[1].key).not.toBe(calls.cameras[0].key);
  });

  it('без 3D-слоя инструмент ничего не делает', () => {
    const { env, calls } = makeToolEnv(createDocument({ width: 40, height: 20 }));
    const tool = createOrbitTool();
    tool.onPointerDown?.(env, at(10, 10));
    tool.onPointerUp?.(env, at(20, 10));
    expect(calls.cameras).toEqual([]);
    expect(tool.hoverCursor?.(env, at(1, 1))).toBe('not-allowed');
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createCellBuffer } from '../../core/cellBuffer';
import type { ComposedFrame, FramePass } from '../../core/frame';
import { GlyphBatchBuilder } from '../../core/instances';
import { FrameMeshes } from '../FrameMeshes';
import { RENDER_ORDER } from '../order';
import { FakeAtlas } from './helpers/fakeAtlas';

const cells = (): FramePass => ({ kind: 'cells', buffer: createCellBuffer(64, 32) });
const glyphs = (): FramePass => ({ kind: 'glyphs', batch: new GlyphBatchBuilder().finish() });
const frameOf = (passes: FramePass[], dirty: number[] | null = null): ComposedFrame => ({
  width: 64,
  height: 32,
  passes,
  dirty,
  time: 0,
});

const meshes = (content: FrameMeshes): THREE.Object3D[] => content.group.children;
/** Место прохода в порядке отрисовки: у потока символов — место его подложки. */
const orderOf = (obj: THREE.Object3D): number =>
  obj instanceof THREE.Group
    ? Math.min(...obj.children.map((c) => c.renderOrder))
    : obj.renderOrder;
const fgRanges = (mesh: THREE.Object3D) =>
  ((mesh as THREE.Mesh).geometry.getAttribute('aFg') as THREE.InstancedBufferAttribute)
    .updateRanges;

describe('FrameMeshes', () => {
  it('по мешу на проход, по порядку отрисовки', () => {
    const content = new FrameMeshes(new FakeAtlas());
    content.apply(frameOf([cells(), glyphs(), cells()]));
    expect(meshes(content)).toHaveLength(3);
    expect(meshes(content).map(orderOf)).toEqual([
      RENDER_ORDER.content,
      RENDER_ORDER.content + 1,
      RENDER_ORDER.content + 2,
    ]);
    // Подложка материала сразу под своими символами и выше предыдущего прохода.
    const stream = meshes(content)[1] as THREE.Group;
    expect(stream.children.map((c) => c.renderOrder)).toEqual([
      RENDER_ORDER.content + 1,
      RENDER_ORDER.content + 1.5,
    ]);
    // Служебная графика всегда выше любого прохода.
    expect(RENDER_ORDER.gridLines).toBeGreaterThan(RENDER_ORDER.content + 1000);
  });

  it('меш того же вида переживает кадр, лишний освобождается', () => {
    const content = new FrameMeshes(new FakeAtlas());
    content.apply(frameOf([cells(), glyphs(), cells()]));
    const [first] = meshes(content);
    content.apply(frameOf([cells()]));
    expect(meshes(content)).toHaveLength(1);
    expect(meshes(content)[0]).toBe(first);
    content.apply(frameOf([glyphs()]));
    expect(meshes(content)[0]).not.toBe(first);
  });

  it('проход ячеек получает только грязные тайлы, новый меш — всё', () => {
    const content = new FrameMeshes(new FakeAtlas());
    const pass = cells();
    content.apply(frameOf([pass]));
    expect(fgRanges(meshes(content)[0])).toEqual([{ start: 0, count: 64 * 32 * 4 }]);
    content.apply(frameOf([pass], [1]));
    expect(fgRanges(meshes(content)[0])[0].count).toBe(32 * 32 * 4);
    content.apply(frameOf([pass], [1]), true);
    expect(fgRanges(meshes(content)[0])).toEqual([{ start: 0, count: 64 * 32 * 4 }]);
  });
});

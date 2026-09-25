import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { IDENTITY } from '../../core/affine';
import { TRANSPARENT } from '../../core/color';
import { GlyphBatchBuilder } from '../../core/instances';
import { materialFloats } from '../../core/material';
import { InstanceMesh } from '../InstanceMesh';
import { FakeAtlas } from './helpers/fakeAtlas';

const RED = { r: 1, g: 0, b: 0, a: 1 };

/** Поток из n символов по диагонали, повёрнутых на четверть оборота. */
function batchOf(count: number, glyph = 'A') {
  const builder = new GlyphBatchBuilder();
  for (let i = 0; i < count; i++) {
    builder.push({ ...IDENTITY, e: i + 0.5, f: i + 0.5 }, glyph, RED, TRANSPARENT, {
      rot: Math.PI / 2,
      sx: 2,
      sy: 1,
    });
  }
  return builder.finish();
}

const attr = (mesh: InstanceMesh, name: string): Float32Array =>
  (mesh.mesh.geometry.getAttribute(name) as THREE.InstancedBufferAttribute).array as Float32Array;
const count = (mesh: InstanceMesh): number =>
  (mesh.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount;

describe('InstanceMesh', () => {
  it('переносит центр, поворот, масштаб и цвета в атрибуты', () => {
    const mesh = new InstanceMesh(new FakeAtlas());
    mesh.update(batchOf(3));
    expect(count(mesh)).toBe(3);
    expect([...attr(mesh, 'aCenter').subarray(0, 6)]).toEqual([0.5, 0.5, 1.5, 1.5, 2.5, 2.5]);
    const pose = attr(mesh, 'aPose');
    expect(pose[0]).toBeCloseTo(Math.PI / 2);
    expect([pose[1], pose[2]]).toEqual([2, 1]);
    expect([...attr(mesh, 'aFg').subarray(0, 4)]).toEqual([1, 0, 0, 1]);
    expect(attr(mesh, 'aBg')[3]).toBe(0);
  });

  it('прямоугольник атласа берётся по таблице символов потока', () => {
    const atlas = new FakeAtlas();
    const mesh = new InstanceMesh(atlas);
    mesh.update(batchOf(2, '@'));
    const rect = atlas.getRect('@');
    // Атрибуты во Float32: сравниваем с тем же округлением.
    const expected = new Float32Array([rect.u0, rect.v0, rect.u1, rect.v1]);
    expect([...attr(mesh, 'aUvRect').subarray(4, 8)]).toEqual([...expected]);
  });

  it('растёт с запасом и не пересоздаёт геометрию на каждый новый символ', () => {
    const mesh = new InstanceMesh(new FakeAtlas());
    mesh.update(batchOf(10));
    const geometry = mesh.mesh.geometry;
    mesh.update(batchOf(40));
    expect(mesh.mesh.geometry).toBe(geometry);
    mesh.update(batchOf(100));
    expect(mesh.mesh.geometry).not.toBe(geometry);
    expect(count(mesh)).toBe(100);
    mesh.update(batchOf(0));
    expect(count(mesh)).toBe(0);
  });

  it('после роста атласа просит перезаливку', () => {
    const atlas = new FakeAtlas();
    const mesh = new InstanceMesh(atlas);
    expect(mesh.needsRefresh()).toBe(false);
    mesh.update(batchOf(1));
    expect(mesh.needsRefresh()).toBe(false);
    atlas.version++;
    expect(mesh.needsRefresh()).toBe(true);
    mesh.refresh();
    expect(mesh.needsRefresh()).toBe(false);
  });

  it('материал уходит в атрибуты, подложка видна только с ним', () => {
    const mesh = new InstanceMesh(new FakeAtlas());
    mesh.update(batchOf(1));
    expect(mesh.under.visible).toBe(false);
    const builder = new GlyphBatchBuilder();
    builder.useMaterial(materialFloats({ outline: { color: '#ff0000', width: 2 }, glow: null }));
    builder.push({ ...IDENTITY, e: 0.5, f: 0.5 }, 'A', RED, TRANSPARENT);
    mesh.update(builder.finish());
    expect(mesh.under.visible).toBe(true);
    expect([...attr(mesh, 'aOutline').subarray(0, 4)]).toEqual([1, 0, 0, 0.25]);
    expect(attr(mesh, 'aGlowStrength')[0]).toBe(0);
    // Подложка и символы — одна геометрия: поток заливается один раз.
    expect(mesh.under.geometry).toBe(mesh.mesh.geometry);
  });
});

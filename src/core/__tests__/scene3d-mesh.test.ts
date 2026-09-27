import { describe, expect, it } from 'vitest';
import {
  MODEL_SIZE,
  meshProblem,
  mergeUntextured,
  normalizeParts,
  srgbFromLinear,
} from '../scene3d/mesh';
import { MAX_MESH_PARTS, type MeshPart3D } from '../scene3d/types';

/** Треугольник с вершинами в заданных точках. */
function triangle(points: number[]): MeshPart3D {
  return {
    positions: new Float32Array(points),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: null,
    colors: null,
    indices: new Uint32Array([0, 1, 2]),
    color: '#ffffff',
    texture: null,
  };
}

describe('модель после импорта', () => {
  it('встаёт в начало координат и получает один размер по большей стороне', () => {
    const source = [
      triangle([10, 0, 0, 30, 0, 0, 10, 10, 0]),
      triangle([10, 0, 5, 30, 0, 5, 10, 10, 5]),
    ];
    const parts = normalizeParts(source);
    const all = parts.flatMap((p) => [...p.positions]);
    const xs = all.filter((_, i) => i % 3 === 0);
    const ys = all.filter((_, i) => i % 3 === 1);
    const zs = all.filter((_, i) => i % 3 === 2);
    // По x модель шириной 20, по y — 10, по z — 5: масштаб задаёт x.
    expect(Math.min(...xs)).toBeCloseTo(-MODEL_SIZE / 2, 6);
    expect(Math.max(...xs)).toBeCloseTo(MODEL_SIZE / 2, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(MODEL_SIZE / 2, 6);
    expect(Math.min(...zs)).toBeCloseTo(-MODEL_SIZE / 8, 6);
    // Нормали и треугольники те же.
    expect(parts[0].normals).toBe(source[0].normals);
    expect(parts[0].indices).toBe(source[0].indices);
    // Исходные части не тронуты.
    expect(source[0].positions[0]).toBe(10);
  });

  it('модель без размера или без частей не ломается, лишнее — называется', () => {
    const dot = normalizeParts([triangle([1, 1, 1, 1, 1, 1, 1, 1, 1])]);
    expect([...dot[0].positions]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(normalizeParts([])).toEqual([]);
    expect(meshProblem([])).toMatch(/нет треугольников/);
    const many = Array.from({ length: MAX_MESH_PARTS + 1 }, () =>
      triangle([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    );
    expect(meshProblem(many)).toMatch(/частей больше/);
    expect(meshProblem([triangle([0, 0, 0, 1, 0, 0, 0, 1, 0])])).toBeNull();
  });

  it('части без текстуры склеиваются, их цвет уходит в вершины', () => {
    const red = { ...triangle([0, 0, 0, 1, 0, 0, 0, 1, 0]), color: '#ff0000' };
    const shaded = {
      ...triangle([5, 0, 0, 6, 0, 0, 5, 1, 0]),
      color: '#ffffff',
      colors: new Float32Array([0.5, 0.5, 0.5, 1, 1, 1, 0, 0, 0]),
    };
    const textured = {
      ...triangle([9, 0, 0, 9, 1, 0, 9, 0, 1]),
      uvs: new Float32Array(6),
      texture: { width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) },
    };
    const merged = mergeUntextured([red, textured, shaded]);
    expect(merged).toHaveLength(2);
    expect(merged[1]).toBe(textured);
    const [one] = merged;
    expect(one.positions).toHaveLength(18);
    expect(one.positions[9]).toBe(5);
    expect([...one.indices]).toEqual([0, 1, 2, 3, 4, 5]);
    expect([...one.colors!.slice(0, 3)]).toEqual([1, 0, 0]);
    expect([...one.colors!.slice(9, 12)]).toEqual([0.5, 0.5, 0.5]);
    // Одна часть без текстуры остаётся как была: цвета вершин ей не нужны.
    expect(mergeUntextured([red, textured])[0]).toBe(red);
  });

  it('линейный цвет glTF переводится в sRGB', () => {
    expect(srgbFromLinear(0)).toBe(0);
    expect(srgbFromLinear(1)).toBeCloseTo(1, 6);
    expect(srgbFromLinear(0.214)).toBeCloseTo(0.5, 2);
    expect(srgbFromLinear(0.001)).toBeCloseTo(0.01292, 5);
  });
});

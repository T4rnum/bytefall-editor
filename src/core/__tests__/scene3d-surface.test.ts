import { describe, expect, it } from 'vitest';
import { meshArea, meshRadius, meshSurface } from '../scene3d/meshSurface';
import { createNode3D } from '../scene3d/scene';
import { PRIMITIVE_RADIUS, levelFor, levelSpacing, primitiveSurface } from '../scene3d/surface';
import { PRIMITIVES_3D, type Mesh3D } from '../scene3d/types';
import { bodyMatrix, normalMatrix, project, viewOf } from '../scene3d/view';

const norm = (a: Float32Array, i: number): number => Math.hypot(a[i], a[i + 1], a[i + 2]);

describe('камера режима B', () => {
  it('цель — в середине экрана, шаг по экрану — по углу обзора', () => {
    const view = viewOf(
      { projection: 'perspective', position: [0, 0, 5], target: [0, 0, 0], fov: 40, size: 4 },
      80,
      40,
    );
    const at = new Float64Array(3);
    project(view, 0, 0, 0, at);
    expect([...at]).toEqual([40, 20, 5]);
    // Точка правее цели на единицу: половина высоты экрана — это tg(20°) на глубине 5.
    project(view, 1, 1, 0, at);
    const focal = 20 / Math.tan((20 * Math.PI) / 180);
    expect(at[0]).toBeCloseTo(40 + focal / 5, 9);
    expect(at[1]).toBeCloseTo(20 - focal / 5, 9);
  });

  it('ортографическая камера: шаг не зависит от глубины, взгляд сверху не вырождается', () => {
    const view = viewOf(
      { projection: 'orthographic', position: [0, 10, 0], target: [0, 0, 0], fov: 40, size: 4 },
      40,
      40,
    );
    const at = new Float64Array(3);
    project(view, 1, 0, 0, at);
    expect(at[0]).toBeCloseTo(30, 3);
    expect(at[2]).toBeCloseTo(10, 6);
    project(view, 1, -5, 0, at);
    expect(at[0]).toBeCloseTo(30, 3);
  });

  it('матрица тела — поворот XYZ, размер и сдвиг; нормали — через обратный размер', () => {
    const node = createNode3D('box', 'Куб', {
      position: [1, 2, 3],
      rotation: [0, 90, 0],
      scale: [2, 1, 1],
    });
    const m = bodyMatrix(node);
    // Поворот на 90° вокруг Y уводит +X в −Z; размер 2 по X.
    const apply = (x: number, y: number, z: number) => [
      m[0] * x + m[1] * y + m[2] * z + m[3],
      m[4] * x + m[5] * y + m[6] * z + m[7],
      m[8] * x + m[9] * y + m[10] * z + m[11],
    ];
    const p = apply(1, 0, 0);
    expect(p[0]).toBeCloseTo(1, 9);
    expect(p[1]).toBeCloseTo(2, 9);
    expect(p[2]).toBeCloseTo(1, 9);
    // Нормаль +X идёт туда же, куда ось, но делится на размер 2: её потом нормируют.
    const nm = normalMatrix(node);
    expect([nm[0], nm[3], nm[6]].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 0, -0.5]);
  });
});

describe('точки на поверхности', () => {
  it('уровень детализации: шаг в √2 раз мельче, levelFor находит уровень по шагу', () => {
    expect(levelSpacing(0)).toBe(0.5);
    expect(levelSpacing(2)).toBeCloseTo(0.25, 12);
    for (const level of [0, 3, 7, 12]) expect(levelFor(levelSpacing(level))).toBe(level);
    expect(levelFor(0.3)).toBe(2);
    expect(levelFor(1e-9)).toBe(16);
  });

  it('шар: точки на радиусе 0,5, нормали единичные и смотрят наружу; вдвое больше точек за два уровня', () => {
    const coarse = primitiveSurface('sphere', 6);
    const fine = primitiveSurface('sphere', 8);
    expect(fine.count / coarse.count).toBeCloseTo(4, 1);
    for (let i = 0; i < coarse.count * 3; i += 3) {
      expect(norm(coarse.positions, i)).toBeCloseTo(0.5, 5);
      expect(norm(coarse.normals, i)).toBeCloseTo(1, 5);
      expect(coarse.positions[i] * coarse.normals[i]).toBeGreaterThanOrEqual(0);
    }
    // Тот же уровень — те же точки: символы едут вместе с поверхностью.
    expect(primitiveSurface('sphere', 6)).toBe(coarse);
  });

  it('все примитивы — внутри своего радиуса, замкнуты все, кроме квадрата', () => {
    for (const kind of PRIMITIVES_3D) {
      const s = primitiveSurface(kind, 6);
      expect(s.count).toBeGreaterThan(20);
      for (let i = 0; i < s.count * 3; i += 3) {
        expect(norm(s.positions, i)).toBeLessThanOrEqual(PRIMITIVE_RADIUS[kind] + 1e-6);
        expect(norm(s.normals, i)).toBeCloseTo(1, 5);
      }
      expect(s.closed).toBe(kind !== 'plane');
    }
    // Тор: каждая точка на расстоянии 0,15 от окружности радиуса 0,35 в плоскости XY.
    const torus = primitiveSurface('torus', 8);
    for (let i = 0; i < torus.count * 3; i += 3) {
      const ring = Math.hypot(torus.positions[i], torus.positions[i + 1]) - 0.35;
      expect(Math.hypot(ring, torus.positions[i + 2])).toBeCloseTo(0.15, 5);
    }
  });

  it('модель: точки на треугольнике, цвет из текстуры и части, засев один и тот же', () => {
    const mesh: Mesh3D = {
      id: 'mesh-quad',
      name: 'Квадрат',
      parts: [
        {
          positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
          normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
          uvs: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
          colors: null,
          indices: new Uint32Array([0, 1, 2, 2, 1, 3]),
          color: '#808080',
          texture: { width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]) },
        },
      ],
    };
    expect(meshArea(mesh)).toBeCloseTo(1, 9);
    expect(meshRadius(mesh)).toBeCloseTo(Math.SQRT2, 6);
    const s = meshSurface(mesh, 8);
    // Площадь 1 при шаге 1/32: около тысячи точек.
    expect(s.count).toBeGreaterThan(900);
    expect(s.count).toBeLessThan(1150);
    expect(s.closed).toBe(false);
    for (let i = 0; i < s.count * 3; i += 3) {
      expect(s.positions[i]).toBeGreaterThanOrEqual(0);
      expect(s.positions[i + 1]).toBeLessThanOrEqual(1);
      expect(s.positions[i + 2]).toBe(0);
      expect([...s.colors!.slice(i, i + 3)].map((v) => Math.round(v * 255))).toEqual([128, 0, 0]);
    }
    const again = meshSurface({ ...mesh }, 8);
    expect(again.count).toBe(s.count);
    expect([...again.positions.slice(0, 30)]).toEqual([...s.positions.slice(0, 30)]);
  });
});

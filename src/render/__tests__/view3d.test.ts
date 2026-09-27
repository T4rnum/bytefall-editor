import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createNode3D } from '../../core/scene3d/scene';
import type { Camera3D } from '../../core/scene3d/types';
import { bodyMatrix, project, viewOf } from '../../core/scene3d/view';

/**
 * Режим B считает камеру и тела сам, режим A — через Three.js. Если они разойдутся, символы
 * облака встанут не там, где растр той же сцены, а выбор мышью промахнётся.
 */
describe('камера и тела ядра совпадают с Three.js', () => {
  const cameras: Camera3D[] = [
    { projection: 'perspective', position: [3, 2, 5], target: [0.5, -0.5, 0], fov: 50, size: 4 },
    { projection: 'orthographic', position: [-4, 6, 1], target: [0, 0, 0], fov: 40, size: 3 },
    { projection: 'perspective', position: [0, 7, 0], target: [0, 0, 0], fov: 40, size: 4 },
  ];

  it('проекция точки на экран', () => {
    const width = 80;
    const height = 45;
    for (const spec of cameras) {
      const camera =
        spec.projection === 'perspective'
          ? new THREE.PerspectiveCamera(spec.fov, width / height, 0.01, 100)
          : new THREE.OrthographicCamera(
              (-spec.size * width) / height / 2,
              (spec.size * width) / height / 2,
              spec.size / 2,
              -spec.size / 2,
              0.01,
              100,
            );
      camera.position.set(...spec.position);
      camera.lookAt(...spec.target);
      camera.updateMatrixWorld();
      const view = viewOf(spec, width, height);
      const at = new Float64Array(3);
      for (const p of [
        [0, 0, 0],
        [1, 0.5, -0.3],
        [-0.7, 1.2, 0.4],
      ] as const) {
        const ndc = new THREE.Vector3(...p).project(camera);
        project(view, p[0], p[1], p[2], at);
        expect(at[0]).toBeCloseTo(((ndc.x + 1) / 2) * width, 6);
        expect(at[1]).toBeCloseTo(((1 - ndc.y) / 2) * height, 6);
      }
    }
  });

  it('матрица тела', () => {
    const node = createNode3D('box', 'Куб', {
      position: [1, -2, 0.5],
      rotation: [30, -45, 110],
      scale: [2, 0.5, 1.5],
    });
    const object = new THREE.Object3D();
    object.position.set(...node.position);
    const deg = Math.PI / 180;
    object.rotation.set(node.rotation[0] * deg, node.rotation[1] * deg, node.rotation[2] * deg);
    object.scale.set(...node.scale);
    object.updateMatrixWorld();
    const m = bodyMatrix(node);
    const e = object.matrixWorld.elements;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) expect(m[row * 4 + col]).toBeCloseTo(e[col * 4 + row], 9);
    }
  });
});

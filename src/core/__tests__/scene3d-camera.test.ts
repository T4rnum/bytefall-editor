import { describe, expect, it } from 'vitest';
import { dollyCamera, orbitCamera, panCamera } from '../scene3d/camera';
import { type Camera3D, DEFAULT_CAMERA } from '../scene3d/types';

const front: Camera3D = { ...DEFAULT_CAMERA, position: [0, 0, 5], target: [0, 0, 0] };

const close = (a: readonly number[], b: readonly number[]) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 5));

describe('камера мышью', () => {
  it('орбита держит расстояние до цели, азимут ведёт от +Z к +X, высота — до полюса', () => {
    close(orbitCamera(front, 90, 0).position, [5, 0, 0]);
    close(orbitCamera(front, 0, 90).position, [
      0,
      5 * Math.sin((89 * Math.PI) / 180),
      5 * Math.cos((89 * Math.PI) / 180),
    ]);
    const around = orbitCamera(orbitCamera(front, 37, 20), -37, -20);
    close(around.position, front.position);
    expect(orbitCamera(front, 45, 30).target).toEqual(front.target);
  });

  it('сдвиг везёт камеру вместе с целью в плоскости экрана, на долю высоты кадра', () => {
    const moved = panCamera(front, 0.5, 0);
    const height = 2 * 5 * Math.tan((front.fov * Math.PI) / 180 / 2);
    // Указатель вправо — мир вправо, камера влево.
    close(moved.target, [-0.5 * height, 0, 0]);
    close(moved.position, [-0.5 * height, 0, 5]);
    const down = panCamera(front, 0, 0.25);
    close(down.target, [0, 0.25 * height, 0]);
    const ortho = panCamera({ ...front, projection: 'orthographic', size: 4 }, 1, 0);
    close(ortho.target, [-4, 0, 0]);
  });

  it('приближение меняет расстояние, у ортографической — высоту кадра', () => {
    close(dollyCamera(front, 0.5).position, [0, 0, 2.5]);
    close(dollyCamera(front, 0).position, [0, 0, 0.1]);
    expect(dollyCamera({ ...front, projection: 'orthographic', size: 4 }, 2).size).toBe(8);
  });
});

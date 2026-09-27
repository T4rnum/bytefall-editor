import type { Camera3D, Light3D, Node3D, Vec3 } from './types';

const DEG = Math.PI / 180;

/**
 * Камера 3D-сцены числами, без Three.js: режим B считает символы на CPU (DESIGN.md, раздел 6).
 * Совпадает с камерой, которой рисует режим A: ось Y вверх, камера смотрит вдоль −Z своего
 * базиса, угол обзора вертикальный. Экран — ячейки документа, ось Y вниз.
 */
export interface View3D {
  readonly width: number;
  readonly height: number;
  /**
   * Ширина ячейки к высоте. `focal` — ячеек по вертикали; по горизонтали их в `aspect` раз
   * меньше на ту же длину сцены: у неквадратной ячейки шар остаётся круглым на экране.
   */
  readonly aspect: number;
  readonly eye: Vec3;
  /** Оси камеры в мире: вправо, вверх и назад — от цели к камере. */
  readonly right: Vec3;
  readonly up: Vec3;
  readonly back: Vec3;
  readonly perspective: boolean;
  /** Ячеек на единицу сцены: у перспективы — на глубине 1, у ортографической — везде. */
  readonly focal: number;
  /** Ближе этой глубины ничего не рисуется. */
  readonly near: number;
}

const cross = (a: readonly number[], b: readonly number[]): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const unit = (v: readonly number[]): [number, number, number] => {
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
};

/** Базис взгляда из камеры на цель, как `lookAt` в Three.js с осью Y вверх. */
function basis(camera: Camera3D): { right: Vec3; up: Vec3; back: Vec3 } {
  const [ex, ey, ez] = camera.position;
  const [tx, ty, tz] = camera.target;
  // Камера в самой цели не поворачивается и смотрит вдоль −Z.
  if (Math.hypot(ex - tx, ey - ty, ez - tz) <= 1e-6) {
    return { right: [1, 0, 0], up: [0, 1, 0], back: [0, 0, 1] };
  }
  let back = unit([ex - tx, ey - ty, ez - tz]);
  let right = cross([0, 1, 0], back);
  // Взгляд строго вверх или вниз: Three.js чуть сдвигает ось, чтобы базис не выродился.
  if (Math.hypot(...right) < 1e-12) {
    back = unit([back[0], back[1], back[2] + 0.0001]);
    right = cross([0, 1, 0], back);
  }
  right = unit(right);
  return { right, up: cross(back, right), back };
}

export function viewOf(camera: Camera3D, width: number, height: number, aspect = 1): View3D {
  const perspective = camera.projection === 'perspective';
  return {
    width,
    height,
    aspect,
    eye: camera.position,
    ...basis(camera),
    perspective,
    focal: perspective ? height / 2 / Math.tan((camera.fov * DEG) / 2) : height / camera.size,
    near: 1e-3,
  };
}

/** Ячеек на единицу сцены на глубине `depth`. */
export const cellsPerUnit = (view: View3D, depth: number): number =>
  view.perspective ? view.focal / depth : view.focal;

/**
 * Точка мира на экран: x, y в ячейках документа и глубина вдоль взгляда. Результат пишется в
 * `out`, чтобы горячий цикл не создавал массивов.
 */
export function project(view: View3D, x: number, y: number, z: number, out: Float64Array): void {
  const { eye, right, up, back } = view;
  const dx = x - eye[0];
  const dy = y - eye[1];
  const dz = z - eye[2];
  const depth = -(dx * back[0] + dy * back[1] + dz * back[2]);
  const k = view.perspective ? view.focal / depth : view.focal;
  out[0] = view.width / 2 + ((dx * right[0] + dy * right[1] + dz * right[2]) * k) / view.aspect;
  out[1] = view.height / 2 - (dx * up[0] + dy * up[1] + dz * up[2]) * k;
  out[2] = depth;
}

/**
 * Матрица тела 3×4 по строкам: поворот, растянутый размером, и сдвиг в последнем столбце.
 * Поворот — как у Three.js с порядком XYZ: Rx · Ry · Rz.
 */
export function bodyMatrix(node: Node3D): Float64Array {
  const [x, y, z] = node.rotation.map((v) => v * DEG);
  const [sx, sy, sz] = node.scale;
  const a = Math.cos(x);
  const b = Math.sin(x);
  const c = Math.cos(y);
  const d = Math.sin(y);
  const e = Math.cos(z);
  const f = Math.sin(z);
  const [px, py, pz] = node.position;
  // prettier-ignore
  return Float64Array.of(
    c * e * sx, -c * f * sy, d * sz, px,
    (a * f + b * e * d) * sx, (a * e - b * f * d) * sy, -b * c * sz, py,
    (b * f - a * e * d) * sx, (b * e + a * f * d) * sy, a * c * sz, pz,
  );
}

/**
 * Матрица нормалей тела 3×3 по строкам: поворот, делённый на размер. Нормаль после неё надо
 * нормировать: у неравного размера длина меняется.
 */
export function normalMatrix(node: Node3D): Float64Array {
  const m = bodyMatrix(node);
  const [sx, sy, sz] = node.scale;
  const k = [1 / (sx * sx), 1 / (sy * sy), 1 / (sz * sz)];
  // Столбцы R·S делятся на квадрат размера: R·S⁻¹ = (R·S)·S⁻².
  // prettier-ignore
  return Float64Array.of(
    m[0] * k[0], m[1] * k[1], m[2] * k[2],
    m[4] * k[0], m[5] * k[1], m[6] * k[2],
    m[8] * k[0], m[9] * k[1], m[10] * k[2],
  );
}

/** Направление на солнце в мире: азимут вокруг Y от +Z к +X, высота над горизонтом. */
export function sunDirection(light: Light3D): Vec3 {
  const az = light.sunAzimuth * DEG;
  const el = light.sunElevation * DEG;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
}

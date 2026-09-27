import type { Camera3D, Vec3 } from './types';

/**
 * Камера 3D-сцены мышью, как в Blender: вращение вокруг цели, сдвиг вместе с целью и
 * приближение к ней. Всё считается от исходной камеры жеста, а не шагами: перемотка жеста
 * назад возвращает камеру точно туда, где она была.
 */

const DEG = Math.PI / 180;
/** Высота камеры над горизонтом цели: у полюса направление «вверх» теряется. */
const MAX_ELEVATION = 89;
const MIN_DISTANCE = 0.1;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const round = (a: Vec3): Vec3 => [
  Math.round(a[0] * 1e6) / 1e6,
  Math.round(a[1] * 1e6) / 1e6,
  Math.round(a[2] * 1e6) / 1e6,
];

/** Где камера относительно цели: расстояние, азимут от +Z к +X и высота, градусы. */
function spherical(camera: Camera3D): { r: number; azimuth: number; elevation: number } {
  const [x, y, z] = sub(camera.position, camera.target);
  const r = Math.max(MIN_DISTANCE, Math.hypot(x, y, z));
  return {
    r,
    azimuth: Math.atan2(x, z) / DEG,
    elevation: Math.asin(Math.max(-1, Math.min(1, y / r))) / DEG,
  };
}

function fromSpherical(target: Vec3, r: number, azimuth: number, elevation: number): Vec3 {
  const az = azimuth * DEG;
  const el = elevation * DEG;
  return round(
    add(target, [
      r * Math.cos(el) * Math.sin(az),
      r * Math.sin(el),
      r * Math.cos(el) * Math.cos(az),
    ]),
  );
}

/** Поворот вокруг цели: азимут и высота прибавляются, высота — до полюса, не дальше. */
export function orbitCamera(camera: Camera3D, dAzimuth: number, dElevation: number): Camera3D {
  const { r, azimuth, elevation } = spherical(camera);
  const next = Math.max(-MAX_ELEVATION, Math.min(MAX_ELEVATION, elevation + dElevation));
  return { ...camera, position: fromSpherical(camera.target, r, azimuth + dAzimuth, next) };
}

/**
 * Сдвиг камеры вместе с целью в плоскости экрана. `dx`, `dy` — доли высоты кадра: вправо и
 * вниз по экрану, как движется указатель.
 */
export function panCamera(camera: Camera3D, dx: number, dy: number): Camera3D {
  const { r } = spherical(camera);
  const forward = scale(sub(camera.target, camera.position), 1 / r);
  // Правая ось — поперёк взгляда и вертикали мира, верх экрана — поперёк взгляда и правой оси.
  const rightRaw: Vec3 = [-forward[2], 0, forward[0]];
  const right =
    length(rightRaw) > 1e-9 ? scale(rightRaw, 1 / length(rightRaw)) : ([1, 0, 0] as Vec3);
  const up: Vec3 = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  const height =
    camera.projection === 'perspective' ? 2 * r * Math.tan((camera.fov * DEG) / 2) : camera.size;
  // Мир едет за указателем: камера — в обратную сторону.
  const shift = add(scale(right, -dx * height), scale(up, dy * height));
  return {
    ...camera,
    position: round(add(camera.position, shift)),
    target: round(add(camera.target, shift)),
  };
}

/** Приближение к цели в `factor` раз: у ортографической камеры меняется высота кадра. */
export function dollyCamera(camera: Camera3D, factor: number): Camera3D {
  if (camera.projection === 'orthographic') {
    return { ...camera, size: Math.round(Math.max(0.01, camera.size * factor) * 1e6) / 1e6 };
  }
  const offset = sub(camera.position, camera.target);
  const r = length(offset);
  const next = Math.max(MIN_DISTANCE, r * factor);
  return {
    ...camera,
    position: round(add(camera.target, scale(offset, next / Math.max(1e-9, r)))),
  };
}

import { parseHex } from '../color';
import { type Surface, levelSpacing } from './surface';
import type { Mesh3D, MeshPart3D } from './types';

/**
 * Точки на поверхности модели: треугольники засеваются по площади, у каждой точки — нормаль и
 * цвет из вершин, цвета части и текстуры. Засев детерминированный: сколько точек у треугольника
 * и где они, зависит только от его номера, поэтому одна и та же модель даёт одни и те же точки.
 * Модель считается незамкнутой: у рельефа и у многих моделей из glTF изнанка видна.
 */

/** Дробная часть. */
const frac = (v: number): number => v - Math.floor(v);

/**
 * Число 0..1 по целому номеру: где у треугольника дробная точка и откуда начинается его ряд.
 * Целочисленное перемешивание, а не синус: результат одинаков в любом движке JavaScript.
 */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Шаги ряда R2: точки внутри треугольника расходятся равномерно при любом их числе. */
const R2_U = 0.7548776662466927;
const R2_V = 0.5698402909980532;

function area(p: Float32Array, a: number, b: number, c: number): number {
  const ux = p[b * 3] - p[a * 3];
  const uy = p[b * 3 + 1] - p[a * 3 + 1];
  const uz = p[b * 3 + 2] - p[a * 3 + 2];
  const vx = p[c * 3] - p[a * 3];
  const vy = p[c * 3 + 1] - p[a * 3 + 1];
  const vz = p[c * 3 + 2] - p[a * 3 + 2];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
}

/** Цвет текстуры в точке uv: ближайший тексель, строки сверху вниз, края повторяются. */
function texel(part: MeshPart3D, u: number, v: number, out: number[]): void {
  const t = part.texture;
  if (!t) return;
  const x = Math.min(t.width - 1, Math.floor(frac(u) * t.width));
  const y = Math.min(t.height - 1, Math.floor(frac(v) * t.height));
  const o = (y * t.width + x) * 4;
  out[0] *= t.data[o] / 255;
  out[1] *= t.data[o + 1] / 255;
  out[2] *= t.data[o + 2] / 255;
}

/** Точки одной части с шагом `spacing`: по треугольникам, номера — сквозные по модели. */
function sampleParts(parts: readonly MeshPart3D[], spacing: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const rgb = [0, 0, 0];
  let serial = 0;
  for (const part of parts) {
    const base = parseHex(part.color);
    const { positions: p, normals: n, colors: vc, uvs, indices } = part;
    for (let t = 0; t < indices.length; t += 3, serial++) {
      const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
      const exact = area(p, a, b, c) / (spacing * spacing);
      const count = Math.floor(exact + hash(serial * 2));
      const start = hash(serial * 2 + 1);
      for (let k = 0; k < count; k++) {
        let u = frac(start + k * R2_U);
        let v = frac(start + k * R2_V);
        if (u + v > 1) [u, v] = [1 - u, 1 - v];
        const w = 1 - u - v;
        const mix = (arr: Float32Array, size: number, i: number): number =>
          arr[a * size + i] * w + arr[b * size + i] * u + arr[c * size + i] * v;
        positions.push(mix(p, 3, 0), mix(p, 3, 1), mix(p, 3, 2));
        const nx = mix(n, 3, 0);
        const ny = mix(n, 3, 1);
        const nz = mix(n, 3, 2);
        const len = Math.hypot(nx, ny, nz) || 1;
        normals.push(nx / len, ny / len, nz / len);
        rgb[0] = base.r * (vc ? mix(vc, 3, 0) : 1);
        rgb[1] = base.g * (vc ? mix(vc, 3, 1) : 1);
        rgb[2] = base.b * (vc ? mix(vc, 3, 2) : 1);
        if (uvs) texel(part, mix(uvs, 2, 0), mix(uvs, 2, 1), rgb);
        colors.push(rgb[0], rgb[1], rgb[2]);
      }
    }
  }
  return { positions, normals, colors };
}

interface MeshInfo {
  readonly area: number;
  readonly radius: number;
  readonly levels: Map<number, Surface>;
}

const infos = new WeakMap<Mesh3D, MeshInfo>();

function infoOf(mesh: Mesh3D): MeshInfo {
  let info = infos.get(mesh);
  if (!info) {
    let total = 0;
    let radius = 0;
    for (const { positions: p, indices } of mesh.parts) {
      for (let t = 0; t < indices.length; t += 3)
        total += area(p, indices[t], indices[t + 1], indices[t + 2]);
      for (let i = 0; i < p.length; i += 3)
        radius = Math.max(radius, Math.hypot(p[i], p[i + 1], p[i + 2]));
    }
    info = { area: total, radius, levels: new Map() };
    infos.set(mesh, info);
  }
  return info;
}

/** Площадь поверхности модели в её координатах. */
export const meshArea = (mesh: Mesh3D): number => infoOf(mesh).area;

/** Радиус шара вокруг начала координат модели, в который она помещается. */
export const meshRadius = (mesh: Mesh3D): number => infoOf(mesh).radius;

/** Точки модели на уровне детализации: считаются раз на модель и уровень. */
export function meshSurface(mesh: Mesh3D, level: number): Surface {
  const { levels } = infoOf(mesh);
  let surface = levels.get(level);
  if (!surface) {
    const { positions, normals, colors } = sampleParts(mesh.parts, levelSpacing(level));
    surface = {
      count: positions.length / 3,
      positions: Float32Array.from(positions),
      normals: Float32Array.from(normals),
      colors: Float32Array.from(colors),
      closed: false,
    };
    levels.set(level, surface);
  }
  return surface;
}

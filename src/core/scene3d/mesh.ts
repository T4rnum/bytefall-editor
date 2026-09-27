import { parseHex } from '../color';
import type { Layer } from '../document';
import { MAX_MESH_PARTS, MAX_MESH_VERTICES, type Mesh3D, type MeshPart3D } from './types';

/**
 * Модели 3D-сцены: подготовка импортированных частей. Модель ставится в начало координат и
 * получает один размер по большей стороне — так она сразу целиком в кадре камеры по умолчанию,
 * каким бы ни был масштаб файла.
 */

/**
 * Размер модели по большей стороне после импорта, единицы сцены: камера по умолчанию видит в
 * высоту около 3,8, и высокая модель занимает три четверти кадра.
 */
export const MODEL_SIZE = 2.8;

/** Цвет из линейного пространства (glTF хранит так цвета материалов и вершин) в sRGB. */
export const srgbFromLinear = (v: number): number =>
  v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;

export const meshVertices = (parts: readonly MeshPart3D[]): number =>
  parts.reduce((sum, p) => sum + p.positions.length / 3, 0);

/** Почему модель не встанет в документ, или null — встанет. */
export function meshProblem(parts: readonly MeshPart3D[]): string | null {
  if (parts.length === 0) return 'в файле нет треугольников';
  if (parts.length > MAX_MESH_PARTS) return `частей больше ${MAX_MESH_PARTS}`;
  const vertices = meshVertices(parts);
  if (vertices > MAX_MESH_VERTICES) return `вершин ${vertices}, а можно до ${MAX_MESH_VERTICES}`;
  return null;
}

/**
 * Части без текстуры одной частью: цвет части уходит в цвета вершин. У модели из glTF частей
 * столько, сколько материалов на сетках, — сотни у сложной, а в документе их до `MAX_MESH_PARTS`.
 * Части с текстурой остаются как были: текстура у части одна.
 */
export function mergeUntextured(parts: readonly MeshPart3D[]): MeshPart3D[] {
  const plain = parts.filter((p) => p.texture === null);
  if (plain.length < 2) return [...parts];
  const vertices = meshVertices(plain);
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const colors = new Float32Array(vertices * 3);
  const indices = new Uint32Array(plain.reduce((sum, p) => sum + p.indices.length, 0));
  let v = 0;
  let t = 0;
  for (const part of plain) {
    const count = part.positions.length / 3;
    const { r, g, b } = parseHex(part.color);
    positions.set(part.positions, v * 3);
    normals.set(part.normals, v * 3);
    for (let i = 0; i < count; i++) {
      const o = (v + i) * 3;
      colors[o] = r * (part.colors ? part.colors[i * 3] : 1);
      colors[o + 1] = g * (part.colors ? part.colors[i * 3 + 1] : 1);
      colors[o + 2] = b * (part.colors ? part.colors[i * 3 + 2] : 1);
    }
    for (let i = 0; i < part.indices.length; i++) indices[t + i] = part.indices[i] + v;
    v += count;
    t += part.indices.length;
  }
  const merged: MeshPart3D = {
    positions,
    normals,
    uvs: null,
    colors,
    indices,
    color: '#ffffff',
    texture: null,
  };
  return [merged, ...parts.filter((p) => p.texture !== null)];
}

/** Габарит всех частей: наименьшие и наибольшие координаты. */
function bounds(parts: readonly MeshPart3D[]): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { positions } of parts) {
    for (let i = 0; i < positions.length; i++) {
      const axis = i % 3;
      min[axis] = Math.min(min[axis], positions[i]);
      max[axis] = Math.max(max[axis], positions[i]);
    }
  }
  return { min, max };
}

/**
 * Части с центром габарита в начале координат и размером `MODEL_SIZE` по большей стороне.
 * Нормали не меняются: сдвиг и равномерный масштаб их не поворачивают.
 */
export function normalizeParts(parts: readonly MeshPart3D[]): MeshPart3D[] {
  const { min, max } = bounds(parts);
  if (!Number.isFinite(min[0])) return [...parts];
  const center = [0, 1, 2].map((a) => (min[a] + max[a]) / 2);
  const extent = Math.max(...[0, 1, 2].map((a) => max[a] - min[a]));
  const k = extent > 0 ? MODEL_SIZE / extent : 1;
  return parts.map((part) => {
    const positions = new Float32Array(part.positions.length);
    for (let i = 0; i < positions.length; i++) {
      positions[i] = (part.positions[i] - center[i % 3]) * k;
    }
    return { ...part, positions };
  });
}

/**
 * Модели, на которые ссылается хоть одно тело слоёв. Удалённое тело или слой оставляет модель в
 * анимации — её держит история отмены, — но в файл она уже не идёт.
 */
export function usedMeshes(meshes: readonly Mesh3D[], layers: readonly Layer[]): readonly Mesh3D[] {
  const ids = new Set(layers.flatMap((l) => l.scene?.nodes.map((n) => n.mesh) ?? []));
  return meshes.every((m) => ids.has(m.id)) ? meshes : meshes.filter((m) => ids.has(m.id));
}

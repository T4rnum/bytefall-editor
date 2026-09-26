import { z } from 'zod';
import { fromBase64, toBase64 } from '../base64';
import { normalizeHex } from '../color';
import {
  MAX_MESHES,
  MAX_MESH_PARTS,
  MAX_MESH_VERTICES,
  MAX_TEXTURE_SIZE,
  type Mesh3D,
  type MeshPart3D,
} from '../scene3d/types';
import { DocumentFormatError, MAX_NAME_LENGTH, hex, id } from './primitives';

/** Самый длинный массив модели в base64: индексы трёх треугольников на вершину. */
const MAX_BASE64 = Math.ceil((MAX_MESH_VERTICES * 6 * 4) / 3) * 4;
const b64 = z.string().max(MAX_BASE64);

const partSchema = z.object({
  positions: b64,
  normals: b64,
  uvs: b64.optional(),
  colors: b64.optional(),
  indices: b64,
  color: hex,
  texture: z
    .object({
      width: z.number().int().min(1).max(MAX_TEXTURE_SIZE),
      height: z.number().int().min(1).max(MAX_TEXTURE_SIZE),
      data: b64,
    })
    .optional(),
});

const meshSchema = z.object({
  id,
  name: z.string().max(MAX_NAME_LENGTH),
  parts: z.array(partSchema).min(1).max(MAX_MESH_PARTS),
});

/** Модели 3D-сцен документа (версия 11). */
export const meshesSchema = z.array(meshSchema).max(MAX_MESHES);

type MeshFile = z.infer<typeof meshSchema>;
type PartFile = z.infer<typeof partSchema>;

/** Числа младшим байтом вперёд, как в `.bytefall`: файл одинаков на любой машине. */
function floatsToBase64(values: Float32Array): string {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((v, i) => view.setFloat32(i * 4, v, true));
  return toBase64(bytes);
}

function base64ToFloats(text: string, where: string): Float32Array {
  const bytes = fromBase64(text);
  if (bytes.length % 4 !== 0) throw new DocumentFormatError(`${where}: broken float array`);
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(bytes.length / 4);
  for (let i = 0; i < out.length; i++) {
    const v = view.getFloat32(i * 4, true);
    if (!Number.isFinite(v)) throw new DocumentFormatError(`${where}: non-finite number`);
    out[i] = v;
  }
  return out;
}

function indicesToBase64(values: Uint32Array): string {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((v, i) => view.setUint32(i * 4, v, true));
  return toBase64(bytes);
}

function base64ToIndices(text: string, vertices: number, where: string): Uint32Array {
  const bytes = fromBase64(text);
  if (bytes.length % 12 !== 0) throw new DocumentFormatError(`${where}: broken triangles`);
  const view = new DataView(bytes.buffer);
  const out = new Uint32Array(bytes.length / 4);
  for (let i = 0; i < out.length; i++) {
    const v = view.getUint32(i * 4, true);
    if (v >= vertices) throw new DocumentFormatError(`${where}: index past the last vertex`);
    out[i] = v;
  }
  return out;
}

/** Часть модели из файла: длины массивов сходятся с числом вершин, индексы — в пределах. */
function partFromFile(file: PartFile, where: string): MeshPart3D {
  const positions = base64ToFloats(file.positions, where);
  const vertices = positions.length / 3;
  if (!Number.isInteger(vertices) || vertices > MAX_MESH_VERTICES) {
    throw new DocumentFormatError(`${where}: bad vertex count`);
  }
  const sized = (text: string | undefined, channels: number): Float32Array | null => {
    if (text === undefined) return null;
    const values = base64ToFloats(text, where);
    if (values.length !== vertices * channels) {
      throw new DocumentFormatError(`${where}: array length does not match vertices`);
    }
    return values;
  };
  const texture = file.texture && {
    width: file.texture.width,
    height: file.texture.height,
    data: fromBase64(file.texture.data),
  };
  if (texture && texture.data.length !== texture.width * texture.height * 4) {
    throw new DocumentFormatError(`${where}: texture size does not match its data`);
  }
  return {
    positions,
    normals: sized(file.normals, 3) as Float32Array,
    uvs: sized(file.uvs, 2),
    colors: sized(file.colors, 3),
    indices: base64ToIndices(file.indices, vertices, where),
    color: normalizeHex(file.color),
    texture: texture ?? null,
  };
}

export function meshesFromFile(files: readonly MeshFile[]): Mesh3D[] {
  const ids = new Set<string>();
  return files.map((file) => {
    if (ids.has(file.id)) throw new DocumentFormatError(`Duplicate mesh id: ${file.id}`);
    ids.add(file.id);
    const parts = file.parts.map((p, i) => partFromFile(p, `Mesh ${file.id} part ${i}`));
    const vertices = parts.reduce((sum, p) => sum + p.positions.length / 3, 0);
    if (vertices > MAX_MESH_VERTICES) throw new DocumentFormatError(`Mesh ${file.id} is too big`);
    return { id: file.id, name: file.name, parts };
  });
}

export function meshesToFile(meshes: readonly Mesh3D[]): MeshFile[] {
  return meshes.map((mesh) => ({
    id: mesh.id,
    name: mesh.name,
    parts: mesh.parts.map((p) => ({
      positions: floatsToBase64(p.positions),
      normals: floatsToBase64(p.normals),
      ...(p.uvs ? { uvs: floatsToBase64(p.uvs) } : {}),
      ...(p.colors ? { colors: floatsToBase64(p.colors) } : {}),
      indices: indicesToBase64(p.indices),
      color: p.color,
      ...(p.texture
        ? {
            texture: {
              width: p.texture.width,
              height: p.texture.height,
              data: toBase64(new Uint8Array(p.texture.data)),
            },
          }
        : {}),
    })),
  }));
}

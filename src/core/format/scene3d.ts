import { z } from 'zod';
import { normalizeHex } from '../color';
import { limits3D } from '../scene3d/scene';
import {
  MAX_NODES_3D,
  type Node3D,
  PRIMITIVES_3D,
  type Scene3D,
  type Vec3,
} from '../scene3d/types';
import { DocumentFormatError, MAX_NAME_LENGTH, hex, id } from './primitives';

/** Число в пределах свойства — тех же, что у ключей. */
const within = (property: Parameters<typeof limits3D>[0]) => {
  const { min, max } = limits3D(property);
  return z.number().min(min).max(max);
};
const vec3 = (property: Parameters<typeof limits3D>[0]) =>
  z.tuple([within(property), within(property), within(property)]);

const nodeSchema = z.object({
  id,
  name: z.string().max(MAX_NAME_LENGTH),
  kind: z.enum([...PRIMITIVES_3D, 'mesh']),
  mesh: id.nullable().optional(),
  visible: z.boolean(),
  position: vec3('position'),
  rotation: vec3('rotation'),
  scale: vec3('scale'),
  color: hex,
});

const cameraSchema = z.object({
  projection: z.enum(['perspective', 'orthographic']),
  position: vec3('cameraPosition'),
  target: vec3('cameraTarget'),
  fov: within('fov'),
  size: within('size'),
});

const lightSchema = z.object({
  ambientColor: hex,
  ambient: within('ambient'),
  sunColor: hex,
  sun: within('sun'),
  sunAzimuth: within('sunAzimuth'),
  sunElevation: within('sunElevation'),
});

/** Настройки квантизации: те же пределы, что у ползунков импорта картинки. */
const quantizeSchema = z.object({
  ramp: z.string().max(256),
  weights: z.enum(['rec709', 'rec601', 'average']),
  gamma: z.number().min(0.2).max(5),
  contrast: z.number().min(0).max(3),
  brightness: z.number().min(-1).max(1),
  invert: z.boolean(),
  dither: z.enum(['none', 'bayer', 'noise']),
  edges: z.boolean(),
  edgeThreshold: z.number().min(0).max(1),
  edgeStrength: z.number().min(0).max(1),
  palette: z.array(hex).max(256).nullable(),
  vivid: z.boolean(),
  background: z.enum(['none', 'blocks', 'shaded']),
  alphaThreshold: z.number().min(0).max(1),
});

/** 3D-сцена слоя (версия 11). */
export const scene3dSchema = z.object({
  nodes: z.array(nodeSchema).max(MAX_NODES_3D),
  camera: cameraSchema,
  light: lightSchema,
  quantize: quantizeSchema,
});

type Scene3DFile = z.infer<typeof scene3dSchema>;

const asVec3 = (v: readonly number[]): Vec3 => [v[0], v[1], v[2]];

/**
 * Сцена из файла. Тело модели обязано ссылаться на модель документа, примитив — ни на что:
 * иначе рендер искал бы сетку, которой нет.
 */
export function scene3dFromFile(
  file: Scene3DFile,
  layerId: string,
  meshes: ReadonlySet<string>,
): Scene3D {
  const ids = new Set<string>();
  const nodes = file.nodes.map((n): Node3D => {
    if (ids.has(n.id)) throw new DocumentFormatError(`Layer ${layerId}: duplicate 3D body ${n.id}`);
    ids.add(n.id);
    const mesh = n.mesh ?? null;
    if ((n.kind === 'mesh') !== (mesh !== null) || (mesh !== null && !meshes.has(mesh))) {
      throw new DocumentFormatError(`Layer ${layerId}: 3D body ${n.id} has a bad mesh reference`);
    }
    return {
      ...n,
      mesh,
      position: asVec3(n.position),
      rotation: asVec3(n.rotation),
      scale: asVec3(n.scale),
      color: normalizeHex(n.color),
    };
  });
  const { camera, light, quantize } = file;
  return {
    nodes,
    camera: { ...camera, position: asVec3(camera.position), target: asVec3(camera.target) },
    light: {
      ...light,
      ambientColor: normalizeHex(light.ambientColor),
      sunColor: normalizeHex(light.sunColor),
    },
    quantize: { ...quantize, palette: quantize.palette?.map(normalizeHex) ?? null },
  };
}

export function scene3dToFile(scene: Scene3D): Scene3DFile {
  return {
    nodes: scene.nodes.map((n) => ({
      ...n,
      position: [...n.position],
      rotation: [...n.rotation],
      scale: [...n.scale],
    })),
    camera: {
      ...scene.camera,
      position: [...scene.camera.position],
      target: [...scene.camera.target],
    },
    light: { ...scene.light },
    quantize: { ...scene.quantize, palette: scene.quantize.palette && [...scene.quantize.palette] },
  };
}

import { z } from 'zod';
import {
  type Animation,
  type Frame,
  MAX_FRAMES,
  MAX_FRAME_DURATION,
  MIN_FRAME_DURATION,
  aliveNodes,
  createFrame,
} from './animation';
import { MAX_DIMENSION, MAX_PALETTE, MIN_DIMENSION } from './document';
import type { DeformerMigration } from './format/graph';
import {
  assertSharedLayers,
  layersFromFile,
  layersSchema,
  layersToFile,
  uniqueEffectIds,
} from './format/layers';
import { meshesFromFile, meshesSchema, meshesToFile } from './format/meshes';
import { objectSchema, objectsFromFile, objectsToFile } from './format/objects';
import { usedMeshes } from './scene3d/mesh';
import { tracksFromFile, tracksSchema, tracksToFile } from './format/tracks';
import { DEFAULT_FPS, MAX_FPS, MAX_SCENE_DURATION, MIN_FPS, MIN_SCENE_DURATION } from './time';
import { DocumentFormatError, MAX_ID_LENGTH, MAX_NAME_LENGTH, hex, id } from './format/primitives';
import { MAX_OBJECTS } from './object';

export {
  DocumentFormatError,
  MAX_ATTR_STRING_LENGTH,
  MAX_ATTRS_PER_CELL,
  MAX_CELLS_PER_LAYER,
  MAX_GLYPH_LENGTH,
  MAX_ID_LENGTH,
  MAX_NAME_LENGTH,
} from './format/primitives';

export const FORMAT_NAME = 'bytefall';
/** Имя формата у прототипа BlendPhoto. Такие файлы читаются, но записываются уже как bytefall. */
export const LEGACY_FORMAT_NAMES = ['blendphoto'] as const;
/**
 * Версия 2 добавила объекты, 3 кадры, 4 эффекты слоёв, 5 трансформ объектов, правки символов
 * и родителей, 6 — время: частоту и длину сцены, треки ключей, непрозрачность и оттенок
 * объекта, 7 — деформеры объекта, 8 — GPU-материал объекта, 9 — кости и контроллеры рига,
 * 10 — граф узлов на объекте вместо стека деформеров и материала: старые стеки мигрируют в граф,
 * ключи их параметров — на входы узлов, 11 — 3D-сцена на слое и модели документа.
 * Старые версии читаются как один кадр, позиция объекта до версии 5 — это `x`, `y`.
 * Кадры старых файлов без изменений становятся спрайт-треком: у них уже были длительности.
 */
export const FORMAT_VERSION = 11;
/** bp — bytefall project. Расширение осталось от прототипа, чтобы старые файлы открывались. */
export const FILE_EXTENSION = '.bp.json';

const objectsSchema = z.array(objectSchema).max(MAX_OBJECTS);

const frameSchema = z.object({
  id,
  duration: z.number().int().min(MIN_FRAME_DURATION).max(MAX_FRAME_DURATION),
  layers: layersSchema,
  objects: objectsSchema.optional(),
});

const documentSchema = z.object({
  format: z.enum([FORMAT_NAME, ...LEGACY_FORMAT_NAMES]),
  version: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(9),
    z.literal(10),
    z.literal(11),
  ]),
  name: z.string().max(MAX_NAME_LENGTH),
  width: z.number().int().min(MIN_DIMENSION).max(MAX_DIMENSION),
  height: z.number().int().min(MIN_DIMENSION).max(MAX_DIMENSION),
  font: z.string().min(1).max(MAX_ID_LENGTH),
  background: hex.nullable(),
  palette: z.array(hex).max(MAX_PALETTE),
  /** Версии 1 и 2: один кадр в корне. */
  layers: layersSchema.optional(),
  objects: objectsSchema.optional(),
  /** Версия 3. */
  frames: z.array(frameSchema).min(1).max(MAX_FRAMES).optional(),
  /** Версия 6. Без длины сцена длится по кадрам и ключам. */
  fps: z.number().int().min(MIN_FPS).max(MAX_FPS).optional(),
  duration: z.number().min(MIN_SCENE_DURATION).max(MAX_SCENE_DURATION).optional(),
  tracks: tracksSchema.optional(),
  /** Версия 11. */
  meshes: meshesSchema.optional(),
});

export type DocumentFile = z.infer<typeof documentSchema>;
export type FrameFile = z.infer<typeof frameSchema>;

export function toFileObject(anim: Animation): DocumentFile {
  const meshes = usedMeshes(
    anim.meshes,
    anim.frames.flatMap((f) => f.layers),
  );
  return {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    name: anim.name,
    width: anim.width,
    height: anim.height,
    font: anim.font,
    background: anim.background,
    palette: [...anim.palette],
    frames: anim.frames.map((frame) => ({
      id: frame.id,
      duration: frame.duration,
      layers: layersToFile(frame.layers),
      objects: objectsToFile(frame.objects),
    })),
    fps: anim.fps,
    ...(anim.duration !== null ? { duration: anim.duration } : {}),
    ...(anim.tracks.length > 0 ? { tracks: tracksToFile(anim.tracks) } : {}),
    ...(meshes.length > 0 ? { meshes: meshesToFile(meshes) } : {}),
  };
}

export function serialize(anim: Animation): string {
  return JSON.stringify(toFileObject(anim));
}

export function fromFileObject(file: DocumentFile): Animation {
  const size = { width: file.width, height: file.height };
  const migration: DeformerMigration = new Map();
  const meshes = meshesFromFile(file.meshes ?? []);
  const meshIds = new Set(meshes.map((m) => m.id));
  let frames: Frame[];
  if (file.frames) {
    const ids = new Set<string>();
    frames = file.frames.map((frame) => {
      if (ids.has(frame.id)) throw new DocumentFormatError(`Duplicate frame id: ${frame.id}`);
      ids.add(frame.id);
      const layers = layersFromFile(frame.layers, size, meshIds);
      return createFrame(
        layers,
        objectsFromFile(frame.objects ?? [], layers, migration),
        frame.duration,
        frame.id,
      );
    });
    assertSharedLayers(frames);
  } else if (file.layers) {
    const layers = layersFromFile(file.layers, size, meshIds);
    frames = [createFrame(layers, objectsFromFile(file.objects ?? [], layers, migration))];
  } else {
    throw new DocumentFormatError('Document has neither frames nor layers');
  }
  frames = uniqueEffectIds(frames);
  return {
    name: file.name,
    width: file.width,
    height: file.height,
    font: file.font,
    background: file.background,
    palette: file.palette,
    frames,
    fps: file.fps ?? DEFAULT_FPS,
    duration: file.duration ?? null,
    tracks: tracksFromFile(file.tracks ?? [], aliveNodes(frames), {
      nodeKinds: graphNodeKinds(frames),
      migration,
    }),
    meshes,
  };
}

/** Вид каждого узла графов всех кадров: по нему проверяются ключи входов узлов. */
function graphNodeKinds(frames: readonly Frame[]): Map<string, string> {
  const kinds = new Map<string, string>();
  for (const frame of frames) {
    for (const obj of frame.objects)
      for (const n of obj.graph?.nodes ?? []) kinds.set(n.id, n.kind);
  }
  return kinds;
}

export function deserialize(text: string): Animation {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new DocumentFormatError('File is not valid JSON');
  }
  return deserializeObject(raw);
}

/** То же для уже разобранного JSON: открытие файла узнаёт формат по разобранному объекту. */
export function deserializeObject(raw: unknown): Animation {
  const result = documentSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.length ? ` at ${issue.path.join('.')}` : '';
    throw new DocumentFormatError(`Invalid document${path}: ${issue?.message ?? 'unknown error'}`);
  }
  return fromFileObject(result.data);
}

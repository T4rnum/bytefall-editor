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
import {
  type Layer,
  MAX_DIMENSION,
  MAX_LAYERS,
  MAX_PALETTE,
  MIN_DIMENSION,
  newId,
} from './document';
import { MAX_EFFECTS_PER_LAYER } from './effects';
import { effectSchema } from './format/effects';
import { objectSchema, objectsFromFile, objectsToFile } from './format/objects';
import { tracksFromFile, tracksSchema, tracksToFile } from './format/tracks';
import { DEFAULT_FPS, MAX_FPS, MAX_SCENE_DURATION, MIN_FPS, MIN_SCENE_DURATION } from './time';
import {
  DocumentFormatError,
  MAX_CELLS_PER_LAYER,
  MAX_ID_LENGTH,
  MAX_NAME_LENGTH,
  cellSchema,
  cellsFromFile,
  cellsToFile,
  hex,
  id,
} from './format/primitives';
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
 * объекта. Старые версии читаются как один кадр, позиция объекта до версии 5 — это `x`, `y`.
 * Кадры старых файлов без изменений становятся спрайт-треком: у них уже были длительности.
 */
export const FORMAT_VERSION = 6;
/** bp — bytefall project. Расширение осталось от прототипа, чтобы старые файлы открывались. */
export const FILE_EXTENSION = '.bp.json';

const layerSchema = z.object({
  id,
  name: z.string().max(MAX_NAME_LENGTH),
  visible: z.boolean(),
  locked: z.boolean(),
  opacity: z.number().min(0).max(1),
  cells: z.array(cellSchema).max(MAX_CELLS_PER_LAYER),
  effects: z.array(effectSchema).max(MAX_EFFECTS_PER_LAYER).optional(),
});

const layersSchema = z.array(layerSchema).min(1).max(MAX_LAYERS);
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
});

export type DocumentFile = z.infer<typeof documentSchema>;
export type FrameFile = z.infer<typeof frameSchema>;
type LayerFile = z.infer<typeof layerSchema>;

function layersToFile(layers: readonly Layer[]): LayerFile[] {
  return layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    cells: cellsToFile(layer.cells),
    ...(layer.effects.length > 0 ? { effects: [...layer.effects] } : {}),
  }));
}

export function toFileObject(anim: Animation): DocumentFile {
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
  };
}

export function serialize(anim: Animation): string {
  return JSON.stringify(toFileObject(anim));
}

function layersFromFile(
  layers: readonly LayerFile[],
  size: { width: number; height: number },
): Layer[] {
  const ids = new Set<string>();
  return layers.map((layer) => {
    if (ids.has(layer.id)) throw new DocumentFormatError(`Duplicate layer id: ${layer.id}`);
    ids.add(layer.id);
    return {
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity,
      cells: cellsFromFile(layer.cells, size),
      effects: uniqueEffects(layer.id, layer.effects ?? []),
    };
  });
}

function uniqueEffects<T extends { readonly id: string }>(layerId: string, effects: T[]): T[] {
  if (new Set(effects.map((e) => e.id)).size !== effects.length) {
    throw new DocumentFormatError(`Duplicate effect id in layer ${layerId}`);
  }
  return effects;
}

/** Слои общие для всех кадров: одинаковые идентификаторы в одном порядке, иначе операции над слоями разойдутся. */
function assertSharedLayers(frames: readonly Frame[]): void {
  const reference = frames[0].layers.map((l) => l.id).join('\n');
  frames.forEach((frame, index) => {
    if (frame.layers.map((l) => l.id).join('\n') !== reference) {
      throw new DocumentFormatError(`Frame ${index} has different layers than frame 0`);
    }
  });
}

/**
 * Эффекты слоя общие для всех кадров, а ключи находят эффект по идентификатору, поэтому он
 * обязан быть единственным в документе. Копия слоя из старых версий делила идентификаторы
 * эффектов с оригиналом: такие копии получают новые, одинаковые во всех кадрах.
 */
function uniqueEffectIds(frames: readonly Frame[]): Frame[] {
  const seen = new Set<string>();
  const renames = new Map<string, string>();
  for (const layer of frames[0].layers) {
    for (const effect of layer.effects) {
      if (seen.has(effect.id))
        renames.set(
          `${layer.id}
${effect.id}`,
          newId('fx'),
        );
      else seen.add(effect.id);
    }
  }
  if (renames.size === 0) return [...frames];
  return frames.map((frame) => ({
    ...frame,
    layers: frame.layers.map((layer) => ({
      ...layer,
      effects: layer.effects.map((e) => {
        const id = renames.get(`${layer.id}
${e.id}`);
        return id ? { ...e, id } : e;
      }),
    })),
  }));
}

export function fromFileObject(file: DocumentFile): Animation {
  const size = { width: file.width, height: file.height };
  let frames: Frame[];
  if (file.frames) {
    const ids = new Set<string>();
    frames = file.frames.map((frame) => {
      if (ids.has(frame.id)) throw new DocumentFormatError(`Duplicate frame id: ${frame.id}`);
      ids.add(frame.id);
      const layers = layersFromFile(frame.layers, size);
      return createFrame(
        layers,
        objectsFromFile(frame.objects ?? [], layers),
        frame.duration,
        frame.id,
      );
    });
    assertSharedLayers(frames);
  } else if (file.layers) {
    const layers = layersFromFile(file.layers, size);
    frames = [createFrame(layers, objectsFromFile(file.objects ?? [], layers))];
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
    tracks: tracksFromFile(file.tracks ?? [], aliveNodes(frames)),
  };
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

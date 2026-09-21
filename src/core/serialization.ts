import { z } from 'zod';
import {
  type Animation,
  type Frame,
  MAX_FRAMES,
  MAX_FRAME_DURATION,
  MIN_FRAME_DURATION,
  createFrame,
} from './animation';
import { type Cell, makeCell } from './cell';
import { isHexColor } from './color';
import { type Layer, MAX_DIMENSION, MAX_LAYERS, MAX_PALETTE, MIN_DIMENSION } from './document';
import { MAX_EFFECTS_PER_LAYER } from './effects';
import { type CellGrid, type CellKey, keyOf, xOf, yOf } from './grid';
import { MAX_OBJECTS, type SceneObject } from './object';

export const FORMAT_NAME = 'bytefall';
/** Имя формата у прототипа BlendPhoto. Такие файлы читаются, но записываются уже как bytefall. */
export const LEGACY_FORMAT_NAMES = ['blendphoto'] as const;
/** Версия 2 добавила объекты, 3 кадры, 4 эффекты слоёв. Старые версии читаются как один кадр. */
export const FORMAT_VERSION = 4;
/** bp — bytefall project. Расширение осталось от прототипа, чтобы старые файлы открывались. */
export const FILE_EXTENSION = '.bp.json';

/** Лимиты формата: файл из недоверенного источника не должен ронять вкладку. */
export const MAX_NAME_LENGTH = 200;
export const MAX_ID_LENGTH = 64;
export const MAX_GLYPH_LENGTH = 16;
export const MAX_ATTRS_PER_CELL = 32;
export const MAX_ATTR_STRING_LENGTH = 256;
export const MAX_CELLS_PER_LAYER = MAX_DIMENSION * MAX_DIMENSION;

export class DocumentFormatError extends Error {
  override readonly name = 'DocumentFormatError';
}

const hex = z.string().max(9).refine(isHexColor, 'Expected hex color like #rrggbb');
const id = z.string().min(1).max(MAX_ID_LENGTH);
const coordinate = z
  .number()
  .int()
  .min(0)
  .max(MAX_DIMENSION - 1);
const position = z.number().int().min(-MAX_DIMENSION).max(MAX_DIMENSION);
const attrValue = z.union([
  z.string().max(MAX_ATTR_STRING_LENGTH),
  z.number().finite(),
  z.boolean(),
]);
const attrs = z
  .record(z.string().max(MAX_ID_LENGTH), attrValue)
  .refine(
    (a) => Object.keys(a).length <= MAX_ATTRS_PER_CELL,
    `At most ${MAX_ATTRS_PER_CELL} attrs per cell`,
  );

const cellSchema = z.object({
  x: coordinate,
  y: coordinate,
  g: z.string().max(MAX_GLYPH_LENGTH),
  f: hex,
  b: hex.nullable().optional(),
  a: attrs.optional(),
});

const periodMs = z.number().min(10).max(600000);
const unit = z.number().min(0).max(1);
const effectBase = { id, enabled: z.boolean() };
const effectSchema = z.discriminatedUnion('kind', [
  z.object({
    ...effectBase,
    kind: z.literal('pulse'),
    period: periodMs,
    amplitude: unit,
    spread: z.number().min(-10).max(10),
  }),
  z.object({
    ...effectBase,
    kind: z.literal('wave'),
    period: periodMs,
    amplitude: z.number().min(0).max(64),
    wavelength: z.number().min(1).max(MAX_DIMENSION),
  }),
  z.object({ ...effectBase, kind: z.literal('flicker'), period: periodMs, density: unit }),
  z.object({
    ...effectBase,
    kind: z.literal('scroll'),
    dx: z.number().min(-1000).max(1000),
    dy: z.number().min(-1000).max(1000),
    wrap: z.boolean(),
  }),
  z.object({
    ...effectBase,
    kind: z.literal('cycle'),
    glyphs: z.string().max(64),
    period: periodMs,
    spread: z.number().min(-10).max(10),
  }),
  z.object({
    ...effectBase,
    kind: z.literal('fire'),
    height: z.number().int().min(1).max(64),
    period: periodMs,
    palette: z.enum(['fire', 'ice', 'toxic']),
    glyphs: z.string().min(1).max(32),
  }),
]);

const layerSchema = z.object({
  id,
  name: z.string().max(MAX_NAME_LENGTH),
  visible: z.boolean(),
  locked: z.boolean(),
  opacity: z.number().min(0).max(1),
  cells: z.array(cellSchema).max(MAX_CELLS_PER_LAYER),
  effects: z.array(effectSchema).max(MAX_EFFECTS_PER_LAYER).optional(),
});

const objectSchema = z.object({
  id,
  name: z.string().max(MAX_NAME_LENGTH),
  layerId: id,
  x: position,
  y: position,
  visible: z.boolean(),
  locked: z.boolean(),
  cells: z.array(cellSchema).max(MAX_CELLS_PER_LAYER),
  props: attrs.optional(),
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
  version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
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
});

export type DocumentFile = z.infer<typeof documentSchema>;
export type FrameFile = z.infer<typeof frameSchema>;
type CellFile = z.infer<typeof cellSchema>;
type LayerFile = z.infer<typeof layerSchema>;
type ObjectFile = z.infer<typeof objectSchema>;

function cellsToFile(grid: CellGrid): CellFile[] {
  return [...grid.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, cell]) => ({
      x: xOf(key),
      y: yOf(key),
      g: cell.glyph,
      f: cell.fg,
      ...(cell.bg !== null ? { b: cell.bg } : {}),
      ...(cell.attrs ? { a: cell.attrs } : {}),
    }));
}

/** Ячейки за пределами limit отбрасываются; для объектов ограничения по холсту нет. */
function cellsFromFile(
  cells: readonly CellFile[],
  limit?: { width: number; height: number },
): CellGrid {
  const grid = new Map<CellKey, Cell>();
  for (const c of cells) {
    if (limit && (c.x >= limit.width || c.y >= limit.height)) continue;
    grid.set(keyOf(c.x, c.y), makeCell(c.g, c.f, c.b ?? null, c.a));
  }
  return grid;
}

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

function objectsToFile(objects: readonly SceneObject[]): ObjectFile[] {
  return objects.map((obj) => ({
    id: obj.id,
    name: obj.name,
    layerId: obj.layerId,
    x: obj.x,
    y: obj.y,
    visible: obj.visible,
    locked: obj.locked,
    cells: cellsToFile(obj.cells),
    ...(Object.keys(obj.props).length > 0 ? { props: obj.props } : {}),
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

function objectsFromFile(objects: readonly ObjectFile[], layers: readonly Layer[]): SceneObject[] {
  const layerIds = new Set(layers.map((l) => l.id));
  const ids = new Set<string>();
  return objects.map((obj) => {
    if (ids.has(obj.id)) throw new DocumentFormatError(`Duplicate object id: ${obj.id}`);
    if (!layerIds.has(obj.layerId)) {
      throw new DocumentFormatError(`Object ${obj.id} references unknown layer ${obj.layerId}`);
    }
    ids.add(obj.id);
    return {
      id: obj.id,
      name: obj.name,
      layerId: obj.layerId,
      x: obj.x,
      y: obj.y,
      visible: obj.visible,
      locked: obj.locked,
      cells: cellsFromFile(obj.cells),
      props: obj.props ?? {},
    };
  });
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
  return {
    name: file.name,
    width: file.width,
    height: file.height,
    font: file.font,
    background: file.background,
    palette: file.palette,
    frames,
  };
}

export function deserialize(text: string): Animation {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new DocumentFormatError('File is not valid JSON');
  }
  const result = documentSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.length ? ` at ${issue.path.join('.')}` : '';
    throw new DocumentFormatError(`Invalid document${path}: ${issue?.message ?? 'unknown error'}`);
  }
  return fromFileObject(result.data);
}

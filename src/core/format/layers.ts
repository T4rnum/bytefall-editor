import { z } from 'zod';
import type { Frame } from '../animation';
import { type Layer, MAX_LAYERS, newId } from '../document';
import { MAX_EFFECTS_PER_LAYER } from '../effects';
import { effectSchema } from './effects';
import {
  DocumentFormatError,
  MAX_CELLS_PER_LAYER,
  MAX_NAME_LENGTH,
  cellSchema,
  cellsFromFile,
  cellsToFile,
  id,
} from './primitives';
import { scene3dFromFile, scene3dSchema, scene3dToFile } from './scene3d';

/**
 * Слои в файле: ячейки, эффекты и с версии 11 — 3D-сцена. Слои общие для всех кадров, эффекты и
 * тела сцены ключи находят по идентификатору.
 */
const layerSchema = z.object({
  id,
  name: z.string().max(MAX_NAME_LENGTH),
  visible: z.boolean(),
  locked: z.boolean(),
  opacity: z.number().min(0).max(1),
  cells: z.array(cellSchema).max(MAX_CELLS_PER_LAYER),
  effects: z.array(effectSchema).max(MAX_EFFECTS_PER_LAYER).optional(),
  /** Версия 11. */
  scene: scene3dSchema.optional(),
});

export const layersSchema = z.array(layerSchema).min(1).max(MAX_LAYERS);

type LayerFile = z.infer<typeof layerSchema>;
export function layersToFile(layers: readonly Layer[]): LayerFile[] {
  return layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    cells: cellsToFile(layer.cells),
    ...(layer.effects.length > 0 ? { effects: [...layer.effects] } : {}),
    ...(layer.scene ? { scene: scene3dToFile(layer.scene) } : {}),
  }));
}

export function layersFromFile(
  layers: readonly LayerFile[],
  size: { width: number; height: number },
  meshes: ReadonlySet<string>,
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
      scene: layer.scene ? scene3dFromFile(layer.scene, layer.id, meshes) : null,
    };
  });
}

function uniqueEffects<T extends { readonly id: string }>(layerId: string, effects: T[]): T[] {
  if (new Set(effects.map((e) => e.id)).size !== effects.length) {
    throw new DocumentFormatError(`Duplicate effect id in layer ${layerId}`);
  }
  return effects;
}

export /** Слои общие для всех кадров: одинаковые идентификаторы в одном порядке, иначе операции над слоями разойдутся. */
function assertSharedLayers(frames: readonly Frame[]): void {
  const reference = frames[0].layers.map((l) => l.id).join('\n');
  frames.forEach((frame, index) => {
    if (frame.layers.map((l) => l.id).join('\n') !== reference) {
      throw new DocumentFormatError(`Frame ${index} has different layers than frame 0`);
    }
  });
}

export /**
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

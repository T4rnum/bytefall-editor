import type { Document, Layer } from '../document';
import { valueAt } from '../interpolate';
import { type Track, nodeKey } from '../tracks';
import {
  findNode3D,
  readNode3DValue,
  readScene3DValue,
  updateNode3D,
  writeNode3DValue,
  writeScene3DValue,
} from './scene';
import type { Node3D, Scene3D } from './types';

/**
 * Сцена слоя в момент `time`: камера и свет по трекам слоя, тела — по своим. Без треков
 * возвращается та же сцена: рендер узнаёт неподвижную сцену по ссылке и не считает её заново.
 */
export function animateScene3D(
  layer: Layer,
  index: ReadonlyMap<string, readonly Track[]>,
  time: number,
): Scene3D | null {
  const scene = layer.scene;
  if (!scene) return null;
  let out = scene;
  for (const track of index.get(nodeKey('scene3d', layer.id)) ?? []) {
    if (track.node === 'scene3d')
      out = writeScene3DValue(out, track.property, valueAt(track, time));
  }
  for (const node of scene.nodes) {
    const own = index.get(nodeKey('body3d', node.id));
    if (!own) continue;
    out = updateNode3D(out, node.id, (n) =>
      own.reduce(
        (acc, track) =>
          track.node === 'body3d'
            ? writeNode3DValue(acc, track.property, valueAt(track, time))
            : acc,
        n,
      ),
    );
  }
  return out;
}

/** Тело 3D-сцены с таким идентификатором и его слой. */
export function findBody3D(
  doc: Document,
  id: string,
): { readonly layer: Layer; readonly node: Node3D } | undefined {
  for (const layer of doc.layers) {
    const node = layer.scene && findNode3D(layer.scene, id);
    if (node) return { layer, node };
  }
  return undefined;
}

export function readBody3DTarget(
  doc: Document,
  id: string,
  property: Parameters<typeof readNode3DValue>[1],
): number[] | null {
  const found = findBody3D(doc, id);
  return found ? readNode3DValue(found.node, property) : null;
}

export function readScene3DTarget(
  doc: Document,
  layerId: string,
  property: Parameters<typeof readScene3DValue>[1],
): number[] | null {
  const scene = doc.layers.find((l) => l.id === layerId)?.scene;
  return scene ? readScene3DValue(scene, property) : null;
}

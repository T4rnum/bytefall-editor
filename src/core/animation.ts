import {
  type Document,
  type Layer,
  type ResizeAnchor,
  duplicateLayer,
  newId,
  resizeDocument,
  resizeOffset,
} from './document';
import { emptyGrid } from './grid';
import type { SceneObject } from './object';
import { DEFAULT_FPS } from './time';
import { type Track, copyTracks, nodeKey, shiftPositionKeys } from './tracks';

/** Кадр: собственный растр слоёв и собственные объекты. Метаданные слоёв общие для всех кадров. */
export interface Frame {
  readonly id: string;
  /** Длительность показа в миллисекундах. */
  readonly duration: number;
  readonly layers: readonly Layer[];
  readonly objects: readonly SceneObject[];
}

/**
 * Анимация: заголовок документа, кадры и треки ключей. Кадр — это тот же Document, поэтому
 * инструменты, композитор и объекты работают с кадром, ничего не зная про анимацию.
 *
 * Время сцены — миллисекунды. Кадры образуют спрайт-трек (`core/timeline.ts`): кадр держится
 * свою длительность. Треки (`core/tracks.ts`) ведут свойства узлов между ключами, а что видно в
 * момент `t`, считает `evaluate` из `core/evaluate.ts`.
 */
export interface Animation {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly font: string;
  readonly background: string | null;
  readonly palette: readonly string[];
  readonly frames: readonly Frame[];
  /** Частота кадров сцены: с ней проигрывается и экспортируется движение. */
  readonly fps: number;
  /** Длина сцены в миллисекундах; null — по кадрам и ключам, см. `sceneDuration`. */
  readonly duration: number | null;
  readonly tracks: readonly Track[];
}

export const DEFAULT_FRAME_DURATION = 100;
export const MIN_FRAME_DURATION = 20;
export const MAX_FRAME_DURATION = 10000;
export const MAX_FRAMES = 512;

export function createFrame(
  layers: readonly Layer[],
  objects: readonly SceneObject[] = [],
  duration: number = DEFAULT_FRAME_DURATION,
  id: string = newId('frame'),
): Frame {
  return { id, duration, layers, objects };
}

export function createAnimation(doc: Document): Animation {
  return {
    name: doc.name,
    width: doc.width,
    height: doc.height,
    font: doc.font,
    background: doc.background,
    palette: doc.palette,
    frames: [createFrame(doc.layers, doc.objects)],
    fps: DEFAULT_FPS,
    duration: null,
    tracks: [],
  };
}

function frameAt(anim: Animation, index: number): Frame {
  const frame = anim.frames[index];
  if (!frame) throw new RangeError(`No frame at index ${index}`);
  return frame;
}

export function clampFrameIndex(anim: Animation, index: number): number {
  return Math.max(0, Math.min(anim.frames.length - 1, Math.floor(index)));
}

/** Кадр как обычный документ: заголовок анимации плюс содержимое кадра. */
export function frameDocument(anim: Animation, index: number): Document {
  const frame = frameAt(anim, index);
  return {
    version: 1,
    name: anim.name,
    width: anim.width,
    height: anim.height,
    font: anim.font,
    background: anim.background,
    palette: anim.palette,
    layers: frame.layers,
    objects: frame.objects,
  };
}

/** Записывает документ обратно: содержимое в кадр, заголовок в анимацию. */
export function withFrameDocument(anim: Animation, index: number, doc: Document): Animation {
  const frame = frameAt(anim, index);
  const frames = anim.frames.slice();
  frames[index] = { ...frame, layers: doc.layers, objects: doc.objects };
  return {
    ...anim,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    font: doc.font,
    background: doc.background,
    palette: doc.palette,
    frames,
  };
}

/**
 * Меняет размер холста во всех кадрах. Сдвиг от якоря считается один раз, по прежнему размеру:
 * через `mapFrames` это не сделать, там со второго кадра размер в заголовке уже новый, и
 * содержимое остальных кадров не сдвинулось бы.
 */
export function resizeAnimation(
  anim: Animation,
  width: number,
  height: number,
  anchor: ResizeAnchor = 'top-left',
): Animation {
  if (width === anim.width && height === anim.height) return anim;
  const frames = anim.frames.map((frame, index) => {
    const resized = resizeDocument(frameDocument(anim, index), width, height, anchor);
    return { ...frame, layers: resized.layers, objects: resized.objects };
  });
  // Ключи положения объектов в корне едут вместе с объектами, иначе анимированный объект
  // остался бы на прежнем месте относительно нового края холста.
  const offset = resizeOffset(anim, width, height, anchor);
  const roots = new Set<string>();
  for (const frame of anim.frames) {
    for (const obj of frame.objects) if (obj.parentId === null) roots.add(obj.id);
  }
  const tracks = shiftPositionKeys(anim.tracks, roots, offset.x, offset.y);
  return { ...anim, width, height, frames, tracks };
}

/**
 * Применяет операцию над документом к каждому кадру: так слои остаются одинаковыми во всех
 * кадрах. Кадр, который операция вернула без изменений, остаётся тем же объектом: по ссылке на
 * кадр узнают, какую миниатюру пересчитать.
 */
export function mapFrames(
  anim: Animation,
  fn: (doc: Document, index: number) => Document,
): Animation {
  let next = anim;
  for (let i = 0; i < anim.frames.length; i++) {
    const doc = frameDocument(next, i);
    const out = fn(doc, i);
    if (out !== doc) next = withFrameDocument(next, i, out);
  }
  return next;
}

/** Кадр с теми же слоями, но без ячеек и объектов. */
export function emptyFrameLike(frame: Frame, id: string = newId('frame')): Frame {
  return {
    id,
    duration: frame.duration,
    layers: frame.layers.map((layer) => ({ ...layer, cells: emptyGrid() })),
    objects: [],
  };
}

/** Вставляет новый кадр после index: копию исходного или пустой с теми же слоями. */
export function addFrame(
  anim: Animation,
  index: number,
  mode: 'duplicate' | 'empty' = 'duplicate',
): Animation {
  if (anim.frames.length >= MAX_FRAMES) throw new Error(`At most ${MAX_FRAMES} frames`);
  const source = frameAt(anim, index);
  const frame = mode === 'duplicate' ? { ...source, id: newId('frame') } : emptyFrameLike(source);
  const frames = anim.frames.slice();
  frames.splice(index + 1, 0, frame);
  return { ...anim, frames };
}

export function removeFrame(anim: Animation, index: number): Animation {
  if (anim.frames.length <= 1) throw new Error('Cannot remove the last frame');
  frameAt(anim, index);
  return { ...anim, frames: anim.frames.filter((_, i) => i !== index) };
}

export function moveFrame(anim: Animation, from: number, to: number): Animation {
  const frame = frameAt(anim, from);
  const target = clampFrameIndex(anim, to);
  if (from === target) return anim;
  const frames = anim.frames.slice();
  frames.splice(from, 1);
  frames.splice(target, 0, frame);
  return { ...anim, frames };
}

export function setFrameDuration(anim: Animation, index: number, duration: number): Animation {
  const frame = frameAt(anim, index);
  const clamped = Math.round(Math.max(MIN_FRAME_DURATION, Math.min(MAX_FRAME_DURATION, duration)));
  if (!Number.isFinite(clamped) || clamped === frame.duration) return anim;
  const frames = anim.frames.slice();
  frames[index] = { ...frame, duration: clamped };
  return { ...anim, frames };
}

/**
 * Копия слоя во всех кадрах. Объекты и эффекты копии получают новые идентификаторы, одни на все
 * кадры: объект, который есть в нескольких кадрах, остаётся в копии одним объектом. Ключи
 * оригинала копируются, и копия двигается так же.
 */
export function duplicateAnimationLayer(
  anim: Animation,
  layerId: string,
  copyId: string = newId('layer'),
): Animation {
  const layer = anim.frames[0].layers.find((l) => l.id === layerId);
  if (!layer) return anim;
  const objects = new Map<string, string>();
  for (const frame of anim.frames) {
    for (const obj of frame.objects) {
      if (obj.layerId === layerId && !objects.has(obj.id)) objects.set(obj.id, newId('object'));
    }
  }
  const effects = new Map(layer.effects.map((e) => [e.id, newId('fx')]));
  const next = mapFrames(anim, (doc) => duplicateLayer(doc, layerId, copyId, { objects, effects }));
  let tracks = copyTracks(next.tracks, 'object', objects);
  tracks = copyTracks(tracks, 'effect', effects);
  tracks = copyTracks(tracks, 'layer', new Map([[layerId, copyId]]));
  return { ...next, tracks };
}

/** Узлы, на которые могут ссылаться треки: объекты всех кадров, слои и их эффекты. */
export function aliveNodes(frames: readonly Frame[]): Set<string> {
  const alive = new Set<string>();
  for (const frame of frames) {
    for (const obj of frame.objects) alive.add(nodeKey('object', obj.id));
    for (const layer of frame.layers) {
      alive.add(nodeKey('layer', layer.id));
      for (const effect of layer.effects) alive.add(nodeKey('effect', effect.id));
    }
  }
  return alive;
}

export function animationDuration(anim: Animation): number {
  return anim.frames.reduce((sum, frame) => sum + frame.duration, 0);
}

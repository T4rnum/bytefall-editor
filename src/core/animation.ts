import { type Document, type Layer, newId } from './document';
import { emptyGrid } from './grid';
import type { SceneObject } from './object';

/** Кадр: собственный растр слоёв и собственные объекты. Метаданные слоёв общие для всех кадров. */
export interface Frame {
  readonly id: string;
  /** Длительность показа в миллисекундах. */
  readonly duration: number;
  readonly layers: readonly Layer[];
  readonly objects: readonly SceneObject[];
}

/**
 * Анимация: заголовок документа плюс кадры. Кадр это тот же Document, поэтому инструменты,
 * композитор и объекты работают с текущим кадром, ничего не зная про анимацию.
 */
export interface Animation {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly font: string;
  readonly background: string | null;
  readonly palette: readonly string[];
  readonly frames: readonly Frame[];
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

/** Применяет операцию над документом к каждому кадру: так слои остаются одинаковыми во всех кадрах. */
export function mapFrames(
  anim: Animation,
  fn: (doc: Document, index: number) => Document,
): Animation {
  let next = anim;
  for (let i = 0; i < anim.frames.length; i++) {
    next = withFrameDocument(next, i, fn(frameDocument(next, i), i));
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

export function animationDuration(anim: Animation): number {
  return anim.frames.reduce((sum, frame) => sum + frame.duration, 0);
}

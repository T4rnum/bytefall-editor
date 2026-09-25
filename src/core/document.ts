import type { Pose } from './constraints';
import type { LayerEffect } from './effects';
import type { Point } from './geometry';
import { type CellGrid, emptyGrid, shiftGrid } from './grid';
import type { SceneObject } from './object';

export interface Layer {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
  /** 0..1 */
  readonly opacity: number;
  readonly cells: CellGrid;
  /** Неразрушающие эффекты, общие для всех кадров, см. core/effects.ts. */
  readonly effects: readonly LayerEffect[];
}

/**
 * Документ целиком неизменяем: любая операция возвращает новый объект. Слои идут снизу вверх,
 * объекты живут поверх растра своего слоя в порядке массива.
 */
export interface Document {
  readonly version: 1;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** Идентификатор шрифта, см. src/render/font. */
  readonly font: string;
  /** Цвет холста, hex, либо null для прозрачного. */
  readonly background: string | null;
  readonly palette: readonly string[];
  readonly layers: readonly Layer[];
  readonly objects: readonly SceneObject[];
  /**
   * Поза рига: входы связей из других моментов времени, см. `core/pose.ts`. Есть только у сцены,
   * вычисленной `evaluate`, и в файл не пишется.
   */
  readonly pose?: Pose;
}

export const MIN_DIMENSION = 1;
export const MAX_DIMENSION = 1024;
export const MAX_LAYERS = 256;
export const MAX_PALETTE = 256;
export const DEFAULT_FONT = 'press-start-2p';

/** Палитра PICO-8: контрастная и хорошо смотрится на пиксельном шрифте. */
export const DEFAULT_PALETTE: readonly string[] = [
  '#000000',
  '#1d2b53',
  '#7e2553',
  '#008751',
  '#ab5236',
  '#5f574f',
  '#c2c3c7',
  '#fff1e8',
  '#ff004d',
  '#ffa300',
  '#ffec27',
  '#00e436',
  '#29adff',
  '#83769c',
  '#ff77a8',
  '#ffccaa',
];

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function assertDimension(value: number, label: string): void {
  if (!Number.isInteger(value) || value < MIN_DIMENSION || value > MAX_DIMENSION) {
    throw new RangeError(`${label} must be an integer in [${MIN_DIMENSION}, ${MAX_DIMENSION}]`);
  }
}

export function createLayer(name: string, id: string = newId('layer')): Layer {
  return { id, name, visible: true, locked: false, opacity: 1, cells: emptyGrid(), effects: [] };
}

/** Слой можно редактировать, только если он виден и не заблокирован. */
export const canEditLayer = (layer: Layer | undefined): layer is Layer =>
  layer !== undefined && layer.visible && !layer.locked;

export interface CreateDocumentOptions {
  readonly name?: string;
  readonly width?: number;
  readonly height?: number;
  readonly background?: string | null;
}

export function createDocument(options: CreateDocumentOptions = {}): Document {
  const width = options.width ?? 64;
  const height = options.height ?? 32;
  assertDimension(width, 'width');
  assertDimension(height, 'height');
  return {
    version: 1,
    name: options.name ?? 'Без названия',
    width,
    height,
    font: DEFAULT_FONT,
    background: options.background === undefined ? '#000000' : options.background,
    palette: DEFAULT_PALETTE,
    layers: [createLayer('Слой 1')],
    objects: [],
  };
}

export function findLayer(doc: Document, id: string): Layer | undefined {
  return doc.layers.find((l) => l.id === id);
}

export function layerIndex(doc: Document, id: string): number {
  return doc.layers.findIndex((l) => l.id === id);
}

export function updateLayer(
  doc: Document,
  id: string,
  patch: Partial<Omit<Layer, 'id'>>,
): Document {
  const index = layerIndex(doc, id);
  if (index === -1) return doc;
  const layers = doc.layers.slice();
  layers[index] = { ...layers[index], ...patch };
  return { ...doc, layers };
}

export function setLayerCells(doc: Document, id: string, cells: CellGrid): Document {
  return updateLayer(doc, id, { cells });
}

/** Вставляет слой на позицию index, по умолчанию наверх. */
export function addLayer(doc: Document, layer: Layer, index: number = doc.layers.length): Document {
  if (findLayer(doc, layer.id)) throw new Error(`Duplicate layer id: ${layer.id}`);
  if (doc.layers.length >= MAX_LAYERS) throw new Error(`At most ${MAX_LAYERS} layers`);
  const layers = doc.layers.slice();
  layers.splice(Math.max(0, Math.min(index, layers.length)), 0, layer);
  return { ...doc, layers };
}

/**
 * Удаляет слой вместе с его объектами. Детей этих объектов с других слоёв не трогает: приложение
 * удаляет слой через `removeLayerKeepingChildren` из `hierarchy.ts`.
 */
export function removeLayer(doc: Document, id: string): Document {
  if (doc.layers.length <= 1) throw new Error('Cannot remove the last layer');
  const layers = doc.layers.filter((l) => l.id !== id);
  if (layers.length === doc.layers.length) return doc;
  return { ...doc, layers, objects: doc.objects.filter((o) => o.layerId !== id) };
}

export function moveLayer(doc: Document, id: string, toIndex: number): Document {
  const from = layerIndex(doc, id);
  if (from === -1) return doc;
  const to = Math.max(0, Math.min(toIndex, doc.layers.length - 1));
  if (from === to) return doc;
  const layers = doc.layers.slice();
  const [layer] = layers.splice(from, 1);
  layers.splice(to, 0, layer);
  return { ...doc, layers };
}

/** Новые идентификаторы объектов и эффектов копии слоя: общие для всех кадров анимации. */
export interface CopyIds {
  readonly objects?: ReadonlyMap<string, string>;
  readonly effects?: ReadonlyMap<string, string>;
  readonly deformers?: ReadonlyMap<string, string>;
}

/**
 * Дублирует слой вместе с его объектами и эффектами: копии получают новые идентификаторы.
 * Идентификаторы можно задать снаружи, чтобы они совпадали во всех кадрах анимации: объект с
 * одним id в разных кадрах — это один объект, и ключи ведут его сквозь кадры.
 */
export function duplicateLayer(
  doc: Document,
  id: string,
  copyId: string = newId('layer'),
  ids: CopyIds = {},
): Document {
  const index = layerIndex(doc, id);
  if (index === -1) return doc;
  const source = doc.layers[index];
  const effects = source.effects.map((e) => ({ ...e, id: ids.effects?.get(e.id) ?? newId('fx') }));
  const copy: Layer = { ...source, id: copyId, name: `${source.name} copy`, effects };
  const withLayer = addLayer(doc, copy, index + 1);
  const sources = doc.objects.filter((o) => o.layerId === id);
  const renamed = new Map(sources.map((o) => [o.id, ids.objects?.get(o.id) ?? newId('object')]));
  // Родитель, скопированный вместе с ребёнком, остаётся его родителем и в копии.
  const copies = sources.map((o) => ({
    ...o,
    id: renamed.get(o.id) as string,
    // Деформеры копии — свои: ключи находят деформер по идентификатору. Без импорта
    // deformers.ts: он сам зависит от document.ts, и цикл сломал бы порядок загрузки.
    deformers: o.deformers.map((d) => ({ ...d, id: ids.deformers?.get(d.id) ?? newId('deform') })),
    // Цель, скопированная вместе с объектом, — это копия цели: копия рига тянется за своим
    // контроллером, а не за чужим.
    constraints: o.constraints.map((c) =>
      c.kind !== 'follow' && c.target !== null && renamed.has(c.target)
        ? { ...c, target: renamed.get(c.target) as string }
        : c,
    ),
    layerId: copy.id,
    parentId: (o.parentId !== null && renamed.get(o.parentId)) || o.parentId,
  }));
  return copies.length === 0
    ? withLayer
    : { ...withLayer, objects: [...withLayer.objects, ...copies] };
}

/** Куда прижимается прежнее содержимое, когда холст меняет размер. */
export type ResizeAnchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

/** Доля прироста, которая уходит влево и вверх. Остальное достаётся правому и нижнему краю. */
const ANCHOR_FACTORS: Readonly<Record<ResizeAnchor, readonly [number, number]>> = {
  'top-left': [0, 0],
  top: [0.5, 0],
  'top-right': [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  'bottom-left': [0, 1],
  bottom: [0.5, 1],
  'bottom-right': [1, 1],
};

/** Сдвиг прежнего содержимого в новых координатах. Документ целиком тут не нужен: только размер. */
export function resizeOffset(
  from: { readonly width: number; readonly height: number },
  width: number,
  height: number,
  anchor: ResizeAnchor,
): Point {
  const [fx, fy] = ANCHOR_FACTORS[anchor];
  return {
    x: Math.round((width - from.width) * fx),
    y: Math.round((height - from.height) * fy),
  };
}

/**
 * Меняет размер холста. Содержимое прижимается к якорю, ячейки за новыми границами
 * отбрасываются. Объекты едут вместе с растром: иначе при якоре не в левом верхнем углу
 * рисунок разъехался бы сам с собой.
 */
export function resizeDocument(
  doc: Document,
  width: number,
  height: number,
  anchor: ResizeAnchor = 'top-left',
): Document {
  assertDimension(width, 'width');
  assertDimension(height, 'height');
  if (width === doc.width && height === doc.height) return doc;
  const { x: dx, y: dy } = resizeOffset(doc, width, height, anchor);
  return {
    ...doc,
    width,
    height,
    layers: doc.layers.map((l) => ({ ...l, cells: shiftGrid(l.cells, dx, dy, width, height) })),
    // Дети едут вместе с родителем: их позиция задана относительно него.
    objects: doc.objects.map((o) =>
      (dx === 0 && dy === 0) || o.parentId !== null
        ? o
        : { ...o, transform: { ...o.transform, x: o.transform.x + dx, y: o.transform.y + dy } },
    ),
  };
}

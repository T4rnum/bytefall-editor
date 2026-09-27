import type { Cell } from '../cell';
import type { Document, Layer } from '../document';
import { type CellGrid, type CellKey, emptyGrid } from '../grid';
import { type QuantizeOptions, quantize, sampleImage, subsamplesFor } from '../quantize';
import type { Mesh3D, Scene3D } from './types';

/**
 * Рендер 3D-сцены в ячейки. Картинку рисует GPU (`render/scene3d`), поэтому ядро знает только
 * вызов: приложение подставляет его при запуске (`setScene3DRenderer`), а композитор, экспорт,
 * текст и миниатюры зовут одну и ту же функцию — экран и экспорт не расходятся (правило 4).
 * Без подставленного рендера 3D-слой пуст: так работают тесты ядра и node.
 */
export interface Scene3DRequest {
  readonly scene: Scene3D;
  /** Размер холста в ячейках. */
  readonly width: number;
  readonly height: number;
  readonly meshes: readonly Mesh3D[];
}

/**
 * Буферы рендера: `sub` × `sub` пикселей на ячейку (`renderSubsamples`), строками сверху вниз.
 * Цвет RGBA байтами без домножения на альфу, нормаль — три числа в координатах камеры, глубина —
 * 0 у камеры, 1 — пусто.
 */
export interface RenderBuffers {
  readonly width: number;
  readonly height: number;
  readonly sub: number;
  readonly rgba: Uint8Array;
  readonly normal: Float32Array;
  readonly depth: Float32Array;
}

export type Scene3DRenderer = (request: Scene3DRequest) => CellGrid;

let renderer: Scene3DRenderer | null = null;
/** Последний рендер каждой сцены: неподвижная сцена — та же ссылка, и GPU не трогается. */
let cache = new WeakMap<Scene3D, { key: string; meshes: readonly Mesh3D[]; cells: CellGrid }>();

export function setScene3DRenderer(next: Scene3DRenderer | null): void {
  renderer = next;
  cache = new WeakMap();
}

/** Ячейки 3D-слоя в документе: рендер его сцены или, без рендера, пустая сетка. */
export function scene3DCells(layer: Layer, doc: Document): CellGrid {
  const scene = layer.scene;
  if (!scene || !renderer) return emptyGrid();
  const key = `${doc.width}x${doc.height}`;
  const known = cache.get(scene);
  if (known && known.key === key && known.meshes === doc.meshes) return known.cells;
  const cells = renderer({ scene, width: doc.width, height: doc.height, meshes: doc.meshes });
  cache.set(scene, { key, meshes: doc.meshes, cells });
  return cells;
}

/**
 * Пикселей рендера на сторону ячейки: два. Контуру хватает двух линий образцов, цвету — среднего
 * по четырём, а вчетверо меньше пикселей, чем у импорта картинки, — это кадр анимации, а не
 * разовая конвертация.
 */
export const renderSubsamples = (width: number, height: number): number =>
  Math.min(2, subsamplesFor(width, height));

/**
 * Во сколько раз перепад глубины весит больше перепада яркости у картинки: глубина — доли всего
 * размаха сцены, и край тела в них невелик.
 */
const DEPTH_WEIGHT = 4;

/**
 * Буферы рендера в ячейки: цвет — как у картинки, контуры — по глубине и нормалям. Чистая
 * функция: одинаковые буферы дают одинаковые ячейки.
 */
export function buffersToCells(b: RenderBuffers, options: QuantizeOptions): Map<CellKey, Cell> {
  const image = { width: b.width * b.sub, height: b.height * b.sub, data: b.rgba };
  const samples = sampleImage(image, b.width, b.height, b.sub);
  const depth = b.depth.map((d) => d * DEPTH_WEIGHT);
  return quantize({ ...samples, geometry: { depth, normal: b.normal } }, options);
}

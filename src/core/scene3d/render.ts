import type { Cell } from '../cell';
import type { Document, Layer } from '../document';
import { type CellGrid, type CellKey, emptyGrid } from '../grid';
import { type QuantizeOptions, quantize, sampleImage, subsamplesFor } from '../quantize';
import { type Sprite3D, cloudSprites, gridCells } from './glyphs';
import type { Mesh3D, Scene3D } from './types';

/**
 * 3D-сцена слоя в символы. Режим A рисует GPU (`render/scene3d`), поэтому ядро знает только
 * вызов: приложение подставляет его при запуске (`setScene3DRenderer`). Без него слой режима A
 * пуст: так работают тесты ядра и node. Режим B ядро считает само, без GPU. Композитор, экспорт,
 * текст и миниатюры зовут одну и ту же функцию — экран и экспорт не расходятся (правило 4).
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

/** Что даёт сцена: ячейки слоя (режим A и сетка режима B) или облако символов поверх него. */
export interface Scene3DView {
  readonly cells: CellGrid;
  /** От дальних к ближним. */
  readonly sprites: readonly Sprite3D[];
}

const EMPTY_VIEW: Scene3DView = { cells: emptyGrid(), sprites: [] };

let renderer: Scene3DRenderer | null = null;
/** Последний рендер каждой сцены: неподвижная сцена — та же ссылка, и она не пересчитывается. */
let cache = new WeakMap<Scene3D, { key: string; meshes: readonly Mesh3D[]; view: Scene3DView }>();

export function setScene3DRenderer(next: Scene3DRenderer | null): void {
  renderer = next;
  cache = new WeakMap();
}

function computeView(scene: Scene3D, doc: Document): Scene3DView {
  const { width, height, meshes } = doc;
  switch (scene.render.mode) {
    case 'raster':
      return renderer
        ? { cells: renderer({ scene, width, height, meshes }), sprites: [] }
        : EMPTY_VIEW;
    case 'grid':
      return { cells: gridCells(scene, width, height, meshes), sprites: [] };
    case 'cloud':
      return { cells: emptyGrid(), sprites: cloudSprites(scene, width, height, meshes) };
  }
}

/** Символы 3D-слоя в документе; у слоя без сцены — пусто. */
export function scene3DView(layer: Layer, doc: Document): Scene3DView {
  const scene = layer.scene;
  if (!scene) return EMPTY_VIEW;
  const key = `${doc.width}x${doc.height}`;
  const known = cache.get(scene);
  if (known && known.key === key && known.meshes === doc.meshes) return known.view;
  const view = computeView(scene, doc);
  // Без рендера режима A кэшировать нечего: его подставят позже, и сцена должна отрисоваться.
  if (view !== EMPTY_VIEW) cache.set(scene, { key, meshes: doc.meshes, view });
  return view;
}

/** Ячейки 3D-слоя: у облака их нет, оно идёт символами поверх. */
export const scene3DCells = (layer: Layer, doc: Document): CellGrid =>
  scene3DView(layer, doc).cells;

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

import type { Rect } from './geometry';
import { type CellGrid, type CellKey, xOf, yOf } from './grid';

/**
 * Разбиение холста на тайлы. Нужно, чтобы правка одной ячейки не заставляла пересобирать и
 * заливать на GPU весь холст: затронутым считается только тайл, в который ячейка попала.
 *
 * Размер выбран как в первом прототипе: 32×32 это 1024 ячейки на тайл — достаточно крупно,
 * чтобы тайлов было немного, и достаточно мелко, чтобы мазок кисти задевал один-два.
 */
export const TILE_SIZE = 32;

export interface TileLayout {
  readonly width: number;
  readonly height: number;
  /** Тайлов по горизонтали и вертикали. */
  readonly cols: number;
  readonly rows: number;
  readonly count: number;
  /**
   * Номер первого слота каждого тайла, плюс общее число слотов последним элементом.
   * Крайние тайлы обрезаны по холсту, поэтому их размеры разные и смещения считаются заранее.
   */
  readonly starts: Int32Array;
}

/** Ширина тайла в столбце tx: крайний справа обрезан по холсту. */
export function tileWidth(layout: TileLayout, tx: number): number {
  return Math.min(TILE_SIZE, layout.width - tx * TILE_SIZE);
}

/** Высота тайла в строке ty. */
export function tileHeight(layout: TileLayout, ty: number): number {
  return Math.min(TILE_SIZE, layout.height - ty * TILE_SIZE);
}

/**
 * Раскладка зависит только от размера холста, а спрашивают её на каждый кадр и композитор, и меш.
 * Для холста 1024×1024 это тысяча витков цикла и лишняя аллокация впустую, поэтому результат
 * запоминается. Записей мало: размеров холста в работе одновременно единицы.
 */
const layouts = new Map<string, TileLayout>();
const MAX_LAYOUTS = 8;

export function tileLayout(width: number, height: number): TileLayout {
  const key = `${width}x${height}`;
  const known = layouts.get(key);
  if (known) return known;
  const made = computeLayout(width, height);
  if (layouts.size >= MAX_LAYOUTS) layouts.clear();
  layouts.set(key, made);
  return made;
}

function computeLayout(width: number, height: number): TileLayout {
  const cols = Math.max(1, Math.ceil(width / TILE_SIZE));
  const rows = Math.max(1, Math.ceil(height / TILE_SIZE));
  const count = cols * rows;
  const starts = new Int32Array(count + 1);
  let offset = 0;
  for (let ty = 0; ty < rows; ty++) {
    const h = Math.min(TILE_SIZE, height - ty * TILE_SIZE);
    for (let tx = 0; tx < cols; tx++) {
      starts[ty * cols + tx] = offset;
      offset += Math.min(TILE_SIZE, width - tx * TILE_SIZE) * h;
    }
  }
  starts[count] = offset;
  return { width, height, cols, rows, count, starts };
}

/** Общее число слотов: равно числу ячеек холста, лишних слотов нет. */
export const slotCount = (layout: TileLayout): number => layout.starts[layout.count];

/** Номер тайла, в который попадает ячейка. -1 для координат за холстом. */
export function tileOf(layout: TileLayout, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) return -1;
  return Math.floor(y / TILE_SIZE) * layout.cols + Math.floor(x / TILE_SIZE);
}

/**
 * Позиция ячейки в тайл-мажорном порядке. Именно этот порядок делает тайл непрерывным куском
 * буфера: без него ячейки одного тайла лежали бы вразбивку и частичная заливка была бы невозможна.
 */
export function slotOf(layout: TileLayout, x: number, y: number): number {
  const tile = tileOf(layout, x, y);
  if (tile === -1) return -1;
  const tx = Math.floor(x / TILE_SIZE);
  const ty = Math.floor(y / TILE_SIZE);
  const local = (y - ty * TILE_SIZE) * tileWidth(layout, tx) + (x - tx * TILE_SIZE);
  return layout.starts[tile] + local;
}

/** Диапазон слотов тайла: половина интервала, start включительно, end нет. */
export function tileSlots(layout: TileLayout, tile: number): { start: number; end: number } {
  return { start: layout.starts[tile], end: layout.starts[tile + 1] };
}

/** Прямоугольник тайла в координатах ячеек. */
export function tileRect(layout: TileLayout, tile: number): Rect {
  const tx = tile % layout.cols;
  const ty = Math.floor(tile / layout.cols);
  return {
    x: tx * TILE_SIZE,
    y: ty * TILE_SIZE,
    w: tileWidth(layout, tx),
    h: tileHeight(layout, ty),
  };
}

/** Тайлы, задетые набором правок. Ключи за пределами холста игнорируются. */
export function tilesFromKeys(layout: TileLayout, keys: Iterable<CellKey>): Set<number> {
  const tiles = new Set<number>();
  for (const key of keys) {
    const tile = tileOf(layout, xOf(key), yOf(key));
    if (tile !== -1) tiles.add(tile);
  }
  return tiles;
}

/** Тайлы, пересекающие прямоугольник в координатах ячеек. Нужны для отсечения по вьюпорту. */
export function tilesInRect(layout: TileLayout, rect: Rect): number[] {
  const x0 = Math.max(0, Math.floor(rect.x / TILE_SIZE));
  const y0 = Math.max(0, Math.floor(rect.y / TILE_SIZE));
  const x1 = Math.min(layout.cols - 1, Math.floor((rect.x + rect.w - 1) / TILE_SIZE));
  const y1 = Math.min(layout.rows - 1, Math.floor((rect.y + rect.h - 1) / TILE_SIZE));
  const tiles: number[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) tiles.push(ty * layout.cols + tx);
  }
  return tiles;
}

/**
 * Склеивает соседние тайлы в непрерывные диапазоны слотов. Одна заливка на диапазон дешевле,
 * чем отдельная на каждый тайл: драйверу важнее число вызовов, чем объём данных.
 */
export function mergeTileRanges(
  layout: TileLayout,
  tiles: Iterable<number>,
): { start: number; end: number }[] {
  const sorted = [...tiles].sort((a, b) => a - b);
  const ranges: { start: number; end: number }[] = [];
  for (const tile of sorted) {
    const { start, end } = tileSlots(layout, tile);
    const last = ranges[ranges.length - 1];
    if (last && last.end === start) last.end = end;
    else ranges.push({ start, end });
  }
  return ranges;
}

/** Совпадают ли раскладки: при смене размера холста все слоты пересчитываются заново. */
export const sameLayout = (a: TileLayout, b: TileLayout): boolean =>
  a.width === b.width && a.height === b.height;

/** Ключи непустых ячеек, разложенные по тайлам. Пустой тайл представлен undefined. */
export type TileIndex = readonly (ReadonlySet<CellKey> | undefined)[];

interface CachedIndex {
  readonly layout: TileLayout;
  readonly index: TileIndex;
}

/**
 * Сетки неизменяемы, поэтому индекс можно посчитать один раз и держать при самой сетке.
 * WeakMap, а не поле: сетка это обычный Map, и ядро не должно обрастать служебными полями,
 * которые придётся тащить через сериализацию и историю.
 */
const cache = new WeakMap<object, CachedIndex>();

/**
 * Раскладывает ключи сетки по тайлам. Построение стоит обхода всех непустых ячеек, но во время
 * штриха сетка слоя не меняется — меняется только превью поверх неё, — поэтому индекс строится
 * один раз на штрих, а не на каждое движение указателя.
 */
export function tileIndexOf(grid: CellGrid, layout: TileLayout): TileIndex {
  const cached = cache.get(grid);
  if (cached && sameLayout(cached.layout, layout)) return cached.index;

  const index: (Set<CellKey> | undefined)[] = new Array<Set<CellKey> | undefined>(layout.count);
  for (const key of grid.keys()) {
    const tile = tileOf(layout, xOf(key), yOf(key));
    if (tile === -1) continue;
    (index[tile] ??= new Set<CellKey>()).add(key);
  }
  cache.set(grid, { layout, index });
  return index;
}

import { type Cell, isBlankCell } from './cell';
import { type Rgba, TRANSPARENT, over, parseHex, toHex, withAlpha } from './color';
import type { Document, Layer } from './document';
import { applyEffects, hasActiveEffects } from './effects';
import { type CellEdits, type CellGrid, type CellKey, keyOf, xOf, yOf } from './grid';
import { type TileLayout, tileIndexOf, tileLayout, tileOf, tileRect } from './tiles';
import { type SceneObject, groupObjectsByLayer } from './object';

/**
 * Плоский кадр для рендерера: по одному символу и двум цветам на ячейку.
 * Цвета лежат в Float32Array по четыре компоненты r, g, b, a на ячейку.
 */
export interface CellBuffer {
  readonly width: number;
  readonly height: number;
  readonly glyphs: string[];
  readonly fg: Float32Array;
  readonly bg: Float32Array;
}

/** Незакоммиченные правки инструмента, показываемые поверх слоя. */
export interface Preview {
  readonly layerId: string;
  readonly edits: CellEdits;
}

/** Полупрозрачный документ под основным: соседние кадры для onion skin. */
export interface Ghost {
  readonly doc: Document;
  readonly opacity: number;
}

export function createCellBuffer(width: number, height: number): CellBuffer {
  const size = width * height;
  return {
    width,
    height,
    glyphs: new Array<string>(size).fill(''),
    fg: new Float32Array(size * 4),
    bg: new Float32Array(size * 4),
  };
}

const colorCache = new Map<string, Rgba>();
function colorOf(hex: string): Rgba {
  let color = colorCache.get(hex);
  if (!color) {
    color = parseHex(hex);
    colorCache.set(hex, color);
  }
  return color;
}

function readRgba(arr: Float32Array, i: number): Rgba {
  const o = i * 4;
  return { r: arr[o], g: arr[o + 1], b: arr[o + 2], a: arr[o + 3] };
}

function writeRgba(arr: Float32Array, i: number, c: Rgba): void {
  const o = i * 4;
  arr[o] = c.r;
  arr[o + 1] = c.g;
  arr[o + 2] = c.b;
  arr[o + 3] = c.a;
}

function blendAt(buf: CellBuffer, x: number, y: number, cell: Cell, opacity: number): void {
  if (x < 0 || y < 0 || x >= buf.width || y >= buf.height) return;
  const i = y * buf.width + x;

  if (cell.bg !== null) {
    const bg = withAlpha(colorOf(cell.bg), opacity);
    writeRgba(buf.bg, i, over(bg, readRgba(buf.bg, i)));
    if (cell.glyph === '') {
      if (bg.a >= 1) {
        // Непрозрачный фон закрашивает символ снизу.
        buf.glyphs[i] = '';
        writeRgba(buf.fg, i, TRANSPARENT);
      } else if (buf.glyphs[i] !== '') {
        // Полупрозрачный фон просвечивает символ снизу.
        writeRgba(buf.fg, i, over(bg, readRgba(buf.fg, i)));
      }
    }
  }
  if (cell.glyph !== '') {
    buf.glyphs[i] = cell.glyph;
    writeRgba(buf.fg, i, withAlpha(colorOf(cell.fg), opacity));
  }
}

const blendCell = (buf: CellBuffer, key: CellKey, cell: Cell, opacity: number): void =>
  blendAt(buf, xOf(key), yOf(key), cell, opacity);

/** Ячейка объекта поверх ячейки растра по тем же правилам, что и blendAt при полной непрозрачности. */
export function stackCell(under: Cell | undefined, top: Cell): Cell {
  if (!under) return top;
  if (top.glyph !== '') return { ...top, bg: top.bg ?? under.bg };
  if (top.bg === null) return under;
  if (colorOf(top.bg).a >= 1) return top;
  // Полупрозрачный фон без символа подкрашивает то, что снизу, а не стирает.
  const underBg = under.bg === null ? TRANSPARENT : colorOf(under.bg);
  return { ...under, bg: toHex(over(colorOf(top.bg), underBg)) };
}

/** Растр слоя с превью инструмента и объектами в одной сетке: нужно только слоям с эффектами. */
function layerContent(
  layer: Layer,
  edits: CellEdits | null,
  objects: readonly SceneObject[],
  doc: Document,
): CellGrid {
  if (!edits && objects.length === 0) return layer.cells;
  const out = new Map(layer.cells);
  if (edits) {
    for (const [key, cell] of edits) {
      if (cell && !isBlankCell(cell)) out.set(key, cell);
      else out.delete(key);
    }
  }
  for (const obj of objects) {
    if (!obj.visible) continue;
    for (const [key, cell] of obj.cells) {
      const x = obj.x + xOf(key);
      const y = obj.y + yOf(key);
      if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) continue;
      const target = keyOf(x, y);
      out.set(target, stackCell(out.get(target), cell));
    }
  }
  return out;
}

/**
 * Рисует документ в буфер. Слой без эффектов смешивается напрямую: растр, превью, объекты.
 * Слой с эффектами сначала собирается в одну сетку, к ней применяются эффекты, потом смешивание.
 *
 * `tiles` ограничивает работу перечисленными тайлами. Внутри них результат обязан совпадать с
 * полной пересборкой: всё, что рисуется, проверяется на попадание в грязный тайл.
 */
function drawDocument(
  buf: CellBuffer,
  doc: Document,
  preview: Preview | null,
  alpha: number,
  time: number,
  layout: TileLayout,
  tiles: ReadonlySet<number> | null,
): void {
  const objectsByLayer = groupObjectsByLayer(doc);
  const ctx = { time, width: doc.width, height: doc.height };
  const wanted = (key: CellKey): boolean =>
    tiles === null || tiles.has(tileOf(layout, xOf(key), yOf(key)));

  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const opacity = layer.opacity * alpha;
    const edits = preview && preview.layerId === layer.id ? preview.edits : null;
    const objects = objectsByLayer.get(layer.id) ?? [];

    if (hasActiveEffects(layer.effects)) {
      const cells = applyEffects(layerContent(layer, edits, objects, doc), layer.effects, ctx);
      for (const [key, cell] of cells) blendCell(buf, key, cell, opacity);
      continue;
    }

    if (tiles === null) {
      for (const [key, cell] of layer.cells) {
        if (edits?.has(key)) continue;
        blendCell(buf, key, cell, opacity);
      }
    } else {
      // Индекс даёт ключи ровно нужных тайлов, не трогая остальной слой.
      const index = tileIndexOf(layer.cells, layout);
      for (const tile of tiles) {
        const keys = index[tile];
        if (!keys) continue;
        for (const key of keys) {
          if (edits?.has(key)) continue;
          const cell = layer.cells.get(key);
          if (cell) blendCell(buf, key, cell, opacity);
        }
      }
    }

    if (edits) {
      for (const [key, cell] of edits) {
        if (cell && !isBlankCell(cell) && wanted(key)) blendCell(buf, key, cell, opacity);
      }
    }
    for (const obj of objects) {
      if (!obj.visible) continue;
      for (const [key, cell] of obj.cells) {
        const x = obj.x + xOf(key);
        const y = obj.y + yOf(key);
        if (tiles !== null && !tiles.has(tileOf(layout, x, y))) continue;
        blendAt(buf, x, y, cell, opacity);
      }
    }
  }
}

/**
 * Частичная пересборка возможна, только если ни у одного видимого слоя нет активных эффектов:
 * эффект зависит от времени и от всего содержимого слоя, поэтому его нельзя пересчитать по
 * кусочку. Предикат вынесен наружу, чтобы вызывающий код решал так же, как композитор, и не
 * залил на GPU меньше, чем было перерисовано.
 */
export function canRebuildTiles(doc: Document, ghosts: readonly Ghost[] = []): boolean {
  const plain = (d: Document): boolean =>
    d.layers.every((l) => !l.visible || l.opacity <= 0 || !hasActiveEffects(l.effects));
  return plain(doc) && ghosts.every((g) => plain(g.doc));
}

/** Очищает либо весь буфер, либо только перечисленные тайлы. */
function clearBuffer(buf: CellBuffer, layout: TileLayout, tiles: ReadonlySet<number> | null): void {
  if (tiles === null) {
    buf.glyphs.fill('');
    buf.fg.fill(0);
    buf.bg.fill(0);
    return;
  }
  for (const tile of tiles) {
    const rect = tileRect(layout, tile);
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      const from = y * buf.width + rect.x;
      const to = from + rect.w;
      buf.glyphs.fill('', from, to);
      buf.fg.fill(0, from * 4, to * 4);
      buf.bg.fill(0, from * 4, to * 4);
    }
  }
}

/**
 * Сводит документ в один кадр. Призраки рисуются первыми и просвечивают там, где основной
 * документ пуст. time задаёт момент для эффектов. Если передан target подходящего размера,
 * он переиспользуется, чтобы не выделять память на каждое движение мыши.
 */
export function composite(
  doc: Document,
  preview: Preview | null = null,
  target?: CellBuffer,
  ghosts: readonly Ghost[] = [],
  time = 0,
  /**
   * Тайлы, которые достаточно пересобрать. Требует, чтобы `target` был предыдущим кадром того же
   * документа: остальная его часть остаётся как есть. Игнорируется, если частичная пересборка
   * невозможна, см. `canRebuildTiles`.
   */
  dirty?: Iterable<number> | null,
): CellBuffer {
  const reusable = target && target.width === doc.width && target.height === doc.height;
  const buf = reusable ? target : createCellBuffer(doc.width, doc.height);
  const layout = tileLayout(doc.width, doc.height);
  const tiles = dirty && reusable && canRebuildTiles(doc, ghosts) ? new Set(dirty) : null;

  clearBuffer(buf, layout, tiles);
  for (const ghost of ghosts) {
    drawDocument(buf, ghost.doc, null, ghost.opacity, time, layout, tiles);
  }
  drawDocument(buf, doc, preview, 1, time, layout, tiles);
  return buf;
}

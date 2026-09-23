import type { Affine } from './affine';
import { isBlankCell } from './cell';
import { type CellBuffer, blendAt, blendCell, createCellBuffer, stackCell } from './cellBuffer';
import type { Document, Layer } from './document';
import { applyEffects, effectSignature, hasActiveEffects } from './effects';
import { lookCell, tintOf } from './look';
import type { Rect } from './geometry';
import { type CellEdits, type CellGrid, keyOf, xOf, yOf } from './grid';
import { type SceneObject, groupObjectsByLayer } from './object';
import { isFreeObject, layerDrawOrder, objectMatrices } from './placement';
import { rasterizeObject } from './rasterize';
import { type TileLayout, tileIndexOf, tileLayout, tileOf, tileRect } from './tiles';

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

/**
 * Рисуется ли объект. Совсем прозрачный пропускается, как и прозрачный слой: иначе его символ
 * заменил бы символ снизу невидимым. Выбрать мышью его при этом можно — он на месте.
 */
const isDrawn = (obj: SceneObject): boolean => obj.visible && obj.opacity > 0;

/**
 * Растр слоя с превью инструмента и объектами в одной сетке: нужно только слоям с эффектами.
 * Сюда попадают только объекты, лежащие в сетке: у свободных нет ячеек, которые можно поджечь.
 */
function layerContent(
  layer: Layer,
  edits: CellEdits | null,
  objects: readonly SceneObject[],
  matrices: ReadonlyMap<string, Affine>,
  canvas: Rect,
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
    if (!isDrawn(obj)) continue;
    const tint = tintOf(obj);
    rasterizeObject(obj, matrices.get(obj.id) as Affine, canvas, (x, y, cell) => {
      const target = keyOf(x, y);
      out.set(target, stackCell(out.get(target), lookCell(cell, tint, obj.opacity)));
    });
  }
  return out;
}

/**
 * Куда рисовать документ. Ячейки смешиваются в буфер, который отдаёт `cells()`, свободный
 * объект целиком уходит в `free()`. Плоский кадр впечатывает его в тот же буфер, кадр для экрана
 * выносит в отдельный проход поверх уже нарисованного.
 */
export interface DrawTarget {
  cells(): CellBuffer;
  free(obj: SceneObject, matrix: Affine, opacity: number): void;
}

type CellFilter = (x: number, y: number) => boolean;

/** Фильтр ячеек по грязным тайлам: без списка тайлов годится любая ячейка. */
export function tileFilter(layout: TileLayout, tiles: ReadonlySet<number> | null): CellFilter {
  return tiles === null ? () => true : (x, y) => tiles.has(tileOf(layout, x, y));
}

/**
 * Объект в буфер по ячейкам. Свободный объект — повёрнутый, отмасштабированный — попадает в
 * ячейки так же, как в текст и при впечатывании в слой: через `rasterizeObject`.
 */
export function blendObject(
  buf: CellBuffer,
  obj: SceneObject,
  matrix: Affine,
  opacity: number,
  wanted: CellFilter,
): void {
  const canvas = { x: 0, y: 0, w: buf.width, h: buf.height };
  const alpha = opacity * obj.opacity;
  const tint = tintOf(obj);
  // Оттенок бывает только у объектов: смешивание растра, горячий путь, о нём не знает.
  rasterizeObject(obj, matrix, canvas, (x, y, cell) => {
    if (wanted(x, y)) blendAt(buf, x, y, tint ? lookCell(cell, tint, 1) : cell, alpha);
  });
}

/** Растр слоя и превью инструмента поверх него. */
function drawRaster(
  buf: CellBuffer,
  layer: Layer,
  edits: CellEdits | null,
  opacity: number,
  layout: TileLayout,
  tiles: ReadonlySet<number> | null,
): void {
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
  if (!edits) return;
  const wanted = tileFilter(layout, tiles);
  for (const [key, cell] of edits) {
    if (cell && !isBlankCell(cell) && wanted(xOf(key), yOf(key)))
      blendCell(buf, key, cell, opacity);
  }
}

/**
 * Рисует документ. Слой без эффектов смешивается напрямую: растр, превью, объекты по порядку.
 * Слой с эффектами сначала собирается в одну сетку, к ней применяются эффекты, потом смешивание;
 * свободные объекты такого слоя идут поверх результата.
 *
 * `tiles` ограничивает работу перечисленными тайлами. Внутри них результат обязан совпадать с
 * полной пересборкой: всё, что рисуется в ячейки, проверяется на попадание в грязный тайл.
 */
export function drawDocument(
  target: DrawTarget,
  doc: Document,
  preview: Preview | null,
  alpha: number,
  time: number,
  layout: TileLayout,
  tiles: ReadonlySet<number> | null,
): void {
  const objectsByLayer = groupObjectsByLayer(doc);
  const matrices = objectMatrices(doc);
  const matrixOf = (obj: SceneObject): Affine => matrices.get(obj.id) as Affine;
  const ctx = { time, width: doc.width, height: doc.height };
  const canvas = { x: 0, y: 0, w: doc.width, h: doc.height };
  const wanted = tileFilter(layout, tiles);

  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const opacity = layer.opacity * alpha;
    const edits = preview && preview.layerId === layer.id ? preview.edits : null;
    const objects = layerDrawOrder(layer, objectsByLayer.get(layer.id) ?? [], matrices);

    if (hasActiveEffects(layer.effects)) {
      const inGrid = objects.filter((o) => !isFreeObject(o, matrixOf(o)));
      const content = layerContent(layer, edits, inGrid, matrices, canvas);
      const buf = target.cells();
      for (const [key, cell] of applyEffects(content, layer.effects, ctx)) {
        blendCell(buf, key, cell, opacity);
      }
      for (const obj of objects) {
        if (isDrawn(obj) && isFreeObject(obj, matrixOf(obj)))
          target.free(obj, matrixOf(obj), opacity);
      }
      continue;
    }

    drawRaster(target.cells(), layer, edits, opacity, layout, tiles);
    for (const obj of objects) {
      if (!isDrawn(obj)) continue;
      const matrix = matrixOf(obj);
      if (isFreeObject(obj, matrix)) target.free(obj, matrix, opacity);
      else blendObject(target.cells(), obj, matrix, opacity, wanted);
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

/**
 * Подпись всех активных эффектов документа и его призраков. Пока она не меняется, кадр эффектов
 * будет тем же, и пересобирать его незачем: часы идут 30 раз в секунду, а огонь с периодом 90 мс
 * меняется примерно 11, то есть две трети тиков не несут никакой новой картинки.
 */
export function effectsSignature(
  doc: Document,
  time: number,
  ghosts: readonly Ghost[] = [],
): string {
  const parts: string[] = [];
  const collect = (d: Document): void => {
    const ctx = { time, width: d.width, height: d.height };
    for (const layer of d.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      for (const effect of layer.effects) {
        if (effect.enabled) parts.push(`${effect.id}@${effectSignature(effect, ctx)}`);
      }
    }
  };
  collect(doc);
  for (const ghost of ghosts) collect(ghost.doc);
  return parts.join('|');
}

/** Очищает либо весь буфер, либо только перечисленные тайлы. */
export function clearBuffer(
  buf: CellBuffer,
  layout: TileLayout,
  tiles: ReadonlySet<number> | null,
): void {
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
 * Сводит документ в один плоский кадр: символ на ячейку. Так документ уходит в текст и в
 * миниатюры; экран рисует `composeFrame`, где повёрнутые символы остаются повёрнутыми.
 *
 * Призраки рисуются первыми и просвечивают там, где основной документ пуст. time задаёт момент
 * для эффектов. Если передан target подходящего размера, он переиспользуется, чтобы не выделять
 * память на каждое движение мыши.
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
  const wanted = tileFilter(layout, tiles);
  // Плоский кадр: свободные объекты впечатываются в тот же буфер, как в текст.
  const flat: DrawTarget = {
    cells: () => buf,
    free: (obj, matrix, opacity) => blendObject(buf, obj, matrix, opacity, wanted),
  };
  for (const ghost of ghosts) {
    drawDocument(flat, ghost.doc, null, ghost.opacity, time, layout, tiles);
  }
  drawDocument(flat, doc, preview, 1, time, layout, tiles);
  return buf;
}

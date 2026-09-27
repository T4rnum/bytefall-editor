import type { DocumentFont, VectorLayout } from '../../core/font/font';
import { TILESET_COLUMNS, tilesetIndex } from '../../core/font/tileset';

/**
 * Как рисуется глиф в ячейке атласа. Атлас не знает, откуда форма символа: из векторного
 * шрифта или из листа CP437, — он только раскладывает ячейки.
 */
export interface GlyphPainter {
  /** Ячейка атласа в пикселях: сетка шрифта, умноженная на `scale`. */
  readonly cellWidth: number;
  readonly cellHeight: number;
  /** Сетка шрифта — пикселей шрифта в ячейке: ей мерятся крупный пиксель и развёртка. */
  readonly gridWidth: number;
  readonly gridHeight: number;
  /** Белый глиф в ячейке с левым верхним углом (x, y); ячейка уже обрезана и очищена. */
  paint(ctx: CanvasRenderingContext2D, glyph: string, x: number, y: number): void;
}

/**
 * Векторный шрифт: браузер рисует текст кеглем из раскладки. Знак ставится посередине ячейки по
 * своей ширине — так моноширинный шрифт встаёт ровно, а узкий знак пропорционального не
 * липнет к левому краю. У пиксельного шрифта отступ округляется до его пикселя.
 */
export function vectorPainter(
  family: string,
  layout: VectorLayout,
  font: DocumentFont,
  scale: number,
): GlyphPainter {
  const cellWidth = font.cellWidth * scale;
  return {
    cellWidth,
    cellHeight: font.cellHeight * scale,
    gridWidth: font.cellWidth,
    gridHeight: font.cellHeight,
    paint(ctx, glyph, x, y) {
      ctx.font = `${layout.size * scale}px "${family}"`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const free = (cellWidth - ctx.measureText(glyph).width) / 2;
      const left = layout.pixel ? Math.round(free / scale) * scale : free;
      ctx.fillText(glyph, x + left, y + layout.baseline * scale);
    },
  };
}

/**
 * Лист CP437: ячейка листа по коду символа, увеличенная без сглаживания. `sheet` — лист уже
 * белым по прозрачному, см. `tilesetInk`.
 */
export function tilesetPainter(
  sheet: CanvasImageSource,
  font: DocumentFont,
  scale: number,
): GlyphPainter {
  const w = font.cellWidth;
  const h = font.cellHeight;
  return {
    cellWidth: w * scale,
    cellHeight: h * scale,
    gridWidth: w,
    gridHeight: h,
    paint(ctx, glyph, x, y) {
      const index = tilesetIndex(glyph);
      const sx = (index % TILESET_COLUMNS) * w;
      const sy = Math.floor(index / TILESET_COLUMNS) * h;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sheet, sx, sy, w, h, x, y, w * scale, h * scale);
    },
  };
}

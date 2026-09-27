import { crc32 } from '../zip';
import type { SfntInfo } from './sfnt';

/**
 * Шрифт документа. Встроенный лежит в редакторе и пишется в файл одним именем; свой — целиком в
 * документе, чтобы файл выглядел одинаково на любой машине. Решение — в `docs/DESIGN.md`, раздел 3.
 *
 * - `builtin` — шрифт редактора, данных в документе нет;
 * - `vector` — файл TTF/OTF;
 * - `tileset` — PNG 16×16 символов в порядке CP437, как у REXPaint и Dwarf Fortress.
 */
export type FontKind = 'builtin' | 'vector' | 'tileset';

export interface DocumentFont {
  /** У встроенного — имя в редакторе, у своего — отпечаток данных: по нему шрифт кэшируется. */
  readonly id: string;
  /** Для людей: имя файла без расширения. */
  readonly name: string;
  readonly kind: FontKind;
  /** Файл шрифта. Только читается: правка шрифта — новый шрифт. */
  readonly data: Uint8Array | null;
  /** Ячейка в пикселях шрифта — сетка, на которой он нарисован: 8×8, 8×16. */
  readonly cellWidth: number;
  readonly cellHeight: number;
}

export const BUILTIN_FONT: DocumentFont = {
  id: 'press-start-2p',
  name: 'Press Start 2P',
  kind: 'builtin',
  data: null,
  cellWidth: 8,
  cellHeight: 8,
};

/** Предел файла шрифта: пиксельный TTF — десятки килобайт, лист символов — единицы. */
export const MAX_FONT_BYTES = 1024 * 1024;
export const MIN_FONT_CELL = 2;
export const MAX_FONT_CELL = 64;
/** Ячейка не уже четверти высоты и не шире четырёх: дальше сетка теряет смысл. */
export const MAX_CELL_ASPECT = 4;

/** Отношение ширины ячейки к высоте: 1 у квадратной, 0.5 у шрифтов VGA 8×16. */
export const cellAspect = (font: DocumentFont): number => font.cellWidth / font.cellHeight;

export function validCell(width: number, height: number): boolean {
  const ok = (v: number): boolean =>
    Number.isInteger(v) && v >= MIN_FONT_CELL && v <= MAX_FONT_CELL;
  const aspect = width / height;
  return ok(width) && ok(height) && aspect <= MAX_CELL_ASPECT && aspect >= 1 / MAX_CELL_ASPECT;
}

/** Отпечаток своего шрифта: одинаковые файлы — один шрифт, и загружать второй раз нечего. */
export const userFontId = (data: Uint8Array): string =>
  `font-${crc32(data).toString(16).padStart(8, '0')}-${data.length.toString(36)}`;

export function createUserFont(
  name: string,
  kind: Exclude<FontKind, 'builtin'>,
  data: Uint8Array,
  cellWidth: number,
  cellHeight: number,
): DocumentFont {
  if (data.length > MAX_FONT_BYTES) throw new RangeError('font file is too large');
  if (!validCell(cellWidth, cellHeight)) throw new RangeError('font cell is out of range');
  return { id: userFontId(data), name, kind, data, cellWidth, cellHeight };
}

export const sameFont = (a: DocumentFont, b: DocumentFont): boolean =>
  a.id === b.id && a.cellWidth === b.cellWidth && a.cellHeight === b.cellHeight;

const clampCell = (v: number): number =>
  Math.max(MIN_FONT_CELL, Math.min(MAX_FONT_CELL, Math.round(v)));

/**
 * Ячейка векторного шрифта. Пиксельный отдаёт её сам: ширина знака и высота строки в пикселях.
 * У обычного высота 16 — достаточно, чтобы буквы читались, — а ширина по ширине знака.
 */
export function vectorCell(info: SfntInfo): { cellWidth: number; cellHeight: number } {
  const line = info.ascender - info.descender;
  if (info.pixel !== null) {
    const cellWidth = clampCell(info.advance / info.pixel);
    const cellHeight = clampCell(line / info.pixel);
    if (validCell(cellWidth, cellHeight)) return { cellWidth, cellHeight };
  }
  const cellHeight = 16;
  const cellWidth = clampCell((cellHeight * info.advance) / line);
  return validCell(cellWidth, cellHeight)
    ? { cellWidth, cellHeight }
    : { cellWidth: 8, cellHeight };
}

export interface VectorLayout {
  /** Кегль в пикселях шрифта: у пиксельного шрифта ровно его сетка на кегль. */
  readonly size: number;
  /** Базовая линия от верха ячейки, в пикселях шрифта. По ширине знак ставит рисующий. */
  readonly baseline: number;
  /** Пиксельный ли шрифт: тогда положение округляется до его пикселя, и знак остаётся чётким. */
  readonly pixel: boolean;
}

/**
 * Где и каким кеглем рисовать векторный шрифт в ячейке. Строка шрифта ставится посередине
 * ячейки: если ячейку сделали выше сетки шрифта, поле делится поровну сверху и снизу.
 */
export function vectorLayout(info: SfntInfo, cellHeight: number): VectorLayout {
  const pixel = info.pixel !== null;
  const scale =
    info.pixel !== null ? 1 / info.pixel : cellHeight / (info.ascender - info.descender);
  const snap = (v: number): number => (pixel ? Math.round(v) : v);
  const line = (info.ascender - info.descender) * scale;
  return {
    size: info.unitsPerEm * scale,
    baseline: snap((cellHeight - line) / 2 + info.ascender * scale),
    pixel,
  };
}

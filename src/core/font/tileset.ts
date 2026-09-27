import { CP437 } from '../import/cp437';
import { validCell } from './font';

/**
 * Лист символов: PNG из 16×16 ячеек в порядке CP437, как шрифты REXPaint и Dwarf Fortress.
 * Картинку разбирает приложение, ядро решает, где символ, а где фон.
 */
export const TILESET_COLUMNS = 16;
export const TILESET_ROWS = 16;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const isPng = (bytes: Uint8Array): boolean =>
  bytes.length > PNG_SIGNATURE.length && PNG_SIGNATURE.every((b, i) => bytes[i] === b);

/** Ячейка листа по размеру картинки; null — картинка не делится на 16×16 годных ячеек. */
export function tilesetCell(
  width: number,
  height: number,
): { cellWidth: number; cellHeight: number } | null {
  if (width % TILESET_COLUMNS !== 0 || height % TILESET_ROWS !== 0) return null;
  const cellWidth = width / TILESET_COLUMNS;
  const cellHeight = height / TILESET_ROWS;
  return validCell(cellWidth, cellHeight) ? { cellWidth, cellHeight } : null;
}

/**
 * Маска символов листа: 255 — символ, 0 — фон. Символ — светлое и непрозрачное: так рисуют
 * листы на чёрном, на пурпурном (его яркость ниже половины) и на прозрачном фоне. Лист, где
 * «символа» больше половины, нарисован тёмным по светлому — тогда маска обращается.
 */
export function tilesetInk(rgba: ArrayLike<number>, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  let ink = 0;
  for (let i = 0; i < mask.length; i++) {
    const o = i * 4;
    const light = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2] >= 128;
    if (rgba[o + 3] >= 128 && light) {
      mask[i] = 255;
      ink++;
    }
  }
  if (ink * 2 > mask.length) {
    for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4 + 3] >= 128 ? 255 - mask[i] : 0;
  }
  return mask;
}

const INDEX = new Map(CP437.map((ch, i) => [ch, i]));
const QUESTION = 0x3f;

/**
 * Ячейка листа для символа документа. Символа нет в CP437 — знак вопроса, как у импорта `.xp`:
 * форма неизвестна, но видно, что там что-то есть.
 */
export const tilesetIndex = (glyph: string): number => INDEX.get(glyph) ?? QUESTION;

/** Символы листа в порядке кодов: пустые коды 0, 32 и 255 пропущены. */
export const TILESET_CHARS: readonly string[] = CP437.filter(
  (ch, code) => code !== 0 && code !== 0x20 && code !== 0xff && ch !== '',
);

import { z } from 'zod';
import { fromBase64, toBase64 } from '../base64';
import {
  BUILTIN_FONT,
  type DocumentFont,
  MAX_FONT_BYTES,
  MAX_FONT_CELL,
  MIN_FONT_CELL,
  userFontId,
  validCell,
} from '../font/font';
import { isSfnt } from '../font/sfnt';
import { isPng } from '../font/tileset';
import { DocumentFormatError, MAX_ID_LENGTH, MAX_NAME_LENGTH } from './primitives';

const cell = z.number().int().min(MIN_FONT_CELL).max(MAX_FONT_CELL);

/**
 * Шрифт в файле. Встроенный — строкой-именем, как во всех версиях до 13; свой (версия 13) —
 * объектом с файлом шрифта в base64 и ячейкой.
 */
export const fontSchema = z.union([
  z.string().min(1).max(MAX_ID_LENGTH),
  z
    .object({
      name: z.string().max(MAX_NAME_LENGTH),
      kind: z.enum(['vector', 'tileset']),
      data: z
        .string()
        .min(4)
        .max(Math.ceil(MAX_FONT_BYTES / 3) * 4),
      cellWidth: cell,
      cellHeight: cell,
    })
    .refine((f) => validCell(f.cellWidth, f.cellHeight), 'Font cell aspect is out of range'),
]);

export type FontFile = z.infer<typeof fontSchema>;

export function fontToFile(font: DocumentFont): FontFile {
  if (font.kind === 'builtin' || font.data === null) return font.id;
  return {
    name: font.name,
    kind: font.kind,
    data: toBase64(font.data),
    cellWidth: font.cellWidth,
    cellHeight: font.cellHeight,
  };
}

/**
 * Шрифт из файла. Встроенный шрифт у редактора один, поэтому любое имя — он: файл из будущей
 * версии со вторым встроенным шрифтом откроется, пусть и не тем шрифтом. У своего проверяется
 * только вид файла — разбирает его приложение, и битый шрифт не мешает открыть документ.
 */
export function fontFromFile(file: FontFile): DocumentFont {
  if (typeof file === 'string') return BUILTIN_FONT;
  let data: Uint8Array;
  try {
    data = fromBase64(file.data);
  } catch {
    throw new DocumentFormatError('Font data is not valid base64');
  }
  if (file.kind === 'vector' ? !isSfnt(data) : !isPng(data)) {
    throw new DocumentFormatError(`Font data is not a ${file.kind === 'vector' ? 'TTF' : 'PNG'}`);
  }
  return {
    id: userFontId(data),
    name: file.name,
    kind: file.kind,
    data,
    cellWidth: file.cellWidth,
    cellHeight: file.cellHeight,
  };
}

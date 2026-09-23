import { z } from 'zod';
import { type Cell, makeCell } from '../cell';
import { isHexColor } from '../color';
import { MAX_DIMENSION } from '../document';
import { type CellGrid, type CellKey, keyOf, xOf, yOf } from '../grid';

/** Лимиты формата: файл из недоверенного источника не должен ронять вкладку. */
export const MAX_NAME_LENGTH = 200;
export const MAX_ID_LENGTH = 64;
export const MAX_GLYPH_LENGTH = 16;
export const MAX_ATTRS_PER_CELL = 32;
export const MAX_ATTR_STRING_LENGTH = 256;
export const MAX_CELLS_PER_LAYER = MAX_DIMENSION * MAX_DIMENSION;

export class DocumentFormatError extends Error {
  override readonly name = 'DocumentFormatError';
}

export const hex = z.string().max(9).refine(isHexColor, 'Expected hex color like #rrggbb');
export const id = z.string().min(1).max(MAX_ID_LENGTH);
export const coordinate = z
  .number()
  .int()
  .min(0)
  .max(MAX_DIMENSION - 1);
export const position = z.number().int().min(-MAX_DIMENSION).max(MAX_DIMENSION);
const attrValue = z.union([
  z.string().max(MAX_ATTR_STRING_LENGTH),
  z.number().finite(),
  z.boolean(),
]);
export const attrs = z
  .record(z.string().max(MAX_ID_LENGTH), attrValue)
  .refine(
    (a) => Object.keys(a).length <= MAX_ATTRS_PER_CELL,
    `At most ${MAX_ATTRS_PER_CELL} attrs per cell`,
  );

export const cellSchema = z.object({
  x: coordinate,
  y: coordinate,
  g: z.string().max(MAX_GLYPH_LENGTH),
  f: hex,
  b: hex.nullable().optional(),
  a: attrs.optional(),
});

export type CellFile = z.infer<typeof cellSchema>;

export function cellsToFile(grid: CellGrid): CellFile[] {
  return [...grid.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, cell]) => ({
      x: xOf(key),
      y: yOf(key),
      g: cell.glyph,
      f: cell.fg,
      ...(cell.bg !== null ? { b: cell.bg } : {}),
      ...(cell.attrs ? { a: cell.attrs } : {}),
    }));
}

/** Ячейки за пределами limit отбрасываются; для объектов ограничения по холсту нет. */
export function cellsFromFile(
  cells: readonly CellFile[],
  limit?: { width: number; height: number },
): CellGrid {
  const grid = new Map<CellKey, Cell>();
  for (const c of cells) {
    if (limit && (c.x >= limit.width || c.y >= limit.height)) continue;
    grid.set(keyOf(c.x, c.y), makeCell(c.g, c.f, c.b ?? null, c.a));
  }
  return grid;
}

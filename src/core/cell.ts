import { isHexColor } from './color';

export type CellAttrValue = string | number | boolean;
/** Произвольные свойства символа: задел под эффекты, логику и анимацию. */
export type CellAttrs = Readonly<Record<string, CellAttrValue>>;

/** Атом документа: один символ в ячейке сетки. */
export interface Cell {
  /** Один символ (графема). Пустая строка означает "нет символа". */
  readonly glyph: string;
  /** Цвет символа, hex. */
  readonly fg: string;
  /** Цвет фона ячейки, hex, либо null для прозрачного фона. */
  readonly bg: string | null;
  readonly attrs?: CellAttrs;
}

export const DEFAULT_FG = '#ffffff';

export function makeCell(
  glyph: string,
  fg: string = DEFAULT_FG,
  bg: string | null = null,
  attrs?: CellAttrs,
): Cell {
  if (!isHexColor(fg)) throw new Error(`Invalid foreground color: ${String(fg)}`);
  if (bg !== null && !isHexColor(bg)) {
    throw new Error(`Invalid background color: ${String(bg)}`);
  }
  const cell: Cell = { glyph, fg, bg };
  return attrs && Object.keys(attrs).length > 0 ? { ...cell, attrs } : cell;
}

/** Ячейка без символа и без фона визуально отсутствует и не хранится в сетке. */
export function isBlankCell(cell: Cell | null | undefined): boolean {
  return !cell || (cell.glyph === '' && cell.bg === null);
}

function attrsEqual(a: CellAttrs | undefined, b: CellAttrs | undefined): boolean {
  const keysA = a ? Object.keys(a) : [];
  const keysB = b ? Object.keys(b) : [];
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => a !== undefined && b !== undefined && a[k] === b[k]);
}

/** Визуальное равенство: у ячеек без символа цвет символа не учитывается. */
export function cellsEqual(a: Cell | null | undefined, b: Cell | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return isBlankCell(a) && isBlankCell(b);
  return (
    a.glyph === b.glyph &&
    a.bg === b.bg &&
    (a.glyph === '' || a.fg === b.fg) &&
    attrsEqual(a.attrs, b.attrs)
  );
}

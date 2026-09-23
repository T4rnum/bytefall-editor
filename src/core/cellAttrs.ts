import type { Cell, CellAttrs, CellAttrValue } from './cell';
import type { Point } from './geometry';
import { type CellEdits, type CellGrid, type CellKey, keyOf, xOf, yOf } from './grid';
import { type Selection, selectionCells, selectionContains } from './selection';
import { MAX_ATTRS_PER_CELL, MAX_ID_LENGTH } from './serialization';

/** Свойство среди выделенных ячеек. */
export interface AttrSummary {
  readonly key: string;
  /** Общее значение у всех ячеек, где свойство есть. null — значения разные. */
  readonly value: CellAttrValue | null;
  /** Сколько выделенных ячеек несут это свойство. */
  readonly count: number;
}

export interface AttrsSummary {
  /** Сколько непустых ячеек в выделении: свойства живут только на них. */
  readonly cells: number;
  readonly attrs: readonly AttrSummary[];
}

/**
 * Имя свойства: не пустое, не длиннее предела формата и не `__proto__` — такое имя в объекте
 * значит не свойство, а прототип, и запись по нему повела бы себя непредсказуемо.
 */
export function isValidAttrKey(key: string): boolean {
  return key.length > 0 && key.length <= MAX_ID_LENGTH && key !== '__proto__';
}

const hasAttr = (attrs: CellAttrs | undefined, key: string): boolean =>
  attrs !== undefined && Object.hasOwn(attrs, key);

/**
 * Непустые ячейки выделения. Обходится то, что меньше: выделение по маске или сетка слоя с
 * проверкой маски. Выделить весь большой холст с редким рисунком — обычное дело, и тогда обход
 * миллиона пустых ячеек ради тысячи непустых был бы пустой тратой.
 */
function* selectedCells(grid: CellGrid, selection: Selection): Generator<[CellKey, Cell]> {
  if (grid.size < selection.size) {
    for (const [key, cell] of grid) {
      if (selectionContains(selection, xOf(key), yOf(key))) yield [key, cell];
    }
    return;
  }
  for (const p of selectionCells(selection)) {
    const key = keyOf(p.x, p.y);
    const cell = grid.get(key);
    if (cell) yield [key, cell];
  }
}

/** Свойства ячеек по именам, по алфавиту: общее значение или «разные» и сколько ячеек. */
function summarize(source: Iterable<[CellKey, Cell]>): AttrsSummary {
  let cells = 0;
  const byKey = new Map<string, { value: CellAttrValue | null; count: number }>();
  for (const [, cell] of source) {
    cells += 1;
    // Помеченных ячеек обычно меньшинство: остальным не нужны ни объект, ни обход его полей.
    if (!cell.attrs) continue;
    for (const [key, value] of Object.entries(cell.attrs)) {
      const entry = byKey.get(key);
      if (!entry) {
        byKey.set(key, { value, count: 1 });
        continue;
      }
      entry.count += 1;
      if (entry.value !== value) entry.value = null;
    }
  }
  const attrs = [...byKey.entries()]
    .map(([key, entry]) => ({ key, value: entry.value, count: entry.count }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return { cells, attrs };
}

/** Свойства непустых выделенных ячеек. */
export const summarizeAttrs = (grid: CellGrid, selection: Selection): AttrsSummary =>
  summarize(selectedCells(grid, selection));

/** Свойства всех ячеек слоя: какие метки на нём вообще есть и у скольких ячеек. */
export const summarizeLayerAttrs = (grid: CellGrid): AttrsSummary => summarize(grid);

/**
 * Правки, ставящие свойство непустым выделенным ячейкам. С `onlyExisting` — только тем, у кого
 * это свойство уже есть: так правится значение в строке свойства, которая описывает именно их.
 * Ячейки, где оно уже такое, не трогаются. Ячейки, где свойств уже предел формата, пропускаются
 * и считаются в `skipped`: молча урезать чужие свойства ради нового нельзя.
 */
export function setAttrEdits(
  grid: CellGrid,
  selection: Selection,
  key: string,
  value: CellAttrValue,
  onlyExisting = false,
): { edits: CellEdits; skipped: number } {
  const edits = new Map<CellKey, Cell | null>();
  let skipped = 0;
  for (const [cellKey, cell] of selectedCells(grid, selection)) {
    const attrs = cell.attrs ?? {};
    if (onlyExisting && !hasAttr(attrs, key)) continue;
    if (hasAttr(attrs, key) && attrs[key] === value) continue;
    if (!hasAttr(attrs, key) && Object.keys(attrs).length >= MAX_ATTRS_PER_CELL) {
      skipped += 1;
      continue;
    }
    edits.set(cellKey, { ...cell, attrs: { ...attrs, [key]: value } });
  }
  return { edits, skipped };
}

/** Правки, убирающие свойство у выделенных ячеек. Без свойств ячейка остаётся без поля attrs. */
export function removeAttrEdits(grid: CellGrid, selection: Selection, key: string): CellEdits {
  const edits = new Map<CellKey, Cell | null>();
  for (const [cellKey, cell] of selectedCells(grid, selection)) {
    if (!hasAttr(cell.attrs, key)) continue;
    const rest = Object.fromEntries(Object.entries(cell.attrs ?? {}).filter(([k]) => k !== key));
    const plain: Cell = { glyph: cell.glyph, fg: cell.fg, bg: cell.bg };
    edits.set(cellKey, Object.keys(rest).length > 0 ? { ...plain, attrs: rest } : plain);
  }
  return edits;
}

/** Все ячейки слоя с этим свойством: так метки становятся видимыми — их можно выделить. */
export function cellsWithAttr(grid: CellGrid, key: string): Point[] {
  const points: Point[] = [];
  for (const [cellKey, cell] of grid) {
    if (hasAttr(cell.attrs, key)) points.push({ x: xOf(cellKey), y: yOf(cellKey) });
  }
  return points;
}

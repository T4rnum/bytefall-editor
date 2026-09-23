import { describe, expect, it } from 'vitest';
import type { Cell } from '../cell';
import { makeCell } from '../cell';
import type { Rect } from '../geometry';
import { type CellKey, applyEdits, emptyGrid, keyOf } from '../grid';
import { createObject } from '../object';
import { rasterizeObject } from '../rasterize';
import { type Transform2D, transformMatrix } from '../transform';

const WIDE: Rect = { x: -64, y: -64, w: 128, h: 128 };

/** Квадрат size×size, у каждой ячейки свой символ: по нему видно, откуда ячейка взялась. */
function square(size: number) {
  const edits = new Map<CellKey, Cell>();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++)
      edits.set(keyOf(x, y), makeCell(String.fromCharCode(65 + y * size + x)));
  }
  return createObject({
    name: 'sq',
    layerId: 'l',
    x: 0,
    y: 0,
    cells: applyEdits(emptyGrid(), edits),
  });
}

function raster(size: number, patch: Partial<Transform2D>, clip: Rect = WIDE): Map<string, string> {
  const obj = square(size);
  const out = new Map<string, string>();
  const matrix = transformMatrix({ ...obj.transform, ...patch });
  rasterizeObject(obj, matrix, clip, (x, y, cell) => {
    expect(out.has(`${x},${y}`)).toBe(false);
    out.set(`${x},${y}`, cell.glyph);
  });
  return out;
}

/** Картинка в строки: удобно сравнивать глазами. */
function picture(cells: Map<string, string>, rect: Rect): string[] {
  const rows: string[] = [];
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    let row = '';
    for (let x = rect.x; x < rect.x + rect.w; x++) row += cells.get(`${x},${y}`) ?? '.';
    rows.push(row);
  }
  return rows;
}

describe('rasterizeObject', () => {
  it('без поворота — просто сдвиг, и за рамку ничего не выходит', () => {
    const cells = raster(2, { x: 3, y: 1 });
    expect(picture(cells, { x: 3, y: 1, w: 2, h: 2 })).toEqual(['AB', 'CD']);
    expect(cells.size).toBe(4);
    expect(raster(2, { x: 3, y: 1 }, { x: 0, y: 0, w: 4, h: 4 }).size).toBe(2);
  });

  it('поворот на 90° по часовой переставляет ячейки без потерь', () => {
    // Квадрат 3×3 с опорой в центре остаётся на месте.
    const cells = raster(3, { rot: 90 });
    expect(picture(cells, { x: 0, y: 0, w: 3, h: 3 })).toEqual(['GDA', 'HEB', 'IFC']);
    expect(cells.size).toBe(9);
  });

  it('поворот на 180° и −90° тоже без потерь', () => {
    expect(picture(raster(3, { rot: 180 }), { x: 0, y: 0, w: 3, h: 3 })).toEqual([
      'IHG',
      'FED',
      'CBA',
    ]);
    expect(picture(raster(3, { rot: -90 }), { x: 0, y: 0, w: 3, h: 3 })).toEqual([
      'CFI',
      'BEH',
      'ADG',
    ]);
  });

  it('произвольный угол не даёт ни дыр, ни наложений: у ячейки ровно один источник', () => {
    // Сплошной квадрат 5×5 под 45° по часовой: угол A уходит наверх, E вправо, Y вниз.
    const cells = raster(5, { rot: 45 });
    const rows = picture(cells, { x: -1, y: -1, w: 7, h: 7 });
    expect(rows).toEqual([
      '...A...',
      '..FGB..',
      '.PLGHD.',
      'UQQMIIE',
      '.VRSNJ.',
      '..XST..',
      '...Y...',
    ]);
    // Часть символов повторяется, часть пропадает, но внутри ромба нет ни одной пустой ячейки.
    for (const row of rows) expect(row.replace(/^\.+|\.+$/g, '')).not.toContain('.');
  });

  it('увеличение повторяет ячейки блоками, уменьшение прореживает', () => {
    const big = raster(2, { sx: 2, sy: 2, px: 0, py: 0 });
    expect(picture(big, { x: 0, y: 0, w: 4, h: 4 })).toEqual(['AABB', 'AABB', 'CCDD', 'CCDD']);
    const small = raster(4, { sx: 0.5, sy: 0.5, px: 0, py: 0 });
    // Центр ячейки попадает ровно в угол блока 2×2 и берёт ячейку за углом: правило одно на всех.
    expect(picture(small, { x: 0, y: 0, w: 2, h: 2 })).toEqual(['FH', 'NP']);
    expect(small.size).toBe(4);
  });

  it('дробный сдвиг округляется до ближайшей ячейки', () => {
    expect([...raster(1, { dx: 0.4 }).keys()]).toEqual(['0,0']);
    expect([...raster(1, { dx: 0.6 }).keys()]).toEqual(['1,0']);
    expect([...raster(1, { dy: -0.6 }).keys()]).toEqual(['0,-1']);
  });

  it('пустой объект и вырожденная матрица ничего не рисуют', () => {
    const empty = createObject({ name: 'e', layerId: 'l', x: 0, y: 0 });
    let calls = 0;
    rasterizeObject(empty, transformMatrix({ ...empty.transform, rot: 30 }), WIDE, () => calls++);
    rasterizeObject(square(2), { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }, WIDE, () => calls++);
    expect(calls).toBe(0);
  });
});

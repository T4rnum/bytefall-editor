import type { Cell } from './cell';
import { type Rgba, TRANSPARENT, over, parseHex, toHex, withAlpha } from './color';
import { type CellKey, xOf, yOf } from './grid';

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

/**
 * Ячейка поверх того, что уже в буфере. Символ заменяет символ снизу, фон ложится поверх фона.
 * Непрозрачный фон без символа закрашивает символ снизу, полупрозрачный — подкрашивает.
 */
export function blendAt(buf: CellBuffer, x: number, y: number, cell: Cell, opacity: number): void {
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

export const blendCell = (buf: CellBuffer, key: CellKey, cell: Cell, opacity: number): void =>
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

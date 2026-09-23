import { describe, expect, it } from 'vitest';
import { frameDocument } from '../animation';
import { getCell } from '../grid';
import { CP437, cp437Glyph } from '../import/cp437';
import { parseXp } from '../import/xp';

type Rgb = readonly [number, number, number];
const MAGENTA: Rgb = [255, 0, 255];
const BLACK: Rgb = [0, 0, 0];

interface XpCell {
  readonly code: number;
  readonly fg: Rgb;
  readonly bg: Rgb;
}

/** Собирает .xp байт за байтом, как его пишет REXPaint: ячейки по столбцам. */
function xpBytes(
  layers: readonly { w: number; h: number; at: (x: number, y: number) => XpCell }[],
  withVersion = true,
): Uint8Array {
  const out: number[] = [];
  const int = (v: number): void => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, v, true);
    out.push(...b);
  };
  if (withVersion) int(-1);
  int(layers.length);
  for (const layer of layers) {
    int(layer.w);
    int(layer.h);
    for (let x = 0; x < layer.w; x++) {
      for (let y = 0; y < layer.h; y++) {
        const cell = layer.at(x, y);
        int(cell.code);
        out.push(...cell.fg, ...cell.bg);
      }
    }
  }
  return new Uint8Array(out);
}

const empty: XpCell = { code: 0, fg: BLACK, bg: MAGENTA };

/** Два слоя 3×2: снизу «A» и рамка, сверху «█» без фона. */
const sample = [
  {
    w: 3,
    h: 2,
    at: (x: number, y: number): XpCell => {
      if (x === 0 && y === 0) return { code: 65, fg: [255, 0, 0], bg: BLACK };
      if (x === 2 && y === 0) return { code: 0xda, fg: [255, 255, 255], bg: [0, 0, 128] };
      if (x === 0 && y === 1) return { code: 0, fg: BLACK, bg: [0, 255, 0] };
      return empty;
    },
  },
  {
    w: 3,
    h: 2,
    at: (x: number, y: number): XpCell =>
      x === 1 && y === 1 ? { code: 0xdb, fg: [255, 255, 0], bg: MAGENTA } : empty,
  },
];

describe('CP437', () => {
  it('таблица полная и совпадает с экраном IBM PC', () => {
    expect(CP437).toHaveLength(256);
    expect(cp437Glyph(1)).toBe('☺');
    expect(cp437Glyph(65)).toBe('A');
    expect(cp437Glyph(0xb0)).toBe('░');
    expect(cp437Glyph(0xc9)).toBe('╔');
    expect(cp437Glyph(0xdb)).toBe('█');
    expect(cp437Glyph(0xe1)).toBe('ß');
    expect(cp437Glyph(0xfe)).toBe('■');
  });

  it('пустота, пробел и неразрывный пробел — это отсутствие символа', () => {
    expect(cp437Glyph(0)).toBe('');
    expect(cp437Glyph(32)).toBe('');
    expect(cp437Glyph(255)).toBe('');
    expect(cp437Glyph(300)).toBe('?');
  });
});

describe('parseXp', () => {
  it('переносит слои, символы, цвета и прозрачность', () => {
    const anim = parseXp(xpBytes(sample), 'map');
    const doc = frameDocument(anim, 0);
    expect(doc).toMatchObject({ name: 'map', width: 3, height: 2, background: null });
    expect(doc.layers.map((l) => l.name)).toEqual(['Слой 1', 'Слой 2']);

    const [bottom, top] = doc.layers;
    expect(getCell(bottom.cells, 0, 0)).toEqual({ glyph: 'A', fg: '#ff0000', bg: '#000000' });
    expect(getCell(bottom.cells, 2, 0)).toEqual({ glyph: '┌', fg: '#ffffff', bg: '#000080' });
    // Ячейка только с фоном.
    expect(getCell(bottom.cells, 0, 1)).toMatchObject({ glyph: '', bg: '#00ff00' });
    // Пурпурный фон — прозрачно: символ остаётся, фона нет.
    expect(getCell(top.cells, 1, 1)).toEqual({ glyph: '█', fg: '#ffff00', bg: null });
    // Пустые прозрачные ячейки в документ не попадают.
    expect(bottom.cells.size).toBe(3);
    expect(top.cells.size).toBe(1);
  });

  it('читает старые файлы без номера версии', () => {
    const doc = frameDocument(parseXp(xpBytes(sample, false), 'old'), 0);
    expect(getCell(doc.layers[0].cells, 0, 0)?.glyph).toBe('A');
  });

  it('ячейки идут по столбцам: (2, 0) не путается с (0, 1)', () => {
    const doc = frameDocument(parseXp(xpBytes(sample), 'map'), 0);
    expect(getCell(doc.layers[0].cells, 2, 0)?.glyph).toBe('┌');
    expect(getCell(doc.layers[0].cells, 0, 1)?.glyph).toBe('');
  });

  it('обрезанный и испорченный файл — понятная ошибка, а не пустой документ', () => {
    const full = xpBytes(sample);
    expect(() => parseXp(full.subarray(0, full.length - 3), 'cut')).toThrow(/обрезан/);
    expect(() => parseXp(new Uint8Array([1, 2]), 'tiny')).toThrow(/обрезан/);
    const noLayers = xpBytes([]);
    expect(() => parseXp(noLayers, 'none')).toThrow(/число слоёв/);
    // Версия, один слой, ширина 5000 при пределе 1024 — до чтения ячеек дело не доходит.
    const version = xpBytes([]).slice(0, 4);
    const tooWide = new Uint8Array([...version, 1, 0, 0, 0, 0x88, 0x13, 0, 0, 1, 0, 0, 0]);
    expect(() => parseXp(tooWide, 'wide')).toThrow(/не поддерживается/);
  });
});

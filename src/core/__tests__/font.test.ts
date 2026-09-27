import { describe, expect, it } from 'vitest';
import { fromBase64 } from '../base64';
import {
  BUILTIN_FONT,
  cellAspect,
  createUserFont,
  userFontId,
  validCell,
  vectorCell,
  vectorLayout,
} from '../font/font';
import { glyphGroups } from '../font/charset';
import { FontFileError, isSfnt, parseSfnt } from '../font/sfnt';
import { TILESET_CHARS, isPng, tilesetCell, tilesetIndex, tilesetInk } from '../font/tileset';
import ttf from '../../../public/fonts/PressStart2P-Regular.ttf?inline';
import { buildTtf, square } from './helpers/ttf';

const pressStart = fromBase64(ttf.slice(ttf.indexOf(',') + 1));

/** Шрифт VGA 8×16: пиксель — 128 единиц, строка 12 пикселей вверх и 4 вниз. */
const vga = buildTtf({
  unitsPerEm: 2048,
  ascender: 1536,
  descender: -512,
  advance: 1024,
  glyphs: [
    { code: 0x30, points: square(128, 0, 256) },
    { code: 0x41, points: square(0, -512, 128) },
    { code: 0x2500, points: square(0, 384, 1024) },
  ],
});

describe('разбор TTF', () => {
  it('Press Start 2P — пиксельный шрифт 8×8: пиксель 125 единиц, строка в кегль', () => {
    const info = parseSfnt(pressStart);
    expect(info).toMatchObject({ unitsPerEm: 1000, ascender: 1000, descender: 0, pixel: 125 });
    expect(vectorCell(info)).toEqual({ cellWidth: 8, cellHeight: 8 });
    expect(vectorLayout(info, 8)).toEqual({ size: 8, baseline: 8, pixel: true });
    expect(info.codePoints).toContain(0x416);
    expect(info.codePoints).not.toContain(0x2500);
  });

  it('сетка из контуров: у шрифта VGA ячейка 8×16, базовая линия на 12-м пикселе', () => {
    const info = parseSfnt(vga);
    expect(info.codePoints).toEqual([0x30, 0x41, 0x2500]);
    expect(info.pixel).toBe(128);
    expect(info.advance).toBe(1024);
    expect(vectorCell(info)).toEqual({ cellWidth: 8, cellHeight: 16 });
    // Ячейку сделали на два пикселя выше: поле делится поровну.
    expect(vectorLayout(info, 18)).toEqual({ size: 16, baseline: 13, pixel: true });
  });

  it('кривая в контуре — шрифт не пиксельный: высота 16, ширина по знаку', () => {
    const curved = buildTtf({
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      advance: 600,
      glyphs: [
        {
          code: 0x4d,
          points: [
            [0, 0, true],
            [300, 700, false],
            [600, 0, true],
          ],
        },
      ],
    });
    const info = parseSfnt(curved);
    expect(info.pixel).toBeNull();
    expect(vectorCell(info)).toEqual({ cellWidth: 10, cellHeight: 16 });
    const layout = vectorLayout(info, 16);
    expect(layout.size).toBeCloseTo(16);
    expect(layout.baseline).toBeCloseTo(12.8);
    expect(layout.pixel).toBe(false);
  });

  it('чужой или битый файл — ошибка разбора, а не мусор', () => {
    expect(isSfnt(vga)).toBe(true);
    const woff = new TextEncoder().encode('wOFF0000000000000000');
    expect(isSfnt(woff)).toBe(false);
    expect(() => parseSfnt(woff)).toThrow(FontFileError);
    expect(() => parseSfnt(vga.slice(0, 200))).toThrow(FontFileError);
  });
});

describe('шрифт документа', () => {
  it('встроенный — квадратная ячейка 8×8; свой — с отпечатком данных', () => {
    expect(cellAspect(BUILTIN_FONT)).toBe(1);
    const font = createUserFont('VGA', 'vector', vga, 8, 16);
    expect(cellAspect(font)).toBe(0.5);
    expect(font.id).toBe(userFontId(vga));
    expect(userFontId(vga)).not.toBe(userFontId(pressStart));
    expect(() => createUserFont('x', 'vector', vga, 8, 40)).toThrow(RangeError);
    expect(validCell(8, 32)).toBe(true);
    expect(validCell(8, 33)).toBe(false);
    expect(validCell(1, 1)).toBe(false);
  });
});

describe('лист символов CP437', () => {
  it('ячейка — шестнадцатая часть картинки по каждой оси', () => {
    expect(tilesetCell(128, 256)).toEqual({ cellWidth: 8, cellHeight: 16 });
    expect(tilesetCell(192, 192)).toEqual({ cellWidth: 12, cellHeight: 12 });
    expect(tilesetCell(100, 100)).toBeNull();
    expect(isPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(true);
    expect(isPng(vga)).toBe(false);
  });

  it('символ — светлое и непрозрачное; пурпурный фон — не символ; тёмное по светлому обращается', () => {
    const px = (...colors: number[][]): number[] => colors.flat();
    const white = [255, 255, 255, 255];
    const magenta = [255, 0, 255, 255];
    const clear = [255, 255, 255, 0];
    expect([...tilesetInk(px(white, magenta, clear, magenta), 4, 1)]).toEqual([255, 0, 0, 0]);
    const black = [0, 0, 0, 255];
    expect([...tilesetInk(px(black, white, white, white), 4, 1)]).toEqual([255, 0, 0, 0]);
  });

  it('символ документа — код CP437, неизвестный — знак вопроса', () => {
    expect(tilesetIndex('A')).toBe(0x41);
    expect(tilesetIndex('═')).toBe(0xcd);
    expect(tilesetIndex('☺')).toBe(1);
    expect(tilesetIndex('Ж')).toBe(0x3f);
    expect(TILESET_CHARS).toHaveLength(253);
    expect(TILESET_CHARS).not.toContain(' ');
  });
});

describe('группы символов', () => {
  it('только то, что в шрифте есть, без пробелов и управляющих', () => {
    const groups = glyphGroups([0x20, 0x41, 0x42, 0x416, 0x2550, 0x2192, 0x300, 0x4e00]);
    expect(groups).toEqual([
      { title: 'ASCII', chars: 'AB' },
      { title: 'Кириллица', chars: 'Ж' },
      { title: 'Рамки и блоки', chars: '═' },
      { title: 'Знаки', chars: '→' },
      { title: 'Прочее', chars: '一' },
    ]);
  });

  it('Press Start 2P: группы из его cmap — те же, что были выписаны руками', () => {
    const groups = glyphGroups(parseSfnt(pressStart).codePoints);
    expect(groups.map((g) => g.title)).toEqual([
      'ASCII',
      'Латиница',
      'Греческий',
      'Кириллица',
      'Знаки',
      'Прочее',
    ]);
    expect([...groups[0].chars]).toHaveLength(94);
    expect([...groups[3].chars]).toHaveLength(184);
  });
});

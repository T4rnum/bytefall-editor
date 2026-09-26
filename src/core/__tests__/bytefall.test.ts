import { describe, expect, it } from 'vitest';
import { createAnimation } from '../animation';
import { makeCell } from '../cell';
import { GLYPH_BYTES, atlasGrid, packBytefall, unpackBytefall } from '../bytefall';
import { createDocument } from '../document';
import { composeFrame } from '../frame';
import { keyOf } from '../grid';
import { addObject, createObject, transformObject } from '../object';
import { runtimeFrame, usedGlyphs } from '../runtime';

/** Холст 8×4: на слое «AB» с синим фоном под «A», объект «@», повёрнутый на 90°. */
function scene() {
  const base = createDocument({ width: 8, height: 4, background: '#000000' });
  const layer = base.layers[0];
  const cells = new Map([
    [keyOf(1, 1), makeCell('A', '#ff0000', '#0000ff')],
    [keyOf(2, 1), makeCell('B', '#00ff00')],
  ]);
  const doc = { ...base, layers: [{ ...layer, cells }] };
  const obj = createObject({
    name: 'o',
    layerId: layer.id,
    id: 'o',
    x: 5,
    y: 2,
    cells: new Map([[keyOf(0, 0), makeCell('@', '#ffffff')]]),
  });
  return transformObject(addObject(doc, obj), 'o', { rot: 90 });
}

describe('кадр для рантайма', () => {
  it('ячейки и свободные символы одним потоком, по порядку отрисовки', () => {
    const frame = runtimeFrame(composeFrame(scene()), 100);
    expect(frame.glyphs.map((g) => g.glyph)).toEqual(['A', 'B', '@']);
    const [a, , at] = frame.glyphs;
    expect(a).toMatchObject({ x: 1.5, y: 1.5, rot: 0, sx: 1, sy: 1 });
    expect(a.bg).toEqual({ r: 0, g: 0, b: 1, a: 1 });
    expect(at.x).toBeCloseTo(5.5, 5);
    expect(at.rot).toBeCloseTo(Math.PI / 2, 5);
    expect(usedGlyphs([frame])).toEqual(['A', 'B', '@']);
  });
});

describe('файл .bytefall', () => {
  it('переживает упаковку: заголовок, атлас, символы и цвета', () => {
    const doc = scene();
    const frames = [runtimeFrame(composeFrame(doc), 100), runtimeFrame(composeFrame(doc), 250)];
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const glyphs = usedGlyphs(frames);
    const bytes = packBytefall({
      header: {
        name: 'сцена',
        width: 8,
        height: 4,
        background: '#000000',
        fps: createAnimation(doc).fps,
        atlas: { cell: 16, columns: 16, rows: 1, glyphs },
      },
      atlasPng: png,
      frames,
    });
    const back = unpackBytefall(bytes);
    expect(back.header).toMatchObject({ format: 'bytefall', version: 1, name: 'сцена' });
    expect(back.header.frames).toEqual([
      { duration: 100, count: 3 },
      { duration: 250, count: 3 },
    ]);
    expect([...back.atlasPng]).toEqual([...png]);
    expect(back.frames[1].glyphs.map((g) => g.glyph)).toEqual(['A', 'B', '@']);
    expect(back.frames[0].glyphs[0].bg).toEqual({ r: 0, g: 0, b: 1, a: 1 });
    expect(back.frames[0].glyphs[2].rot).toBeCloseTo(Math.PI / 2, 5);
    // Символы — ровно 32 байта каждый, в хвосте файла.
    expect(bytes.length % 4).toBe(0);
    expect(bytes.length).toBeGreaterThanOrEqual(6 * GLYPH_BYTES);
  });

  it('чужой и оборванный файл — ошибка, а не мусор', () => {
    expect(() => unpackBytefall(new Uint8Array(32))).toThrow(/Not a \.bytefall/);
    const frames = [runtimeFrame(composeFrame(scene()), 100)];
    const bytes = packBytefall({
      header: {
        name: 's',
        width: 8,
        height: 4,
        background: null,
        fps: 20,
        atlas: { cell: 8, columns: 4, rows: 1, glyphs: usedGlyphs(frames) },
      },
      atlasPng: new Uint8Array(0),
      frames,
    });
    expect(() => unpackBytefall(bytes.subarray(0, bytes.length - 10))).toThrow(/Truncated/);
  });

  it('атлас почти квадратный, белая ячейка входит в счёт, предел — 4096 пикселей', () => {
    expect(atlasGrid(0, 32)).toEqual({ columns: 1, rows: 1 });
    expect(atlasGrid(3, 32)).toEqual({ columns: 2, rows: 2 });
    expect(atlasGrid(95, 32)).toEqual({ columns: 10, rows: 10 });
    expect(() => atlasGrid(128 * 128, 32)).toThrow(/Too many/);
  });
});

import { describe, expect, it } from 'vitest';
import { createAnimation } from '../animation';
import { makeCell } from '../cell';
import {
  BYTEFALL_VERSION,
  GLYPH_BYTES,
  type BytefallAtlas,
  atlasGrid,
  packBytefall,
  unpackBytefall,
} from '../bytefall';
import { createDocument } from '../document';
import { composeFrame } from '../frame';
import { keyOf } from '../grid';
import {
  DEFAULT_GLOW,
  DEFAULT_OUTLINE,
  DEFAULT_SHINE,
  MATERIAL,
  MATERIAL_FLOATS,
} from '../material';
import { addObject, createObject, transformObject, updateObject } from '../object';
import { mergeRepeats, runtimeFrame, usedGlyphs } from '../runtime';
import { materialGraph } from './helpers/graphs';

/** Сцена со свечением и контуром у объекта «@» и, по желанию, бегущим бликом. */
function glowing(shine = false) {
  return updateObject(scene(), 'o', {
    graph: materialGraph('o', {
      outline: DEFAULT_OUTLINE,
      glow: DEFAULT_GLOW,
      shine: shine ? DEFAULT_SHINE : null,
      dither: null,
    }),
  });
}

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

/**
 * Тот же файл, записанный версией 1: таблица материалов по 17 чисел, квадратная ячейка `cell`
 * без сетки шрифта, контур в ячейках сетки 8×8.
 */
function asVersion1(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(16, 16 + length))) as {
    materials: number[];
    atlas: BytefallAtlas;
  };
  const rows = header.materials.length / MATERIAL_FLOATS;
  const materials = Array.from({ length: rows }, (_, r) => {
    const row = header.materials.slice(r * MATERIAL_FLOATS, r * MATERIAL_FLOATS + 17);
    row[MATERIAL.outline + 3] /= 8;
    return row;
  }).flat();
  const { cellWidth, columns, rows: atlasRows, glyphs } = header.atlas;
  const atlas = { cell: cellWidth, columns, rows: atlasRows, glyphs };
  const json = new TextEncoder().encode(
    JSON.stringify({ ...header, version: 1, materials, atlas }),
  );
  const out = new Uint8Array(16 + json.length + bytes.length - 16 - length);
  out.set(bytes.subarray(0, 16));
  out.set(json, 16);
  out.set(bytes.subarray(16 + length), 16 + json.length);
  const outView = new DataView(out.buffer);
  outView.setUint16(8, 1, true);
  outView.setUint32(12, json.length, true);
  return out;
}

/** Атлас Press Start 2P на экспорте: ячейка 8×8 пикселей при сетке шрифта 8×8. */
const SQUARE = { cellWidth: 8, cellHeight: 8, gridWidth: 8, gridHeight: 8 } as const;

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

  it('одинаковые кадры подряд склеиваются, длительности складываются', () => {
    const still = runtimeFrame(composeFrame(scene()), 50);
    const moved = runtimeFrame(composeFrame(transformObject(scene(), 'o', { rot: 45 })), 50);
    const merged = mergeRepeats([still, still, moved, moved, moved, still]);
    expect(merged.map((f) => f.duration)).toEqual([100, 150, 50]);
    expect(merged[1].glyphs[2].rot).toBeCloseTo(Math.PI / 4, 5);
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
        atlas: { ...SQUARE, cellWidth: 16, cellHeight: 16, columns: 16, rows: 1, glyphs },
      },
      atlasPng: png,
      frames,
    });
    const back = unpackBytefall(bytes);
    expect(back.header).toMatchObject({
      format: 'bytefall',
      version: BYTEFALL_VERSION,
      name: 'сцена',
    });
    expect(back.header.frames).toEqual([
      { time: 0, duration: 100, count: 3 },
      { time: 0, duration: 250, count: 3 },
    ]);
    expect(back.header.materials).toEqual([]);
    expect([...back.atlasPng]).toEqual([...png]);
    expect(back.frames[1].glyphs.map((g) => g.glyph)).toEqual(['A', 'B', '@']);
    expect(back.frames[0].glyphs[0].bg).toEqual({ r: 0, g: 0, b: 1, a: 1 });
    expect(back.frames[0].glyphs[2].rot).toBeCloseTo(Math.PI / 2, 5);
    // Символы — ровно 32 байта каждый, в хвосте файла.
    const json = new DataView(bytes.buffer).getUint32(12, true);
    expect(bytes.length).toBe(16 + json + 4 + png.length + 6 * GLYPH_BYTES);
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
        atlas: { ...SQUARE, columns: 4, rows: 1, glyphs: usedGlyphs(frames) },
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
    // Ячейка 16×32: столбцов больше, чем строк, — квадратом атлас получается в пикселях.
    expect(atlasGrid(95, 16, 32)).toEqual({ columns: 14, rows: 7 });
  });

  it('материалы: таблица в заголовке, подложки перед символами прохода', () => {
    const frame = runtimeFrame(composeFrame(glowing()), 100);
    expect(frame.glyphs.map((g) => `${g.glyph}${g.under ? '_' : ''}`)).toEqual([
      'A',
      'B',
      '@_',
      '@',
    ]);
    const bytes = packBytefall({
      header: {
        name: 's',
        width: 8,
        height: 4,
        background: null,
        fps: 20,
        atlas: { ...SQUARE, columns: 2, rows: 2, glyphs: usedGlyphs([frame]) },
      },
      atlasPng: new Uint8Array(0),
      frames: [frame],
    });
    const back = unpackBytefall(bytes);
    expect(back.header.materials).toHaveLength(MATERIAL_FLOATS);
    const [a, , under, at] = back.frames[0].glyphs;
    expect(a.material).toBeNull();
    expect(under.under).toBe(true);
    expect(at.under).toBe(false);
    expect(at.material?.[MATERIAL.glow + 3]).toBeCloseTo(DEFAULT_GLOW.radius, 5);
    expect(at.material).toEqual(under.material);

    // Файл версии 1: 17 чисел на материал, хвост читатель добивает нулями, контур — из ячеек
    // в пиксели шрифта, ячейка квадратная, сетка 8×8.
    const v1 = unpackBytefall(asVersion1(bytes));
    const old = v1.frames[0].glyphs[3];
    expect(old.material).toHaveLength(MATERIAL_FLOATS);
    expect(old.material?.slice(0, 17)).toEqual(at.material?.slice(0, 17));
    expect(old.material?.slice(17)).toEqual([0, 0, 0]);
    expect(v1.header.atlas).toMatchObject({ ...SQUARE, columns: 2, rows: 2 });
  });

  it('бегущий блик не даёт склеить кадры, даже если символы стоят', () => {
    const still = runtimeFrame(composeFrame(glowing()), 50);
    expect(mergeRepeats([still, still])).toHaveLength(1);
    const shining = runtimeFrame(composeFrame(glowing(true)), 50);
    expect(mergeRepeats([shining, shining])).toHaveLength(2);
  });
});

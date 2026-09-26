import { MATERIAL_FLOATS } from './material';
import type { RuntimeFrame, RuntimeGlyph } from './runtime';
import { fromUtf8, utf8 } from './utf8';

/**
 * Файл `.bytefall` для рантаймов движков (DESIGN.md, раздел 7, уровень 2). Всё в одном файле,
 * числа младшим байтом вперёд:
 *
 * - `BYTEFALL`, версия u16, запас u16;
 * - длина заголовка u32 и сам заголовок JSON в UTF-8 (`BytefallHeader`);
 * - длина атласа u32 и атлас PNG: ячейки `cell` пикселей, `columns` в строке, ячейка 0 залита
 *   белым — по ней рисуются фоны, символ `glyphs[i]` лежит в ячейке `i + 1`;
 * - кадры подряд, по `count` символов в каждом, символ — 32 байта: x, y, поворот, sx, sy во
 *   float32, номер ячейки атласа u16 (0 — только фон), материал u16, цвет символа и фона по RGBA
 *   байтами.
 *
 * Материал символа: младшие 15 бит — номер в таблице `materials` заголовка, считая с 1 (0 — без
 * материала), старший бит — подложка (`RuntimeGlyph.under`): рисуется с полем вокруг ячейки,
 * только контур и свечение, фон не рисуется. Таблица — `MATERIAL_FLOATS` чисел на материал подряд
 * в раскладке `MATERIAL` из `core/material.ts`, цвета sRGB.
 *
 * Фон — белая ячейка атласа с цветом фона, символ — его ячейка с цветом символа; материал
 * рантайм считает своим шейдером.
 */
export const BYTEFALL_MAGIC = 'BYTEFALL';
export const BYTEFALL_VERSION = 1;
export const GLYPH_BYTES = 32;

export interface BytefallHeader {
  readonly format: 'bytefall';
  readonly version: number;
  readonly name: string;
  /** Размер холста в ячейках. */
  readonly width: number;
  readonly height: number;
  /** Цвет холста `#rrggbb` или null — прозрачный. */
  readonly background: string | null;
  readonly fps: number;
  readonly atlas: {
    readonly cell: number;
    readonly columns: number;
    readonly rows: number;
    readonly glyphs: readonly string[];
  };
  /** Таблица материалов, по `MATERIAL_FLOATS` чисел подряд. */
  readonly materials: readonly number[];
  /** Кадры: момент сцены и длительность в мс, число символов. */
  readonly frames: readonly {
    readonly time: number;
    readonly duration: number;
    readonly count: number;
  }[];
}

export interface BytefallFile {
  readonly header: BytefallHeader;
  readonly atlasPng: Uint8Array;
  readonly frames: readonly RuntimeFrame[];
}

/** Предел стороны атласа в пикселях: столько берёт любая видеокарта и любой движок. */
export const MAX_ATLAS_SIDE = 4096;

/** Сетка атласа почти квадратом: белая ячейка и символы. Не влезает в предел — ошибка. */
export function atlasGrid(glyphCount: number, cell: number): { columns: number; rows: number } {
  const cells = glyphCount + 1;
  const columns = Math.ceil(Math.sqrt(cells));
  const rows = Math.ceil(cells / columns);
  if (columns * cell > MAX_ATLAS_SIDE) {
    throw new Error(`Too many distinct glyphs for one atlas: ${glyphCount}`);
  }
  return { columns, rows };
}

const byte = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);

const UNDER_BIT = 0x8000;
const MAX_MATERIALS = UNDER_BIT - 1;

function writeGlyph(
  view: DataView,
  at: number,
  g: RuntimeGlyph,
  index: number,
  material: number,
): void {
  [g.x, g.y, g.rot, g.sx, g.sy].forEach((v, i) => view.setFloat32(at + i * 4, v, true));
  view.setUint16(at + 20, index, true);
  view.setUint16(at + 22, material | (g.under ? UNDER_BIT : 0), true);
  [g.fg.r, g.fg.g, g.fg.b, g.fg.a, g.bg.r, g.bg.g, g.bg.b, g.bg.a].forEach((v, i) =>
    view.setUint8(at + 24 + i, byte(v)),
  );
}

/** Таблица материалов кадров: одинаковые — одной записью. Номера с 1, 0 — без материала. */
function materialTable(frames: readonly RuntimeFrame[]): {
  readonly flat: number[];
  readonly index: Map<string, number>;
} {
  const flat: number[] = [];
  const index = new Map<string, number>();
  for (const frame of frames) {
    for (const { material } of frame.glyphs) {
      if (!material) continue;
      const key = material.join(',');
      if (index.has(key)) continue;
      if (index.size >= MAX_MATERIALS) throw new Error('Too many distinct materials');
      index.set(key, index.size + 1);
      flat.push(...material);
    }
  }
  return { flat, index };
}

/** Упаковывает файл. Заголовок строится из кадров: число символов и материалы — по факту. */
export function packBytefall(file: {
  readonly header: Omit<BytefallHeader, 'format' | 'version' | 'frames' | 'materials'>;
  readonly atlasPng: Uint8Array;
  readonly frames: readonly RuntimeFrame[];
}): Uint8Array {
  const materials = materialTable(file.frames);
  const header: BytefallHeader = {
    ...file.header,
    format: 'bytefall',
    version: BYTEFALL_VERSION,
    materials: materials.flat,
    frames: file.frames.map((f) => ({
      time: f.time,
      duration: f.duration,
      count: f.glyphs.length,
    })),
  };
  const json = utf8(JSON.stringify(header));
  const glyphs = file.frames.reduce((sum, f) => sum + f.glyphs.length, 0);
  const size = 12 + 4 + json.length + 4 + file.atlasPng.length + glyphs * GLYPH_BYTES;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set(utf8(BYTEFALL_MAGIC), 0);
  view.setUint16(8, BYTEFALL_VERSION, true);
  let at = 12;
  view.setUint32(at, json.length, true);
  out.set(json, at + 4);
  at += 4 + json.length;
  view.setUint32(at, file.atlasPng.length, true);
  out.set(file.atlasPng, at + 4);
  at += 4 + file.atlasPng.length;
  const index = new Map(header.atlas.glyphs.map((g, i) => [g, i + 1]));
  for (const frame of file.frames) {
    for (const g of frame.glyphs) {
      const cell = g.glyph === '' ? 0 : (index.get(g.glyph) ?? 0);
      const material = g.material ? (materials.index.get(g.material.join(',')) ?? 0) : 0;
      writeGlyph(view, at, g, cell, material);
      at += GLYPH_BYTES;
    }
  }
  return out;
}

function readGlyph(view: DataView, at: number, header: BytefallHeader): RuntimeGlyph {
  const f = (i: number): number => view.getFloat32(at + i * 4, true);
  const c = (i: number): number => view.getUint8(at + 24 + i) / 255;
  const index = view.getUint16(at + 20, true);
  const flags = view.getUint16(at + 22, true);
  const material = flags & MAX_MATERIALS;
  const start = (material - 1) * MATERIAL_FLOATS;
  return {
    x: f(0),
    y: f(1),
    rot: f(2),
    sx: f(3),
    sy: f(4),
    glyph: index === 0 ? '' : (header.atlas.glyphs[index - 1] ?? ''),
    fg: { r: c(0), g: c(1), b: c(2), a: c(3) },
    bg: { r: c(4), g: c(5), b: c(6), a: c(7) },
    material: material === 0 ? null : header.materials.slice(start, start + MATERIAL_FLOATS),
    under: (flags & UNDER_BIT) !== 0,
  };
}

/** Читает файл; чужой или оборванный — ошибка с причиной. */
export function unpackBytefall(bytes: Uint8Array): BytefallFile {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 16 || fromUtf8(bytes.subarray(0, 8)) !== BYTEFALL_MAGIC) {
    throw new Error('Not a .bytefall file');
  }
  let at = 12;
  const jsonLength = view.getUint32(at, true);
  const header = JSON.parse(
    fromUtf8(bytes.subarray(at + 4, at + 4 + jsonLength)),
  ) as BytefallHeader;
  at += 4 + jsonLength;
  const atlasLength = view.getUint32(at, true);
  const atlasPng = bytes.slice(at + 4, at + 4 + atlasLength);
  at += 4 + atlasLength;
  const frames = header.frames.map(({ time, duration, count }) => {
    if (at + count * GLYPH_BYTES > bytes.length) throw new Error('Truncated .bytefall file');
    const glyphs = Array.from({ length: count }, (_, i) =>
      readGlyph(view, at + i * GLYPH_BYTES, header),
    );
    at += count * GLYPH_BYTES;
    return { time, duration, glyphs };
  });
  return { header, atlasPng, frames };
}

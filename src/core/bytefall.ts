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
 *   float32, номер ячейки атласа u16 (0 — только фон), запас u16, цвет символа и фона по RGBA
 *   байтами.
 *
 * Рантайму нужен один материал «текстура × цвет вершины»: фон — белая ячейка с цветом фона,
 * символ — его ячейка с цветом символа.
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
  readonly frames: readonly { readonly duration: number; readonly count: number }[];
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

function writeGlyph(view: DataView, at: number, g: RuntimeGlyph, index: number): void {
  [g.x, g.y, g.rot, g.sx, g.sy].forEach((v, i) => view.setFloat32(at + i * 4, v, true));
  view.setUint16(at + 20, index, true);
  view.setUint16(at + 22, 0, true);
  [g.fg.r, g.fg.g, g.fg.b, g.fg.a, g.bg.r, g.bg.g, g.bg.b, g.bg.a].forEach((v, i) =>
    view.setUint8(at + 24 + i, byte(v)),
  );
}

/** Упаковывает файл. Заголовок строится из кадров: число символов у каждого — по факту. */
export function packBytefall(file: {
  readonly header: Omit<BytefallHeader, 'format' | 'version' | 'frames'>;
  readonly atlasPng: Uint8Array;
  readonly frames: readonly RuntimeFrame[];
}): Uint8Array {
  const header: BytefallHeader = {
    ...file.header,
    format: 'bytefall',
    version: BYTEFALL_VERSION,
    frames: file.frames.map((f) => ({ duration: f.duration, count: f.glyphs.length })),
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
      writeGlyph(view, at, g, g.glyph === '' ? 0 : (index.get(g.glyph) ?? 0));
      at += GLYPH_BYTES;
    }
  }
  return out;
}

function readGlyph(view: DataView, at: number, glyphs: readonly string[]): RuntimeGlyph {
  const f = (i: number): number => view.getFloat32(at + i * 4, true);
  const c = (i: number): number => view.getUint8(at + 24 + i) / 255;
  const index = view.getUint16(at + 20, true);
  return {
    x: f(0),
    y: f(1),
    rot: f(2),
    sx: f(3),
    sy: f(4),
    glyph: index === 0 ? '' : (glyphs[index - 1] ?? ''),
    fg: { r: c(0), g: c(1), b: c(2), a: c(3) },
    bg: { r: c(4), g: c(5), b: c(6), a: c(7) },
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
  const frames = header.frames.map(({ duration, count }) => {
    if (at + count * GLYPH_BYTES > bytes.length) throw new Error('Truncated .bytefall file');
    const glyphs = Array.from({ length: count }, (_, i) =>
      readGlyph(view, at + i * GLYPH_BYTES, header.atlas.glyphs),
    );
    at += count * GLYPH_BYTES;
    return { duration, glyphs };
  });
  return { header, atlasPng, frames };
}

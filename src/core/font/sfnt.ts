/**
 * Чтение TTF/OTF без зависимостей: только то, что нужно шрифту документа, — метрики, набор
 * символов из `cmap` и размер пикселя пиксельного шрифта из контуров `glyf`. Файл недоверенный:
 * чтение за концом таблицы — ошибка, а не мусор.
 */

export class FontFileError extends Error {
  override readonly name = 'FontFileError';
}

export interface SfntInfo {
  readonly unitsPerEm: number;
  /** Верх и низ строки из `hhea`, в единицах шрифта; низ отрицательный. */
  readonly ascender: number;
  readonly descender: number;
  /** Ширина «M» (или «0»), в единицах шрифта: по ней считается ширина ячейки. */
  readonly advance: number;
  /**
   * Пиксель пиксельного шрифта в единицах шрифта; null — шрифт не пиксельный: в контурах есть
   * кривые или точки не ложатся на общую сетку.
   */
  readonly pixel: number | null;
  /** Символы, у которых в шрифте есть глиф, по возрастанию. */
  readonly codePoints: readonly number[];
}

/** Больше символов не читается: шрифт на всю плоскость Unicode редактору ни к чему. */
const MAX_CODE_POINTS = 65536;
/** Сколько глифов ASCII смотреть, чтобы найти пиксель. */
const PIXEL_SAMPLE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#@%&';
/** Пиксель мельче этой доли кегля — не пиксель, а случайный общий делитель координат. */
const MAX_EM_PIXELS = 64;

class Reader {
  constructor(private readonly view: DataView) {}

  private check(at: number, size: number): void {
    if (at < 0 || at + size > this.view.byteLength) throw new FontFileError('font file truncated');
  }
  u8(at: number): number {
    this.check(at, 1);
    return this.view.getUint8(at);
  }
  u16(at: number): number {
    this.check(at, 2);
    return this.view.getUint16(at);
  }
  i16(at: number): number {
    this.check(at, 2);
    return this.view.getInt16(at);
  }
  u32(at: number): number {
    this.check(at, 4);
    return this.view.getUint32(at);
  }
}

const SFNT_TAGS = [0x00010000, 0x4f54544f /* OTTO */, 0x74727565 /* true */];

/** Файл похож на TTF/OTF: по первым четырём байтам. */
export function isSfnt(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const tag = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
  return SFNT_TAGS.includes(tag);
}

function tableDirectory(r: Reader): Map<string, number> {
  const count = r.u16(4);
  const tables = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(r.u8(at), r.u8(at + 1), r.u8(at + 2), r.u8(at + 3));
    tables.set(tag, r.u32(at + 8));
  }
  return tables;
}

function required(tables: Map<string, number>, tag: string): number {
  const at = tables.get(tag);
  if (at === undefined) throw new FontFileError(`font has no ${tag} table`);
  return at;
}

export function parseSfnt(bytes: Uint8Array): SfntInfo {
  if (!isSfnt(bytes)) throw new FontFileError('not a TrueType or OpenType font');
  const r = new Reader(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  const tables = tableDirectory(r);
  const head = required(tables, 'head');
  const hhea = required(tables, 'hhea');
  const hmtx = required(tables, 'hmtx');
  const unitsPerEm = r.u16(head + 18);
  if (unitsPerEm === 0) throw new FontFileError('font has zero units per em');
  const ascender = r.i16(hhea + 4);
  const descender = r.i16(hhea + 6);
  if (ascender - descender <= 0) throw new FontFileError('font has empty line height');
  const metrics = Math.max(1, r.u16(hhea + 34));
  const glyphs = readCmap(r, required(tables, 'cmap'));
  const advanceOf = (glyph: number): number => r.u16(hmtx + 4 * Math.min(glyph, metrics - 1));
  const reference = glyphs.get(0x4d) ?? glyphs.get(0x30) ?? 0;
  return {
    unitsPerEm,
    ascender,
    descender,
    advance: advanceOf(reference) || unitsPerEm / 2,
    pixel: findPixel(r, tables, head, glyphs),
    codePoints: [...glyphs.keys()].sort((a, b) => a - b),
  };
}

/**
 * Подтаблица `cmap`: полный Unicode (формат 12), затем BMP (формат 4), затем символьная
 * кодировка — у старых пиксельных шрифтов коды лежат в U+F020…F0FF.
 */
function readCmap(r: Reader, cmap: number): Map<number, number> {
  let best = { rank: 0, at: 0 };
  const count = r.u16(cmap + 2);
  for (let i = 0; i < count; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = r.u16(rec);
    const encoding = r.u16(rec + 2);
    const at = cmap + r.u32(rec + 4);
    const format = r.u16(at);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    const rank =
      format === 12 && unicode
        ? 3
        : format === 4 && unicode
          ? 2
          : format === 4 && platform === 3
            ? 1
            : 0;
    if (rank > best.rank) best = { rank, at };
  }
  if (best.rank === 0) throw new FontFileError('font has no Unicode character map');
  const glyphs = new Map<number, number>();
  if (r.u16(best.at) === 12) readFormat12(r, best.at, glyphs);
  else readFormat4(r, best.at, glyphs);
  if (best.rank === 1) {
    for (const [code, glyph] of [...glyphs]) {
      if (code >= 0xf000 && code <= 0xf0ff && !glyphs.has(code - 0xf000))
        glyphs.set(code - 0xf000, glyph);
    }
  }
  return glyphs;
}

function readFormat4(r: Reader, at: number, out: Map<number, number>): void {
  const segX2 = r.u16(at + 6);
  const ends = at + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  for (let s = 0; s < segX2 / 2; s++) {
    const end = Math.min(r.u16(ends + 2 * s), 0xfffe);
    const start = r.u16(starts + 2 * s);
    const delta = r.u16(deltas + 2 * s);
    const rangeAt = ranges + 2 * s;
    const range = r.u16(rangeAt);
    for (let c = start; c <= end && out.size < MAX_CODE_POINTS; c++) {
      let glyph = range === 0 ? c : r.u16(rangeAt + range + 2 * (c - start));
      if (range !== 0 && glyph === 0) continue;
      glyph = (glyph + delta) & 0xffff;
      if (glyph !== 0) out.set(c, glyph);
    }
  }
}

function readFormat12(r: Reader, at: number, out: Map<number, number>): void {
  const groups = r.u32(at + 12);
  for (let i = 0; i < groups && out.size < MAX_CODE_POINTS; i++) {
    const g = at + 16 + i * 12;
    const start = r.u32(g);
    const end = Math.min(r.u32(g + 4), 0x10ffff);
    const first = r.u32(g + 8);
    for (let c = start; c <= end && out.size < MAX_CODE_POINTS; c++) {
      const glyph = first + (c - start);
      if (glyph !== 0) out.set(c, glyph);
    }
  }
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * Пиксель шрифта — общий делитель координат точек контуров. У пиксельного шрифта нет кривых:
 * все точки на кривой, и все кратны пикселю. Шрифт без `glyf` (OTF с CFF) пиксель не отдаёт.
 */
function findPixel(
  r: Reader,
  tables: Map<string, number>,
  head: number,
  glyphs: Map<number, number>,
): number | null {
  const glyf = tables.get('glyf');
  const loca = tables.get('loca');
  if (glyf === undefined || loca === undefined) return null;
  const long = r.i16(head + 50) === 1;
  const offset = (g: number): number => (long ? r.u32(loca + 4 * g) : r.u16(loca + 2 * g) * 2);
  let pixel = 0;
  for (const ch of PIXEL_SAMPLE) {
    const glyph = glyphs.get(ch.codePointAt(0) as number);
    if (glyph === undefined) continue;
    const start = offset(glyph);
    if (offset(glyph + 1) <= start) continue;
    const points = glyphPoints(r, glyf + start);
    if (points === null) return null;
    for (const v of points) pixel = gcd(pixel, Math.abs(v));
  }
  const unitsPerEm = r.u16(head + 18);
  if (pixel === 0 || unitsPerEm / pixel > MAX_EM_PIXELS) return null;
  return pixel;
}

/** Координаты точек простого глифа подряд: x, y, x, y… null — в глифе есть кривые. */
function glyphPoints(r: Reader, at: number): number[] | null {
  const contours = r.i16(at);
  if (contours <= 0) return [];
  const count = r.u16(at + 10 + 2 * (contours - 1)) + 1;
  let p = at + 10 + 2 * contours;
  p += 2 + r.u16(p);
  const flags: number[] = [];
  while (flags.length < count) {
    const flag = r.u8(p++);
    if ((flag & 1) === 0) return null;
    flags.push(flag);
    if (flag & 8) {
      const repeat = r.u8(p++);
      for (let i = 0; i < repeat && flags.length < count; i++) flags.push(flag);
    }
  }
  const out = new Array<number>(count * 2);
  p = readCoordinates(r, p, flags, 2, 16, out, 0);
  readCoordinates(r, p, flags, 4, 32, out, 1);
  return out;
}

/**
 * Одна ось координат глифа: короткий шаг байтом со знаком во флаге, длинный — i16, либо та же
 * координата. Пишет в `out` через одну, начиная с `axis`, и возвращает, где кончились данные.
 */
function readCoordinates(
  r: Reader,
  at: number,
  flags: readonly number[],
  short: number,
  same: number,
  out: number[],
  axis: number,
): number {
  let p = at;
  let v = 0;
  flags.forEach((f, i) => {
    if (f & short) {
      v += (f & same ? 1 : -1) * r.u8(p);
      p += 1;
    } else if (!(f & same)) {
      v += r.i16(p);
      p += 2;
    }
    out[2 * i + axis] = v;
  });
  return p;
}

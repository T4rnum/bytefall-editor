/**
 * Минимальный TTF для тестов разбора: head, hhea, maxp, hmtx, cmap формата 4, loca и glyf.
 * Каждый глиф — один контур из точек `[x, y, наКривой]`.
 */
export interface TestGlyph {
  readonly code: number;
  readonly points: readonly (readonly [number, number, boolean])[];
}

export interface TestFont {
  readonly unitsPerEm: number;
  readonly ascender: number;
  readonly descender: number;
  readonly advance: number;
  readonly glyphs: readonly TestGlyph[];
}

class Bytes {
  readonly out: number[] = [];
  u8(v: number): this {
    this.out.push(v & 255);
    return this;
  }
  u16(v: number): this {
    return this.u8(v >> 8).u8(v);
  }
  u32(v: number): this {
    return this.u16(v >>> 16).u16(v);
  }
}

function glyph(g: TestGlyph): number[] {
  const b = new Bytes()
    .u16(1)
    .u16(0)
    .u16(0)
    .u16(0)
    .u16(0)
    .u16(g.points.length - 1)
    .u16(0);
  for (const [, , on] of g.points) b.u8(on ? 1 : 0);
  g.points.forEach(([x], i) => b.u16(x - (i > 0 ? g.points[i - 1][0] : 0)));
  g.points.forEach(([, y], i) => b.u16(y - (i > 0 ? g.points[i - 1][1] : 0)));
  if (b.out.length % 2) b.u8(0);
  return b.out;
}

/** cmap формата 4: сегмент на глиф и завершающий 0xFFFF. Глиф i + 1 — символ glyphs[i]. */
function cmap(glyphs: readonly TestGlyph[]): number[] {
  const codes = glyphs.map((g) => g.code);
  const seg = codes.length + 1;
  const b = new Bytes().u16(0).u16(1).u16(3).u16(1).u32(12);
  b.u16(4)
    .u16(16 + seg * 8)
    .u16(0)
    .u16(seg * 2)
    .u16(0)
    .u16(0)
    .u16(0);
  for (const c of codes) b.u16(c);
  b.u16(0xffff).u16(0);
  for (const c of codes) b.u16(c);
  b.u16(0xffff);
  codes.forEach((c, i) => b.u16((i + 1 - c) & 0xffff));
  b.u16(1);
  for (let i = 0; i < seg; i++) b.u16(0);
  return b.out;
}

export function buildTtf(font: TestFont): Uint8Array {
  const glyphData = font.glyphs.map(glyph);
  const loca = new Bytes().u32(0).u32(0);
  let offset = 0;
  for (const g of glyphData) loca.u32((offset += g.length));
  const head = new Bytes().u32(0x10000).u32(0).u32(0).u32(0x5f0f3cf5).u16(0).u16(font.unitsPerEm);
  for (let i = 0; i < 15; i++) head.u16(0);
  head.u16(1).u16(0);
  const hhea = new Bytes().u32(0x10000).u16(font.ascender).u16(font.descender);
  for (let i = 0; i < 13; i++) hhea.u16(0);
  hhea.u16(1);
  const tables: [string, number[]][] = [
    ['cmap', cmap(font.glyphs)],
    ['glyf', glyphData.flat()],
    ['head', head.out],
    ['hhea', hhea.out],
    ['hmtx', new Bytes().u16(font.advance).u16(0).out],
    ['loca', loca.out],
    ['maxp', new Bytes().u32(0x5000).u16(font.glyphs.length + 1).out],
  ];
  const b = new Bytes().u32(0x10000).u16(tables.length).u16(0).u16(0).u16(0);
  let at = 12 + tables.length * 16;
  for (const [tag, data] of tables) {
    for (const ch of tag) b.u8(ch.charCodeAt(0));
    b.u32(0).u32(at).u32(data.length);
    at += data.length + ((4 - (data.length % 4)) % 4);
  }
  for (const [, data] of tables) {
    b.out.push(...data);
    while (b.out.length % 4) b.u8(0);
  }
  return new Uint8Array(b.out);
}

/** Квадрат пикселя шрифта: 4 точки на кривой. */
export const square = (x: number, y: number, size: number): TestGlyph['points'] => [
  [x, y, true],
  [x, y + size, true],
  [x + size, y + size, true],
  [x + size, y, true],
];

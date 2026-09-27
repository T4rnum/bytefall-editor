import { describe, expect, it } from 'vitest';
import { createAnimation } from '../animation';
import { createDocument } from '../document';
import { BUILTIN_FONT, createUserFont } from '../font/font';
import { DocumentFormatError, deserialize, serialize, toFileObject } from '../serialization';
import v12 from './fixtures/v12-scene3d-cloud.bp.json?raw';
import { buildTtf, square } from './helpers/ttf';

const ttf = buildTtf({
  unitsPerEm: 2048,
  ascender: 1536,
  descender: -512,
  advance: 1024,
  glyphs: [{ code: 0x41, points: square(0, 0, 128) }],
});

const withFont = (font = createUserFont('VGA 8x16', 'vector', ttf, 8, 16)) => ({
  ...createAnimation(createDocument({ width: 4, height: 2 })),
  font,
});

describe('шрифт в файле', () => {
  it('встроенный пишется строкой, как в прошлых версиях', () => {
    const anim = withFont(BUILTIN_FONT);
    expect(toFileObject(anim).font).toBe('press-start-2p');
    expect(deserialize(serialize(anim)).font).toBe(BUILTIN_FONT);
  });

  it('свой шрифт — целиком в файле, ячейка и отпечаток переживают сохранение', () => {
    const anim = withFont();
    const file = toFileObject(anim).font;
    expect(file).toMatchObject({ name: 'VGA 8x16', kind: 'vector', cellWidth: 8, cellHeight: 16 });
    const back = deserialize(serialize(anim)).font;
    expect(back).toMatchObject({ id: anim.font.id, kind: 'vector', cellWidth: 8, cellHeight: 16 });
    expect([...(back.data as Uint8Array)]).toEqual([...ttf]);
  });

  it('файлы до версии 13 открываются со встроенным шрифтом', () => {
    expect(deserialize(v12).font).toBe(BUILTIN_FONT);
  });

  it('данные не того вида и ячейка вне пределов — ошибка формата', () => {
    const file = JSON.parse(serialize(withFont())) as { font: Record<string, unknown> };
    const broken = (patch: Record<string, unknown>): string =>
      JSON.stringify({ ...file, font: { ...file.font, ...patch } });
    expect(() => deserialize(broken({ kind: 'tileset' }))).toThrow(DocumentFormatError);
    expect(() => deserialize(broken({ data: 'не base64' }))).toThrow(DocumentFormatError);
    expect(() => deserialize(broken({ cellWidth: 64, cellHeight: 8 }))).toThrow(
      DocumentFormatError,
    );
  });
});

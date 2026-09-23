import { describe, expect, it } from 'vitest';
import { createAnimation, frameDocument } from '../../../core/animation';
import { createDocument } from '../../../core/document';
import { getCell } from '../../../core/grid';
import { serialize } from '../../../core/serialization';
import { baseName, gunzip, readDocument } from '../readDocument';

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** .xp в один слой 1×1: «@» красным на чёрном. */
function tinyXp(): Uint8Array {
  const buffer = new ArrayBuffer(4 * 4 + 4 + 6);
  const view = new DataView(buffer);
  [-1, 1, 1, 1, 64].forEach((v, i) => view.setInt32(i * 4, v, true));
  new Uint8Array(buffer).set([255, 0, 0, 0, 0, 0], 20);
  return new Uint8Array(buffer);
}

const text = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

describe('readDocument', () => {
  it('gzip узнаётся как .xp REXPaint и распаковывается', async () => {
    const read = await readDocument(await gzip(tinyXp()), 'dungeon.xp');
    expect(read.kind).toBe('rexpaint');
    const doc = frameDocument(read.animation, 0);
    expect(doc.name).toBe('dungeon');
    expect(getCell(doc.layers[0].cells, 0, 0)).toEqual({
      glyph: '@',
      fg: '#ff0000',
      bg: '#000000',
    });
  });

  it('JSON-массив — файл первого прототипа, даже если он назван .json', async () => {
    const proto = [{ layers: [{ data: [['1,1', { char: '#', color: '#ffffff' }]] }] }];
    const read = await readDocument(text(proto), 'sketch.json');
    expect(read.kind).toBe('prototype');
    expect(getCell(frameDocument(read.animation, 0).layers[0].cells, 1, 1)?.glyph).toBe('#');
  });

  it('JSON-объект — наш формат, как и раньше', async () => {
    const own = serialize(createAnimation(createDocument({ name: 'mine', width: 4, height: 4 })));
    const read = await readDocument(new TextEncoder().encode(own), 'mine.bp.json');
    expect(read.kind).toBe('bytefall');
    expect(read.animation.name).toBe('mine');
  });

  it('непонятный файл — понятная ошибка', async () => {
    await expect(readDocument(new Uint8Array([1, 2, 3]), 'x.bin')).rejects.toThrow(/не \.xp/);
  });

  it('распаковка обрывается на пределе: gzip-бомба не съест память', async () => {
    const packed = await gzip(new Uint8Array(1024 * 1024));
    expect(packed.length).toBeLessThan(10 * 1024);
    await expect(gunzip(packed, 1000)).rejects.toThrow(/слишком большой/);
    expect((await gunzip(packed, 2 * 1024 * 1024)).length).toBe(1024 * 1024);
  });
});

describe('baseName', () => {
  it('убирает известные расширения', () => {
    expect(baseName('map.xp')).toBe('map');
    expect(baseName('art.bp.json')).toBe('art');
    expect(baseName('old.json')).toBe('old');
    expect(baseName('.xp')).toBe('Без названия');
  });
});

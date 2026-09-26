import { describe, expect, it } from 'vitest';
import { fromUtf8, utf8 } from '../utf8';
import { crc32, writeZip } from '../zip';

/** Записи архива, прочитанные по центральному каталогу, как их читает любой архиватор. */
function readZip(zip: Uint8Array): { name: string; data: Uint8Array; crc: number }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    out.push({ name, data: zip.subarray(start, start + size), crc });
    at += 46 + nameLength;
  }
  return out;
}

describe('ZIP без сжатия', () => {
  it('CRC32 совпадает с эталонным', () => {
    expect(crc32(utf8('hello'))).toBe(0x3610a686);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('записи читаются обратно с именами, данными и контрольными суммами', () => {
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const zip = writeZip(
      [
        { name: 'кадр-0.png', data: png },
        { name: 'atlas.json', data: utf8('{"frames":[]}') },
      ],
      new Date(2026, 8, 26, 12, 30, 10),
    );
    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['кадр-0.png', 'atlas.json']);
    expect([...entries[0].data]).toEqual([...png]);
    expect(entries[1].crc).toBe(crc32(utf8('{"frames":[]}')));
  });

  it('UTF-8 кодирует все плоскости Юникода и читается обратно', () => {
    expect([...utf8('Aя€😀')]).toEqual([
      0x41, 0xd1, 0x8f, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80,
    ]);
    expect(fromUtf8(utf8('Aя€😀 «█»'))).toBe('Aя€😀 «█»');
    expect(fromUtf8(new Uint8Array([0x41, 0xd1]))).toBe('A�');
  });
});

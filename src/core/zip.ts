/**
 * ZIP-архив без сжатия: экспорт из нескольких файлов — лист спрайтов с атласом, кадры PNG —
 * уходит одним файлом. PNG уже сжат, поэтому метод «хранить» ничего не теряет, а писатель
 * укладывается в сотню строк без зависимости.
 */
import { utf8 } from './utf8';

export interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Время и дата в формате DOS: с точностью до двух секунд, с 1980 года. */
function dosStamp(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const UTF8_FLAG = 0x0800;

/** Заголовок записи: поля по порядку, 16- и 32-битные, младшим байтом вперёд. */
function header(fields: readonly (readonly [number, 2 | 4])[], name: Uint8Array): Uint8Array {
  const size = fields.reduce((sum, [, width]) => sum + width, 0);
  const out = new Uint8Array(size + name.length);
  const view = new DataView(out.buffer);
  let at = 0;
  for (const [value, width] of fields) {
    if (width === 2) view.setUint16(at, value, true);
    else view.setUint32(at, value >>> 0, true);
    at += width;
  }
  out.set(name, at);
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Архив из записей в заданном порядке. `modified` — время файлов, у всех одно. */
export function writeZip(entries: readonly ZipEntry[], modified: Date): Uint8Array {
  const { time, date } = dosStamp(modified);
  const body: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = utf8(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const common = [
      [UTF8_FLAG, 2],
      [0, 2],
      [time, 2],
      [date, 2],
      [crc, 4],
      [size, 4],
      [size, 4],
      [name.length, 2],
      [0, 2],
    ] as const;
    const local = header([[0x04034b50, 4], [20, 2], ...common], name);
    body.push(local, entry.data);
    central.push(
      header(
        [[0x02014b50, 4], [20, 2], [20, 2], ...common, [0, 2], [0, 2], [0, 2], [0, 4], [offset, 4]],
        name,
      ),
    );
    offset += local.length + size;
  }
  const directory = concat(central);
  const end = header(
    [
      [0x06054b50, 4],
      [0, 2],
      [0, 2],
      [entries.length, 2],
      [entries.length, 2],
      [directory.length, 4],
      [offset, 4],
      [0, 2],
    ],
    new Uint8Array(0),
  );
  return concat([...body, directory, end]);
}

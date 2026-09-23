import type { Cell } from '../../cell';
import { type CellKey, keyOf } from '../../grid';
import type { RgbaImage } from '../../quantize';

type Pixel = readonly [number, number, number, number];

/** Картинка из функции пикселя: синтетические картинки воспроизводимы и не лежат файлами. */
export function makeImage(width: number, height: number, pixel: (x: number, y: number) => Pixel) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { width, height, data } satisfies RgbaImage;
}

/** Горизонтальный градиент от чёрного к белому. */
export const gradient = (width: number, height: number) =>
  makeImage(width, height, (x) => {
    const v = Math.round((x / (width - 1)) * 255);
    return [v, v, v, 255];
  });

/** Белый круг на чёрном. */
export const disk = (size: number) =>
  makeImage(size, size, (x, y) => {
    const r = size * 0.35;
    const inside = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) <= r;
    return inside ? [255, 255, 255, 255] : [0, 0, 0, 255];
  });

/** Сетка символов как текст: пустая ячейка — пробел. Для золотых снимков. */
export function cellsToText(cells: ReadonlyMap<CellKey, Cell>, width: number, height: number) {
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) row += cells.get(keyOf(x, y))?.glyph || ' ';
    rows.push(row.replace(/\s+$/, ''));
  }
  return `${rows.join('\n')}\n`;
}

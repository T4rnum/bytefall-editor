import type { CellBuffer } from './cellBuffer';

/** Кадр как обычный текст: пустые ячейки становятся пробелами, хвостовые пробелы срезаются. */
export function bufferToText(buffer: CellBuffer): string {
  const rows: string[] = [];
  for (let y = 0; y < buffer.height; y++) {
    let row = '';
    for (let x = 0; x < buffer.width; x++) {
      row += buffer.glyphs[y * buffer.width + x] || ' ';
    }
    rows.push(row.replace(/\s+$/, ''));
  }
  return rows.join('\n');
}

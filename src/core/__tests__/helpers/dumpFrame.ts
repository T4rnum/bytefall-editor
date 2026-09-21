import type { CellBuffer } from '../../compositor';

/** Компонента Float32 0..1 как двузначный hex: снимок не должен зависеть от точности float. */
function byte(value: number): string {
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, '0');
}

function rgba(arr: Float32Array, index: number): string {
  const o = index * 4;
  return `${byte(arr[o])}${byte(arr[o + 1])}${byte(arr[o + 2])}${byte(arr[o + 3])}`;
}

const TRANSPARENT = '00000000';

/**
 * Кадр как построчный текст для золотых снимков: по строке на непустую ячейку.
 * Формат нарочно многословный — в диффе сразу видно, какая ячейка и что именно изменила.
 */
export function dumpFrame(buffer: CellBuffer): string {
  const lines: string[] = [`${buffer.width}x${buffer.height}`];
  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      const i = y * buffer.width + x;
      const glyph = buffer.glyphs[i];
      const fg = rgba(buffer.fg, i);
      const bg = rgba(buffer.bg, i);
      if (glyph === '' && bg === TRANSPARENT) continue;
      lines.push(`${x},${y} '${glyph}' fg=${fg} bg=${bg}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

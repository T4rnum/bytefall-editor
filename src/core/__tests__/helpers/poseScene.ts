import type { Rgba } from '../../color';
import { keyOf } from '../../grid';
import type { GlyphMaterial } from '../../material';

/** Поза символа для снимков: то же, что `GlyphPose`, без привязки к модулю, где она живёт. */
export interface DumpPose {
  readonly key: number;
  readonly particle: number | null;
  readonly glyph: string;
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  readonly sx: number;
  readonly sy: number;
  readonly fg: Rgba;
  readonly bg: Rgba;
  readonly material: GlyphMaterial | null;
}

const CLEAR: Rgba = { r: 0, g: 0, b: 0, a: 0 };

/**
 * Две строки по шесть символов разного цвета и яркости: у волны, изгиба и градиента есть что
 * двигать и красить, у палочки яркости — из чего выбирать. Центр содержимого — (3, 1).
 */
export function poseRows(): DumpPose[] {
  const out: DumpPose[] = [];
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 6; x++) {
      const v = (x + 1) / 6;
      out.push({
        key: keyOf(x, y),
        particle: null,
        glyph: y === 0 ? 'ABCDEF'[x] : 'abcdef'[x],
        x: x + 0.5,
        y: y + 0.5,
        rot: 0,
        sx: 1,
        sy: 1,
        fg: { r: v, g: 1 - v, b: y === 0 ? 0.25 : 0.75, a: 1 },
        bg: x === 2 ? { r: 0.1, g: 0.2, b: 0.3, a: 1 } : CLEAR,
        material: null,
      });
    }
  }
  return out;
}

export const ROWS_CENTER = { x: 3, y: 1 };

const num = (v: number): string => {
  const r = Math.round(v * 1e6) / 1e6;
  return (r === 0 ? 0 : r).toFixed(6);
};

const color = (c: Rgba): string => [c.r, c.g, c.b, c.a].map(num).join(',');

/** Позы строками: поле за полем, числа округлены до миллионных, чтобы шум float не мешал. */
export function dumpPoses(poses: readonly DumpPose[]): string {
  return poses
    .map((p) =>
      [
        p.key,
        p.particle ?? '-',
        p.glyph,
        num(p.x),
        num(p.y),
        num(p.rot),
        num(p.sx),
        num(p.sy),
        color(p.fg),
        color(p.bg),
      ].join(' '),
    )
    .join('\n');
}

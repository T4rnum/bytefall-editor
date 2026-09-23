import type { GlyphCoverage } from '../thumbnail';

/**
 * Рампа — символы от пустого к самому плотному: яркость ячейки выбирает, какой из них встанет.
 * Первым обычно идёт пробел: самая тёмная ячейка остаётся пустой.
 */
export interface RampPreset {
  readonly id: string;
  readonly label: string;
  readonly glyphs: string;
}

export const RAMP_PRESETS: readonly RampPreset[] = [
  { id: 'classic', label: 'Классика', glyphs: ' .:-=+*#%@' },
  {
    id: 'detailed',
    label: 'Подробная',
    glyphs: ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
  },
  { id: 'dots', label: 'Точки', glyphs: ' .:*' },
  { id: 'hatch', label: 'Штрихи', glyphs: ' -=#' },
];

/** Печатные символы ASCII: из них рампа строится по настоящей плотности шрифта. */
export const PRINTABLE_ASCII = Array.from({ length: 95 }, (_, i) =>
  String.fromCharCode(32 + i),
).join('');

/**
 * Рампа по плотности самого шрифта: символы сортируются по доле закраски, и на каждую из
 * `levels` ступеней берётся символ с ближайшей плотностью. Ступени идут равномерно по чернилам,
 * а не по номеру символа: так яркость на экране растёт ровно, без провалов и скачков.
 */
export function rampFromCoverage(
  candidates: string,
  coverage: GlyphCoverage,
  levels: number,
): string {
  const measured = [...new Set(candidates)]
    .map((glyph) => ({ glyph, ink: glyph === ' ' ? 0 : coverage(glyph) }))
    .sort((a, b) => a.ink - b.ink || a.glyph.localeCompare(b.glyph));
  if (measured.length === 0) return ' ';
  const max = measured[measured.length - 1].ink;
  const picked: string[] = [];
  for (let level = 0; level < Math.max(2, levels); level++) {
    const target = (max * level) / (Math.max(2, levels) - 1);
    let best = measured[0];
    for (const m of measured) {
      if (Math.abs(m.ink - target) < Math.abs(best.ink - target)) best = m;
    }
    if (picked[picked.length - 1] !== best.glyph) picked.push(best.glyph);
  }
  return picked.join('');
}

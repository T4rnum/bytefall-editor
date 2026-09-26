import { type CellBuffer, readRgba } from './cellBuffer';
import type { Rgba } from './color';
import type { ComposedFrame } from './frame';
import { readInstance } from './instances';

/**
 * Символ для рантайма игрового движка (DESIGN.md, раздел 7, уровень 2): центр в ячейках, поворот
 * в радианах, масштаб, символ и два цвета. Больше рантайму знать нечего: он рисует квадрат фона
 * и квадрат символа из атласа.
 */
export interface RuntimeGlyph {
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  readonly sx: number;
  readonly sy: number;
  /** Пустая строка — ячейка только с фоном. */
  readonly glyph: string;
  readonly fg: Rgba;
  readonly bg: Rgba;
}

export interface RuntimeFrame {
  /** Сколько показывать кадр, мс. */
  readonly duration: number;
  /** Символы в порядке отрисовки: следующий рисуется поверх предыдущего. */
  readonly glyphs: readonly RuntimeGlyph[];
}

/** Ячейки прохода: только те, где есть символ или видимый фон, по строкам. */
function cellGlyphs(buf: CellBuffer, out: RuntimeGlyph[]): void {
  for (let i = 0; i < buf.glyphs.length; i++) {
    const glyph = buf.glyphs[i];
    const bg = readRgba(buf.bg, i);
    if (glyph === '' && bg.a <= 0) continue;
    const fg = readRgba(buf.fg, i);
    const x = (i % buf.width) + 0.5;
    const y = Math.floor(i / buf.width) + 0.5;
    out.push({ x, y, rot: 0, sx: 1, sy: 1, glyph, fg, bg });
  }
}

/**
 * Кадр для рантайма из вычисленного кадра — того же, что рисует экран: проходы ячеек и потоки
 * свободных символов идут по порядку. Материал в первую версию не входит: рантайм рисует символ
 * и фон, без свечения и контура.
 */
export function runtimeFrame(frame: ComposedFrame, duration: number): RuntimeFrame {
  const glyphs: RuntimeGlyph[] = [];
  for (const pass of frame.passes) {
    if (pass.kind === 'cells') {
      cellGlyphs(pass.buffer, glyphs);
      continue;
    }
    for (let i = 0; i < pass.batch.count; i++) {
      const { x, y, rot, sx, sy, glyph, fg, bg } = readInstance(pass.batch, i);
      if (glyph === '' && bg.a <= 0) continue;
      glyphs.push({ x, y, rot, sx, sy, glyph, fg, bg });
    }
  }
  return { duration, glyphs };
}

/** Все символы кадров по первому появлению: из них собирается атлас. */
export function usedGlyphs(frames: readonly RuntimeFrame[]): string[] {
  const seen = new Set<string>();
  for (const frame of frames) for (const g of frame.glyphs) if (g.glyph !== '') seen.add(g.glyph);
  return [...seen];
}

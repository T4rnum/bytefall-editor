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

const sameColor = (a: Rgba, b: Rgba): boolean =>
  a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;

const sameGlyph = (a: RuntimeGlyph, b: RuntimeGlyph): boolean =>
  a.x === b.x &&
  a.y === b.y &&
  a.rot === b.rot &&
  a.sx === b.sx &&
  a.sy === b.sy &&
  a.glyph === b.glyph &&
  sameColor(a.fg, b.fg) &&
  sameColor(a.bg, b.bg);

const sameFrame = (a: RuntimeFrame, b: RuntimeFrame): boolean =>
  a.glyphs.length === b.glyphs.length && a.glyphs.every((g, i) => sameGlyph(g, b.glyphs[i]));

/**
 * Склеивает одинаковые кадры подряд в один с общей длительностью: сцена, которая замерла после
 * движения, не повторяет один и тот же кадр на каждом такте частоты.
 */
export function mergeRepeats(frames: readonly RuntimeFrame[]): RuntimeFrame[] {
  const out: RuntimeFrame[] = [];
  for (const frame of frames) {
    const last = out[out.length - 1];
    if (last && sameFrame(last, frame)) {
      out[out.length - 1] = { ...last, duration: last.duration + frame.duration };
    } else {
      out.push(frame);
    }
  }
  return out;
}

/** Все символы кадров по первому появлению: из них собирается атлас. */
export function usedGlyphs(frames: readonly RuntimeFrame[]): string[] {
  const seen = new Set<string>();
  for (const frame of frames) for (const g of frame.glyphs) if (g.glyph !== '') seen.add(g.glyph);
  return [...seen];
}

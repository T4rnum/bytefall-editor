import { type CellBuffer, readRgba } from './cellBuffer';
import type { Rgba } from './color';
import type { ComposedFrame } from './frame';
import { type GlyphBatch, readInstance } from './instances';
import { MATERIAL } from './material';

/**
 * Символ для рантайма игрового движка (DESIGN.md, раздел 7, уровень 2): центр в ячейках, поворот
 * в радианах, масштаб, символ, два цвета и материал. Рантайм рисует квадрат фона и квадрат
 * символа из атласа, а материал — своим шейдером, повторяющим `render/instanceShader.ts`.
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
  /** Числа материала в раскладке `MATERIAL` или null — символ без материала. */
  readonly material: readonly number[] | null;
  /**
   * Подложка: контур и свечение символа. Подложки прохода идут перед его символами, как слой
   * `UNDER` в шейдере редактора: иначе свечение позднего символа легло бы на ранний.
   */
  readonly under: boolean;
}

export interface RuntimeFrame {
  /** Момент сцены, мс: по нему бежит блик. */
  readonly time: number;
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
    out.push({ x, y, rot: 0, sx: 1, sy: 1, glyph, fg, bg, material: null, under: false });
  }
}

/** Есть ли у материала подложка: контур или свечение. */
export const hasUnderlay = (material: readonly number[] | null): boolean =>
  material !== null && (material[MATERIAL.outline + 3] > 0 || material[MATERIAL.glow + 3] > 0);

/** Поток символов прохода: сначала подложки, затем сами символы. */
function batchGlyphs(batch: GlyphBatch, out: RuntimeGlyph[]): void {
  const main: RuntimeGlyph[] = [];
  for (let i = 0; i < batch.count; i++) {
    const { x, y, rot, sx, sy, glyph, fg, bg, material: m } = readInstance(batch, i);
    if (glyph === '' && bg.a <= 0) continue;
    const material = m.some((v) => v !== 0) ? m : null;
    const g = { x, y, rot, sx, sy, glyph, fg, bg, material, under: false };
    if (glyph !== '' && hasUnderlay(material)) out.push({ ...g, under: true });
    main.push(g);
  }
  for (const g of main) out.push(g);
}

/**
 * Кадр для рантайма из вычисленного кадра — того же, что рисует экран: проходы ячеек и потоки
 * свободных символов идут по порядку. Постэффекты сюда не входят.
 */
export function runtimeFrame(frame: ComposedFrame, duration: number): RuntimeFrame {
  const glyphs: RuntimeGlyph[] = [];
  for (const pass of frame.passes) {
    if (pass.kind === 'cells') cellGlyphs(pass.buffer, glyphs);
    else batchGlyphs(pass.batch, glyphs);
  }
  return { time: frame.time, duration, glyphs };
}

const sameColor = (a: Rgba, b: Rgba): boolean =>
  a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;

const sameMaterial = (a: readonly number[] | null, b: readonly number[] | null): boolean =>
  a === b || (a !== null && b !== null && a.every((v, i) => v === b[i]));

const sameGlyph = (a: RuntimeGlyph, b: RuntimeGlyph): boolean =>
  a.x === b.x &&
  a.y === b.y &&
  a.rot === b.rot &&
  a.sx === b.sx &&
  a.sy === b.sy &&
  a.glyph === b.glyph &&
  a.under === b.under &&
  sameColor(a.fg, b.fg) &&
  sameColor(a.bg, b.bg) &&
  sameMaterial(a.material, b.material);

/** Бегущий блик меняет картинку и без движения символов. */
const runningShine = (g: RuntimeGlyph): boolean =>
  g.material !== null &&
  g.material[MATERIAL.shine + 3] > 0 &&
  g.material[MATERIAL.shineMotion + 1] !== 0;

const sameFrame = (a: RuntimeFrame, b: RuntimeFrame): boolean =>
  a.glyphs.length === b.glyphs.length &&
  a.glyphs.every((g, i) => sameGlyph(g, b.glyphs[i])) &&
  !a.glyphs.some(runningShine);

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

import type { Cell } from './cell';
import { clamp01, parseHex, toHex } from './color';
import { newId } from './document';
import { type CellGrid, type CellKey, keyOf, xOf, yOf } from './grid';

/**
 * Эффекты уровня ячеек: чистые функции «сетка ячеек и время → сетка ячеек». Живут на слое,
 * ничего не меняют в документе и вычисляются композитором при каждом кадре.
 */
export type EffectKind = 'pulse' | 'wave' | 'flicker' | 'scroll' | 'cycle' | 'fire';
export type FirePalette = 'fire' | 'ice' | 'toxic';

interface EffectCommon {
  readonly id: string;
  readonly kind: EffectKind;
  readonly enabled: boolean;
}

/** Яркость колеблется во времени; spread сдвигает фазу по X, давая бегущую волну света. */
export interface PulseEffect extends EffectCommon {
  readonly kind: 'pulse';
  readonly period: number;
  readonly amplitude: number;
  readonly spread: number;
}

/** Ячейки качаются по вертикали синусоидой. */
export interface WaveEffect extends EffectCommon {
  readonly kind: 'wave';
  readonly period: number;
  readonly amplitude: number;
  readonly wavelength: number;
}

/** Случайные ячейки гаснут на один тик. */
export interface FlickerEffect extends EffectCommon {
  readonly kind: 'flicker';
  readonly period: number;
  readonly density: number;
}

/** Содержимое едет с постоянной скоростью в ячейках в секунду. */
export interface ScrollEffect extends EffectCommon {
  readonly kind: 'scroll';
  readonly dx: number;
  readonly dy: number;
  readonly wrap: boolean;
}

/** Символы перебираются по строке; spread сдвигает шаг по позиции. */
export interface CycleEffect extends EffectCommon {
  readonly kind: 'cycle';
  readonly glyphs: string;
  readonly period: number;
  readonly spread: number;
}

/** Пламя поднимается от верхней кромки содержимого. */
export interface FireEffect extends EffectCommon {
  readonly kind: 'fire';
  readonly height: number;
  readonly period: number;
  readonly palette: FirePalette;
  readonly glyphs: string;
}

export type LayerEffect =
  PulseEffect | WaveEffect | FlickerEffect | ScrollEffect | CycleEffect | FireEffect;

export interface EffectContext {
  /** Миллисекунды от начала проигрывания. */
  readonly time: number;
  readonly width: number;
  readonly height: number;
}

export const MAX_EFFECTS_PER_LAYER = 8;

export const EFFECT_KINDS: readonly { readonly kind: EffectKind; readonly label: string }[] = [
  { kind: 'pulse', label: 'Pulse' },
  { kind: 'wave', label: 'Wave' },
  { kind: 'flicker', label: 'Flicker' },
  { kind: 'scroll', label: 'Scroll' },
  { kind: 'cycle', label: 'Glyph cycle' },
  { kind: 'fire', label: 'Fire' },
];

export const FIRE_PALETTES: Record<FirePalette, readonly string[]> = {
  fire: ['#4a0f0f', '#8a1c0a', '#c2410c', '#ea7a1a', '#f5b942', '#fde68a', '#fff7d6'],
  ice: ['#0b1f4a', '#123c7a', '#1d5fb0', '#3b8ae0', '#7cc4ff', '#c7e8ff', '#f0faff'],
  toxic: ['#0f2d12', '#1d5a1a', '#2f8a24', '#4fc22e', '#8ff05a', '#ccff99', '#f2ffe6'],
};

export interface EffectByKind {
  readonly pulse: PulseEffect;
  readonly wave: WaveEffect;
  readonly flicker: FlickerEffect;
  readonly scroll: ScrollEffect;
  readonly cycle: CycleEffect;
  readonly fire: FireEffect;
}

const DEFAULTS: { readonly [K in EffectKind]: (id: string) => EffectByKind[K] } = {
  pulse: (id) => ({ id, enabled: true, kind: 'pulse', period: 1200, amplitude: 0.5, spread: 0.4 }),
  wave: (id) => ({ id, enabled: true, kind: 'wave', period: 1500, amplitude: 1, wavelength: 8 }),
  flicker: (id) => ({ id, enabled: true, kind: 'flicker', period: 120, density: 0.15 }),
  scroll: (id) => ({ id, enabled: true, kind: 'scroll', dx: 4, dy: 0, wrap: true }),
  cycle: (id) => ({ id, enabled: true, kind: 'cycle', glyphs: '|/-\\', period: 120, spread: 0 }),
  fire: (id) => ({
    id,
    enabled: true,
    kind: 'fire',
    height: 6,
    period: 90,
    palette: 'fire',
    glyphs: '.:*#%@',
  }),
};

/** Эффект с настройками по умолчанию, типизированный по виду. */
export function createEffect<K extends EffectKind>(
  kind: K,
  id: string = newId('fx'),
): EffectByKind[K] {
  return DEFAULTS[kind](id);
}

const TAU = Math.PI * 2;

/** Детерминированный шум 0..1 от целых аргументов: одно и то же время даёт одну и ту же картинку. */
export function hashNoise(x: number, y: number, t: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(t, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function scaleHex(hex: string, factor: number): string {
  const c = parseHex(hex);
  return toHex({
    r: clamp01(c.r * factor),
    g: clamp01(c.g * factor),
    b: clamp01(c.b * factor),
    a: c.a,
  });
}

function applyPulse(cells: CellGrid, fx: PulseEffect, ctx: EffectContext): CellGrid {
  const phase = TAU * (ctx.time / Math.max(1, fx.period));
  const out = new Map<CellKey, Cell>();
  for (const [key, cell] of cells) {
    const factor = 1 + fx.amplitude * Math.sin(phase + fx.spread * xOf(key));
    out.set(key, {
      ...cell,
      fg: scaleHex(cell.fg, factor),
      bg: cell.bg === null ? null : scaleHex(cell.bg, factor),
    });
  }
  return out;
}

function applyWave(cells: CellGrid, fx: WaveEffect, ctx: EffectContext): CellGrid {
  const phase = TAU * (ctx.time / Math.max(1, fx.period));
  const wavelength = Math.max(1, fx.wavelength);
  const out = new Map<CellKey, Cell>();
  for (const [key, cell] of cells) {
    const x = xOf(key);
    const y = yOf(key) + Math.round(fx.amplitude * Math.sin(TAU * (x / wavelength) + phase));
    if (y >= 0 && y < ctx.height) out.set(keyOf(x, y), cell);
  }
  return out;
}

function applyFlicker(cells: CellGrid, fx: FlickerEffect, ctx: EffectContext): CellGrid {
  const tick = Math.floor(ctx.time / Math.max(1, fx.period));
  const out = new Map<CellKey, Cell>();
  for (const [key, cell] of cells) {
    if (hashNoise(xOf(key), yOf(key), tick) >= fx.density) out.set(key, cell);
  }
  return out;
}

function applyScroll(cells: CellGrid, fx: ScrollEffect, ctx: EffectContext): CellGrid {
  const ox = Math.round((fx.dx * ctx.time) / 1000);
  const oy = Math.round((fx.dy * ctx.time) / 1000);
  if (ox === 0 && oy === 0) return cells;
  const out = new Map<CellKey, Cell>();
  for (const [key, cell] of cells) {
    let x = xOf(key) + ox;
    let y = yOf(key) + oy;
    if (fx.wrap) {
      x = ((x % ctx.width) + ctx.width) % ctx.width;
      y = ((y % ctx.height) + ctx.height) % ctx.height;
    } else if (x < 0 || y < 0 || x >= ctx.width || y >= ctx.height) {
      continue;
    }
    out.set(keyOf(x, y), cell);
  }
  return out;
}

function applyCycle(cells: CellGrid, fx: CycleEffect, ctx: EffectContext): CellGrid {
  const glyphs = [...fx.glyphs];
  if (glyphs.length === 0) return cells;
  const step = Math.floor(ctx.time / Math.max(1, fx.period));
  const out = new Map<CellKey, Cell>();
  for (const [key, cell] of cells) {
    if (cell.glyph === '') {
      out.set(key, cell);
      continue;
    }
    const offset = step + Math.round(fx.spread * (xOf(key) + yOf(key)));
    const index = ((offset % glyphs.length) + glyphs.length) % glyphs.length;
    out.set(key, { ...cell, glyph: glyphs[index] });
  }
  return out;
}

/**
 * Огонь без состояния: каждая ячейка верхней кромки испускает язык пламени, жар падает с
 * высотой и дрожит от шума, поэтому кадр зависит только от времени и легко экспортируется.
 */
function applyFire(cells: CellGrid, fx: FireEffect, ctx: EffectContext): CellGrid {
  const ramp = [...fx.glyphs];
  if (ramp.length === 0) return cells;
  const palette = FIRE_PALETTES[fx.palette];
  const tick = Math.floor(ctx.time / Math.max(1, fx.period));
  const height = Math.max(1, fx.height);
  const heat = new Map<CellKey, number>();
  for (const key of cells.keys()) {
    const x = xOf(key);
    const y = yOf(key);
    if (y > 0 && cells.has(keyOf(x, y - 1))) continue;
    for (let d = 1; d <= height; d++) {
      const ny = y - d;
      if (ny < 0) break;
      const nx = x + Math.round(hashNoise(x, ny, tick) * 2 - 1);
      if (nx < 0 || nx >= ctx.width) continue;
      const value = 1 - d / (height + 1) - hashNoise(nx, ny, tick + 7) * 0.45;
      if (value <= 0.05) continue;
      const k = keyOf(nx, ny);
      heat.set(k, Math.max(heat.get(k) ?? 0, value));
    }
  }
  if (heat.size === 0) return cells;
  const out = new Map(cells);
  for (const [key, value] of heat) {
    if (cells.has(key)) continue;
    const glyph = ramp[Math.min(ramp.length - 1, Math.floor(value * ramp.length))];
    const fg = palette[Math.min(palette.length - 1, Math.floor(value * palette.length))];
    out.set(key, { glyph, fg, bg: null });
  }
  return out;
}

export function applyEffect(cells: CellGrid, effect: LayerEffect, ctx: EffectContext): CellGrid {
  switch (effect.kind) {
    case 'pulse':
      return applyPulse(cells, effect, ctx);
    case 'wave':
      return applyWave(cells, effect, ctx);
    case 'flicker':
      return applyFlicker(cells, effect, ctx);
    case 'scroll':
      return applyScroll(cells, effect, ctx);
    case 'cycle':
      return applyCycle(cells, effect, ctx);
    case 'fire':
      return applyFire(cells, effect, ctx);
  }
}

/** Применяет включённые эффекты по порядку. Без эффектов возвращает исходную сетку. */
export function applyEffects(
  cells: CellGrid,
  effects: readonly LayerEffect[],
  ctx: EffectContext,
): CellGrid {
  let out = cells;
  for (const effect of effects) if (effect.enabled) out = applyEffect(out, effect, ctx);
  return out;
}

export const hasActiveEffects = (effects: readonly LayerEffect[]): boolean =>
  effects.some((e) => e.enabled);

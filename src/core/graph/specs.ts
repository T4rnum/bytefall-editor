import type { InputSpec, NumberSource, OutputSpec, GlyphPose } from './types';

/** Числовой вход: значение по умолчанию и пределы для поля, файла и ключей. */
export const numIn = (
  name: string,
  label: string,
  def: number,
  min: number,
  max: number,
  integer?: boolean,
): InputSpec => ({ name, label, type: 'number', default: def, min, max, integer });

export const glyphsIn = (name = 'glyphs', label = 'Символы'): InputSpec => ({
  name,
  label,
  type: 'glyphs',
});

export const numOut = (name: string, label: string): OutputSpec => ({
  name,
  label,
  type: 'number',
});

export const glyphsOut = (name = 'glyphs', label = 'Символы'): OutputSpec => ({
  name,
  label,
  type: 'glyphs',
});

/** Период, мс: 0 — не меняется со временем. */
export const PERIOD_MAX = 600000;
/** Длина в ячейках: волна, градиент, радиус. */
export const LENGTH_MIN = 0.5;
export const LENGTH_MAX = 2048;
/** Предел свободного числа: с запасом на всё, что бывает на холсте, но не бесконечность. */
export const FREE = 1e6;

/**
 * Число из чисел: если все постоянные — постоянное, иначе поле, которое считает их для символа.
 * Так граф без полей не платит за вызов функции на каждый символ.
 */
export function lift(
  fn: (...values: number[]) => number,
  ...sources: readonly NumberSource[]
): NumberSource {
  if (sources.every((s) => typeof s === 'number')) return fn(...(sources as number[]));
  const read = sources.map((s) => (typeof s === 'number' ? () => s : s));
  return (p: GlyphPose) => fn(...read.map((r) => r(p)));
}
